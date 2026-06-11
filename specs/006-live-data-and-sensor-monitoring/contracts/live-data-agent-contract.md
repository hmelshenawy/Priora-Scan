# Contract: Live Data — Desktop Agent Endpoints

**Service**: PrioraScan Backend
**Auth**: `X-Agent-Token` (existing Feature 004 mechanism; no new auth)
**Permission**: Agent-to-backend; tenant-scoped through the agent's existing `organizationId` binding.
**Source spec**: [spec.md](../spec.md) FR-019, FR-020
**Source plan**: [plan.md §4, §7](../plan.md)

This contract covers the new agent-side endpoints. The agent is the only process that holds the ELM327 connection; the backend never opens its own connection to the adapter. Polling is agent-initiated: the backend enqueues commands on the command queue, the agent executes them, and the agent pushes cycle results back.

All endpoints are under `/v2/obd/agents/:id/...` to preserve Feature 004's `/v1/.../scan-queue` contract. The Feature 004 endpoints continue to work unchanged.

---

## Common Headers

| Header | Required | Description |
|---|---|---|
| `X-Agent-Token: <token>` | yes | The agent's access token (obtained during Feature 004 pairing) |
| `Content-Type: application/json` | yes | JSON request body |

---

## `POST /v2/obd/agents/:id/command-queue`

Long-polls for the next command for the given agent. The backend returns the next pending command, or `204 No Content` if none. The agent polls this endpoint every 2 seconds when idle.

### Path Params

| Param | Type | Description |
|---|---|---|
| `id` | UUID | The Desktop Agent id |

### Request Body

