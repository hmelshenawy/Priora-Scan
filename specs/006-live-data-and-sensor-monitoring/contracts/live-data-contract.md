# Contract: Live Data — Web App Endpoints

**Service**: PrioraScan Backend
**Auth**: JWT (existing user session)
**Permission**: Inherits the existing DiagnosticSession read/write policy; no new permission is required.
**Source spec**: [spec.md](../spec.md) FR-006 … FR-018, FR-021 … FR-023
**Source plan**: [plan.md §4](../plan.md)

This contract covers the seven new web-app endpoints under `/sessions/:id/live-data/...`. The agent-side endpoints (`/v2/obd/agents/:id/...`) are documented separately in [live-data-agent-contract.md](live-data-agent-contract.md).

All endpoints are tenant-scoped through their parent `DiagnosticSession`. A user in tenant A cannot access a `LiveDataSession`, `LiveDataSnapshot`, or `LiveDataReading` for a Diagnostic Session in tenant B; the existing `TenantGuard` enforces this.

---

## Common Headers

| Header | Required | Description |
|---|---|---|
| `Authorization: Bearer <jwt>` | yes | Standard JWT |
| `Content-Type: application/json` | for POST/PATCH | JSON request body |

---

## `POST /sessions/:id/live-data/start`

Starts polling for the given Diagnostic Session. **Idempotent**: if a `LiveDataSession` is already `ACTIVE` and the agent has been continuously connected (no 30 s gap — see "Reconnect behavior" below), the existing session is resumed (no new session is created). If the previous ACTIVE session was marked `STALE` (reconnect-after-30 s), a new session is created and the `LIVE_DATA_POLL_STARTED` audit is written.

**Default cadence is 1 s (1000 ms)** (Correction 3). The cadence is clamped to `[200, 5000]`; the **clamped** value is persisted on `LiveDataSession.cadenceMs` and returned in the response. The agent reads the cadence from the `LIVE_DATA_POLL` command; the dashboard reads the cadence from the `Start` response.

### Path Params

| Param | Type | Description |
|---|---|---|
| `id` | UUID | The Diagnostic Session id |

### Request Body

```json
{
  "cadenceMs": 1000,
  "pids": ["0C", "0D", "05", "42", "11", "04", "06", "07", "10", "0F", "14"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `cadenceMs` | integer | no | Polling cadence in ms. **Default 1000 (1 s).** Clamped to `[200, 5000]`. |
| `pids` | string[] | no | PIDs to poll. Default: the standard MVP set. Must be valid PIDs known to the backend. |

### Response — 201 Created (new session) or 200 OK (resumed)

```json
{
  "id": "8b3a2b1c-...-...",
  "organizationId": "f1d2...-...",
  "diagnosticSessionId": "a1b2c3...-...",
  "agentId": "d4e5f6...-...",
  "status": "ACTIVE",
  "cadenceMs": 1000,
  "cadenceClamped": false,
  "startedAt": "2026-06-11T12:34:56.789Z",
  "lastPolledAt": null,
  "supportedPidMask": null,
  "pids": ["0C", "0D", "05", "42", "11", "04", "06", "07", "10", "0F", "14"]
}
```

| Response field | Description |
|---|---|
| `cadenceMs` | The **persisted** (clamped) cadence. |
| `cadenceClamped` | `true` if the requested `cadenceMs` was outside `[200, 5000]` and the value was clamped. The dashboard uses this flag to display a "Clamped" indicator. |

### Response — 409 Conflict (no online agent)

```json
{
  "code": "AGENT_OFFLINE",
  "message": "No online Desktop Agent is paired to start polling."
}
```

### Response — 409 Conflict (session closed)

```json
{
  "code": "DIAGNOSTIC_SESSION_CLOSED",
  "message": "Cannot start live data on a closed Diagnostic Session."
}
```

---

## `POST /sessions/:id/live-data/stop`

Stops polling for the given Diagnostic Session. Closes the active `LiveDataSession` and writes a `LIVE_DATA_POLL_STOPPED` audit.

### Path Params

| Param | Type | Description |
|---|---|---|
| `id` | UUID | The Diagnostic Session id |

### Response — 200 OK

```json
{
  "id": "8b3a2b1c-...-...",
  "status": "STOPPED",
  "endedAt": "2026-06-11T12:45:00.000Z"
}
```

### Response — 404 Not Found (no active session)

```json
{
  "code": "LIVE_DATA_SESSION_NOT_FOUND",
  "message": "No active live data session for this Diagnostic Session."
}
```

---

## `GET /sessions/:id/live-data/current`

Returns the most-recent reading per PID for the active `LiveDataSession`. The dashboard polls this endpoint at the configured cadence (default 1 s).

### Path Params

| Param | Type | Description |
|---|---|---|
| `id` | UUID | The Diagnostic Session id |

### Response — 200 OK

```json
{
  "sessionId": "8b3a2b1c-...-...",
  "lastPolledAt": "2026-06-11T12:34:58.123Z",
  "cadenceMs": 1000,
  "supportedPidMask": {
    "0C": true,
    "0D": true,
    "05": true,
    "42": true,
    "11": true,
    "04": true,
    "06": true,
    "07": true,
    "10": true,
    "0F": true,
    "14": true
  },
  "readings": [
    {
      "pid": "0C",
      "name": "Engine RPM",
      "value": 750,
      "unit": "RPM",
      "rawValue": "12 38",
      "status": "OK",
      "capturedAt": "2026-06-11T12:34:58.123Z"
    },
    {
      "pid": "0D",
      "name": "Vehicle Speed",
      "value": 0,
      "unit": "km/h",
      "rawValue": "00",
      "status": "OK",
      "capturedAt": "2026-06-11T12:34:58.123Z"
    },
    {
      "pid": "05",
      "name": "Engine Coolant Temperature",
      "value": 92,
      "unit": "°C",
      "rawValue": "84",
      "status": "OK",
      "capturedAt": "2026-06-11T12:34:58.123Z"
    }
  ]
}
```

Each reading's `status` is one of:
- `OK` — value present
- `NO_DATA` — ECU did not respond for this PID in the most-recent cycle
- `NOT_SUPPORTED` — ECU did not advertise this PID in the supported-PID mask
- `ERROR` — ECU returned an error code (e.g., `7F 01 12`)

If no `LiveDataSession` is active, the response is 200 with `readings: []` and `lastPolledAt: null`.

### Response — 404 Not Found (DiagnosticSession not found)

```json
{
  "code": "DIAGNOSTIC_SESSION_NOT_FOUND",
  "message": "Diagnostic Session not found."
}
```

---

## `POST /sessions/:id/live-data/snapshots`

Captures a point-in-time `LiveDataSnapshot` of the current readings. The snapshot stores the readings as a single **JSONB `values` object** keyed by hex PID (Correction 2) — the MVP does **not** create a separate `LiveDataReading` / `LiveDataSnapshotValue` table. The endpoint enforces the 50-snapshot cap; the oldest snapshot is evicted in the same transaction as the new insert.

### Path Params

| Param | Type | Description |
|---|---|---|
| `id` | UUID | The Diagnostic Session id |

### Response — 201 Created

```json
{
  "id": "c1d2e3f4-...-...",
  "organizationId": "f1d2...-...",
  "diagnosticSessionId": "a1b2c3...-...",
  "liveDataSessionId": "8b3a2b1c-...-...",
  "capturedAt": "2026-06-11T12:35:00.000Z",
  "createdBy": "user-uuid",
  "values": {
    "0C": { "name": "Engine RPM", "value": 750, "unit": "RPM", "rawValue": "12 38" },
    "0D": { "name": "Vehicle Speed", "value": 0, "unit": "km/h", "rawValue": "00" },
    "05": { "name": "Engine Coolant Temperature", "value": 92, "unit": "°C", "rawValue": "84" },
    "42": { "name": "Control Module Voltage", "value": 13.9, "unit": "V", "rawValue": "21 49" }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `id` | UUID | The snapshot id |
| `organizationId` | UUID | Tenant scope |
| `diagnosticSessionId` | UUID | The parent Diagnostic Session (Correction 1: snapshot is anchored to the Diagnostic Session) |
| `liveDataSessionId` | UUID | The session that produced the snapshot |
| `capturedAt` | string (ISO 8601) | Capture time |
| `createdBy` | UUID | The user who pressed Save |
| `values` | **object (JSONB)** | The captured readings, keyed by hex PID. Each entry has `name`, `value`, `unit`, `rawValue`. PIDs that returned errors / no data in the most-recent cycle are absent from the map. |

### Response — 409 Conflict (no data)

```json
{
  "code": "NO_DATA_TO_CAPTURE",
  "message": "Polling has not produced any readings yet. Start polling and wait for a cycle."
}
```

### Side Effects

- A `DiagnosticSessionAuditRecord` with `action: 'LIVE_DATA_SNAPSHOT_CAPTURED'` is written.
- If the cap is exceeded, the oldest snapshot is deleted, and a `DiagnosticSessionAuditRecord` with `action: 'LIVE_DATA_SNAPSHOT_EVICTED'` and `metadata.evictedSnapshotId` is written.
- The entire capture (count → evict → insert → audit) runs in a single `prisma.$transaction`.

---

## `GET /sessions/:id/live-data/snapshots`

Lists all snapshots for the given Diagnostic Session, ordered by `capturedAt` descending (newest first).

### Path Params

| Param | Type | Description |
|---|---|---|
| `id` | UUID | The Diagnostic Session id |

### Query Params

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | 50 | Max number of snapshots to return (capped at 50) |
| `offset` | integer | 0 | Pagination offset |

### Response — 200 OK

```json
{
  "data": [
    {
      "id": "c1d2e3f4-...-...",
      "capturedAt": "2026-06-11T12:35:00.000Z",
      "createdBy": "user-uuid",
      "readingCount": 11
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

---

## `GET /sessions/:id/live-data/snapshots/:snapshotId`

Returns a single snapshot with its `values` JSONB map (Correction 2).

### Path Params

| Param | Type | Description |
|---|---|---|
| `id` | UUID | The Diagnostic Session id |
| `snapshotId` | UUID | The snapshot id |

### Response — 200 OK

```json
{
  "id": "c1d2e3f4-...-...",
  "organizationId": "f1d2...-...",
  "diagnosticSessionId": "a1b2c3...-...",
  "liveDataSessionId": "8b3a2b1c-...-...",
  "capturedAt": "2026-06-11T12:35:00.000Z",
  "createdBy": "user-uuid",
  "values": {
    "0C": { "name": "Engine RPM", "value": 750, "unit": "RPM", "rawValue": "12 38" },
    "05": { "name": "Engine Coolant Temperature", "value": 92, "unit": "°C", "rawValue": "84" }
  }
}
```

### Response — 404 Not Found

```json
{
  "code": "SNAPSHOT_NOT_FOUND",
  "message": "Snapshot not found for this Diagnostic Session."
}
```

---

## Reconnect Behavior (Correction 4)

The Desktop Agent's command queue may reconnect after a transient network drop. The recovery rules for the active `LiveDataSession`:

- **Reconnect within `LIVE_DATA_STALE_TIMEOUT_MS` (30 s)**: the existing `ACTIVE` `LiveDataSession` is **resumed**. The next `LIVE_DATA_POLL` command is enqueued with the **same `liveDataSessionId`**. The `LiveDataReadingCurrent` rows are kept. The dashboard sees no disruption.
- **Reconnect after 30 s**: the existing `ACTIVE` session is marked `STALE` in a single transaction (audit `LIVE_DATA_POLL_STOPPED` written with `metadata.reason: 'stale_timeout'`); a new `LiveDataSession` is created on the next `Start` with a fresh `id`. The `LiveDataSnapshot`s taken under the STALE session are preserved (they remain linked to the `DiagnosticSession`).
- The 30-second window is the same as the stale-timeout window; the `LiveDataSessionService.sweep()` job runs every 30 s and marks any `ACTIVE` session with `lastPolledAt < now - LIVE_DATA_STALE_TIMEOUT_MS` as `STALE`.
- The agent push endpoint `POST /v2/obd/agents/:id/live-cycles` accepts cycles only for `ACTIVE` sessions. Cycles for `STALE` or `STOPPED` sessions are rejected with `LIVE_DATA_SESSION_NOT_FOUND`.

---

## `POST /sessions/:id/live-data/discover`

Runs OBD-II PID discovery (Service 01 PIDs 00/20/40/60/80/A0) and stores the supported-PID mask on the active `LiveDataSession`. The request is enqueued on the agent command queue; the result is pushed asynchronously by the agent and persisted on receipt.

### Path Params

| Param | Type | Description |
|---|---|---|
| `id` | UUID | The Diagnostic Session id |

### Response — 202 Accepted

```json
{
  "discoveryId": "discovery-uuid",
  "status": "ENQUEUED"
}
```

### Response — 409 Conflict (no online agent)

```json
{
  "code": "AGENT_OFFLINE",
  "message": "No online Desktop Agent is paired to run discovery."
}
```

---

## Error Schema (common)

All error responses use the same shape:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable description.",
  "details": { ... optional structured context ... }
}
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | class-validator failure |
| `INVALID_VIN` | 400 | (Phase A) Malformed VIN |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | RBAC or tenant mismatch |
| `TENANT_ACCESS_DENIED` | 403 | Cross-tenant access attempt |
| `DIAGNOSTIC_SESSION_NOT_FOUND` | 404 | |
| `LIVE_DATA_SESSION_NOT_FOUND` | 404 | |
| `SNAPSHOT_NOT_FOUND` | 404 | |
| `AGENT_OFFLINE` | 409 | No online agent for the tenant |
| `DIAGNOSTIC_SESSION_CLOSED` | 409 | Live data on a closed session |
| `NO_DATA_TO_CAPTURE` | 409 | Snapshot requested before any data |
| `PID_NOT_DEFINED` | 422 | Agent pushed a reading for an unknown PID |
| `INTERNAL_ERROR` | 500 | Unexpected |

---

## Performance Targets

| Endpoint | Target |
|---|---|
| `POST /live-data/start` | p95 < 200 ms |
| `POST /live-data/stop` | p95 < 200 ms |
| `GET /live-data/current` | p95 < 100 ms |
| `POST /live-data/snapshots` | p95 < 500 ms (writes + audit) |
| `GET /live-data/snapshots` | p95 < 200 ms |
| `GET /live-data/snapshots/:id` | p95 < 200 ms |
| `POST /live-data/discover` | p95 < 200 ms (enqueue only) |