```json
{
  "acceptVersions": ["v2"],
  "capabilities": {
    "liveData": true,
    "pidDiscovery": true,
    "maxConcurrentPids": 11
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `acceptVersions` | string[] | yes | List of API versions the agent understands. The backend only returns commands the agent can execute. |
| `capabilities` | object | no | Optional capability advertisement. The backend may use this to filter commands. |

### Response — 200 OK (command present)

```json
{
  "commandId": "cmd-uuid",
  "commandType": "LIVE_DATA_POLL",
  "enqueuedAt": "2026-06-11T12:34:56.789Z",
  "liveDataSessionId": "8b3a2b1c-...-...",
  "diagnosticSessionId": "a1b2c3...-...",
  "cadenceMs": 1000,
  "pids": ["0C", "0D", "05", "42", "11", "04", "06", "07", "10", "0F", "14"]
}
```

| Field | Type | Description |
|---|---|---|
| `cadenceMs` | integer | The **persisted** cadence from `LiveDataSession.cadenceMs`. **Default 1000 (1 s)**; clamped to `[200, 5000]`. The agent **must** use this value for its poll loop — it must not hardcode 1 s. |

#### `commandType` values

| Value | Payload | Description |
|---|---|---|
| `SCAN` | (Feature 004 payload) | Initiate a VIN + DTC scan |
| `LIVE_DATA_DISCOVERY` | `{ liveDataSessionId, diagnosticSessionId }` | Run PID discovery (PIDs 00/20/40/60/80/A0) |
| `LIVE_DATA_POLL` | `{ liveDataSessionId, diagnosticSessionId, cadenceMs, pids }` | Start or continue polling. `cadenceMs` is the **persisted** (clamped) value; the agent uses this value for the cycle delay. |
| `LIVE_DATA_STOP` | `{ liveDataSessionId, diagnosticSessionId }` | Stop polling |

### Response — 204 No Content (no command)

Empty body. The agent retries after 2 seconds.

### Response — 401 Unauthorized (invalid token)

```json
{
  "code": "AGENT_TOKEN_INVALID",
  "message": "The agent token is invalid or has been revoked."
}
```

### Behavior

- The agent MUST treat the response as the next command to execute. Commands are not durable; if the agent crashes mid-command, the next command is re-enqueued by the user (Start, Stop, etc.).
- The agent MUST send a heartbeat (Feature 004's `/obd/agents/:id/heartbeat`) at least every 30 seconds while it is connected.
- The agent MUST push cycle results to `/v2/obd/agents/:id/live-cycles` as they arrive; the backend uses the `commandId` to correlate the response.

---

## `POST /v2/obd/agents/:id/live-cycles`

Pushes a poll cycle's readings from the agent to the backend. The backend persists the most-recent reading per PID for the session and updates `lastPolledAt`.

### Path Params

| Param | Type | Description |
|---|---|---|
| `id` | UUID | The Desktop Agent id |

### Request Body

```json
{
  "commandId": "cmd-uuid",
  "liveDataSessionId": "8b3a2b1c-...-...",
  "cycleStartedAt": "2026-06-11T12:34:58.000Z",
  "cycleEndedAt": "2026-06-11T12:34:58.123Z",
  "readings": [
    { "pid": "0C", "rawValue": "12 38", "errorCode": null },
    { "pid": "0D", "rawValue": "00", "errorCode": null },
    { "pid": "05", "rawValue": "84", "errorCode": null },
    { "pid": "11", "rawValue": "00", "errorCode": "12" }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `commandId` | UUID | yes | The command this cycle is a response to |
| `liveDataSessionId` | UUID | yes | The session this cycle belongs to |
| `cycleStartedAt` | string (ISO 8601) | yes | When the cycle started (agent clock) |
| `cycleEndedAt` | string (ISO 8601) | yes | When the cycle ended (agent clock) |
| `readings` | object[] | yes | The PID readings. Length 0 is allowed (all PIDs returned errors). |
| `readings[].pid` | string | yes | Hex PID |
| `readings[].rawValue` | string | yes | Raw hex bytes, space-separated (e.g., `"12 38"`). Empty string for no-data. |
| `readings[].errorCode` | string \| null | yes | OBD-II error code, e.g., `"12"` for Service Not Supported. `null` if OK. |

### Response — 202 Accepted

```json
{
  "accepted": true,
  "cycleId": "cycle-uuid",
  "decoded": [
    { "pid": "0C", "value": 750, "name": "Engine RPM", "unit": "RPM" },
    { "pid": "0D", "value": 0, "name": "Vehicle Speed", "unit": "km/h" },
    { "pid": "05", "value": 92, "name": "Engine Coolant Temperature", "unit": "°C" }
  ]
}
```

The response includes the decoded values, but the agent is not required to use them; the dashboard fetches the canonical state from the web app's `GET /live-data/current` endpoint.

### Response — 404 Not Found

```json
{
  "code": "LIVE_DATA_SESSION_NOT_FOUND",
  "message": "Live data session not found, has been closed, or has been marked STALE (reconnect-after-30s)."
}
```

> **Reconnect behavior (Correction 4)**: this 404 is returned in three cases:
> 1. The session id does not exist.
> 2. The session has been explicitly stopped (`STOPPED`).
> 3. The session was marked `STALE` because the agent was disconnected for more than `LIVE_DATA_STALE_TIMEOUT_MS` (30 s) and a new `LiveDataSession` was created on the next `Start`. The agent must call `POST /sessions/:id/live-data/start` to obtain a new `liveDataSessionId`; it must **not** continue pushing cycles for the stale id.

### Response — 422 Unprocessable Entity (unknown PID)

```json
{
  "code": "PID_NOT_DEFINED",
  "message": "Reading for PID 'FF' is not defined.",
  "details": { "pid": "FF" }
}
```

### Idempotency

The endpoint is idempotent on `(commandId, cycleId)`. A duplicate push with the same `(commandId, cycleId)` is a no-op.

### Reconnect Behavior (Correction 4)

The agent may reconnect after a transient network drop. The recovery rules:

- **Reconnect within 30 s** (`LIVE_DATA_STALE_TIMEOUT_MS`): the existing `ACTIVE` `LiveDataSession` is **resumed**. The next `LIVE_DATA_POLL` command is enqueued with the **same `liveDataSessionId`**. The `LiveDataReadingCurrent` rows are kept.
- **Reconnect after 30 s**: the existing `ACTIVE` session is marked `STALE` in a single transaction. A new `LiveDataSession` is created on the next `POST /sessions/:id/live-data/start` call from the web. The agent must call `/start` itself? — **No**, the web calls `/start`; the agent receives the new `liveDataSessionId` in the next `command-queue` response. Cycles pushed for the STALE id are rejected with `LIVE_DATA_SESSION_NOT_FOUND`.

The 30-second window is the same as the `LiveDataSessionService.sweep()` window. The sweep runs every 30 s; any `ACTIVE` session with `lastPolledAt < now - 30 s` is marked `STALE`.

## Performance Targets

- Agent push: agent should send cycles as soon as they are read; p95 < 100 ms from cycle end to backend receipt.
- Backend processing: p95 < 50 ms to persist and respond.

---

## `POST /v2/obd/agents/:id/live-discovery`

Pushes the result of a PID discovery operation from the agent to the backend. The backend stores the supported-PID mask on the `LiveDataSession`.

### Path Params

| Param | Type | Description |
|---|---|---|
| `id` | UUID | The Desktop Agent id |

### Request Body

```json
{
  "commandId": "cmd-uuid",
  "liveDataSessionId": "8b3a2b1c-...-...",
  "discoveryStartedAt": "2026-06-11T12:34:50.000Z",
  "discoveryEndedAt": "2026-06-11T12:34:55.000Z",
  "supportedPids": ["0C", "0D", "05", "42", "11", "04", "06", "07", "10", "0F", "14"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `commandId` | UUID | yes | The command this discovery is a response to |
| `liveDataSessionId` | UUID | yes | The session this discovery belongs to |
| `discoveryStartedAt` | string (ISO 8601) | yes | |
| `discoveryEndedAt` | string (ISO 8601) | yes | |
| `supportedPids` | string[] | yes | The list of PIDs the ECU advertised support for. Empty list means "no PIDs supported" (still a valid response; the dashboard will show all as "Not supported"). |

### Response — 202 Accepted

```json
{
  "accepted": true,
  "supportedPidCount": 11
}
```

---

## Error Schema (common)

Same shape as the web app contract:

```json
{
  "code": "ERROR_CODE",
  "message": "...",
  "details": { ... }
}
```

| Code | HTTP | When |
|---|---|---|
| `AGENT_TOKEN_INVALID` | 401 | |
| `AGENT_NOT_FOUND` | 404 | |
| `LIVE_DATA_SESSION_NOT_FOUND` | 404 | |
| `PID_NOT_DEFINED` | 422 | Agent pushed a reading for an unknown PID |
| `INTERNAL_ERROR` | 500 | |

---

## Backward Compatibility

- The existing `/obd/agents/:id/heartbeat` and `/obd/agents/:id/scan-events` endpoints (Feature 004) continue to work unchanged.
- The existing `/obd/agents/:id/scan-queue` endpoint (Feature 004) is **deprecated** in favor of `/v2/obd/agents/:id/command-queue` but continues to return `SCAN` commands for agents that have not yet upgraded. The MVP does not require agents to upgrade; both endpoints coexist.
- The Desktop Agent's `command_queue.py` is updated to probe the new `/v2/...` endpoint first and fall back to `/v1/.../scan-queue` if the v2 endpoint returns 404.
