# DTC Clear API Contract

**Feature**: 009-vehicle-data-clear-codes (Phase B)
**Date**: 2026-06-13
**Audience**: Frontend developers, backend developers

---

## Authentication

All endpoints require JWT authentication. Tenant isolation is enforced via the authenticated user's `organizationId`.

---

## Endpoints

### 1. Clear Fault Codes

Initiates a DTC clear by queuing a `CLEAR_DTC` command to the Desktop Agent. The backend validates prerequisites and writes a `DTC_CLEAR_REQUESTED` audit record before queuing.

```
POST /api/v1/diagnostic-sessions/:sessionId/fault-codes/clear
Authorization: Bearer <token>
```

**Request Body**: None (empty — confirmation is handled by the frontend modal before this endpoint is called)

**Response (202 Accepted)** — Clear command queued:
```json
{
  "sessionId": "uuid",
  "status": "CLEAR_PENDING",
  "previousFaultCodeCount": 3,
  "message": "DTC clear command queued."
}
```

**Response (404 Not Found)** — Session does not exist or tenant mismatch:
```json
{
  "code": "SESSION_NOT_FOUND",
  "message": "The diagnostic session does not exist or you do not have access to it."
}
```

**Response (409 Conflict)** — No fault codes in session:
```json
{
  "code": "NO_FAULT_CODES",
  "message": "This session has no fault codes to clear."
}
```

**Response (409 Conflict)** — Session is closed:
```json
{
  "code": "SESSION_CLOSED",
  "message": "Cannot clear fault codes for a closed session."
}
```

**Response (409 Conflict)** — No adapter connected:
```json
{
  "code": "NO_ADAPTER_CONNECTED",
  "message": "No adapter is connected. Please connect an adapter before clearing fault codes."
}
```

**Response (409 Conflict)** — Clear already in progress:
```json
{
  "code": "CLEAR_IN_PROGRESS",
  "message": "A DTC clear command is already in progress for this session."
}
```

**Response (409 Conflict)** — Session contains only permanent codes (warning):
```json
{
  "code": "PERMANENT_CODES_ONLY",
  "message": "This session contains only permanent fault codes, which may not be clearable through standard OBD-II Mode 04. The clear command will still be attempted.",
  "previousFaultCodeCount": 1
}
```

Note: `PERMANENT_CODES_ONLY` returns HTTP 202 (not 409) — it is a warning, not a block. The clear is still attempted because the ECU may clear some permanent codes depending on conditions.

---

### 2. Check Clear Status (Optional — Polling)

Returns the current DTC clear status for the session. The frontend can poll this after a clear request to detect completion.

```
GET /api/v1/diagnostic-sessions/:sessionId/fault-codes/clear-status
Authorization: Bearer <token>
```

**Response (200 OK)** — No clear in progress:
```json
{
  "sessionId": "uuid",
  "clearStatus": "NONE",
  "lastClearAt": "2026-06-13T10:20:00Z",
  "lastClearResult": "SUCCESS"
}
```

**Response (200 OK)** — Clear in progress:
```json
{
  "sessionId": "uuid",
  "clearStatus": "PENDING",
  "lastClearAt": null,
  "lastClearResult": null
}
```

**Clear Status Values**:

| Value | Meaning |
|---|---|
| `NONE` | No clear has been requested or the last clear completed |
| `PENDING` | A clear command is queued and awaiting agent response |
| `SUCCESS` | The last clear completed successfully |
| `FAILED` | The last clear failed |

**Note**: This endpoint is optional for the MVP. The frontend can also rely on the audit record list or a WebSocket notification if one exists. If omitted, the frontend polls `GET .../vehicle-data` or checks audit records.

---

## Agent Events

### DTC_CLEARED — Clear Success

When the agent successfully clears DTCs, it pushes a `DTC_CLEARED` event:

```
POST /obd/agents/:id/scan-events
X-Agent-Token: <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "sessionId": "uuid",
  "event": "DTC_CLEARED",
  "payload": {
    "success": true
  },
  "timestamp": "2026-06-13T10:20:00Z"
}
```

**Backend Processing**:
1. Write `DTC_CLEAR_COMPLETED` audit record for the session
2. Clear the "pending clear" in-memory flag for the session
3. The frontend is notified via polling or can re-fetch session state

---

### DTC_CLEAR_FAILED — Clear Failure

When the agent fails to clear DTCs, it pushes a `DTC_CLEAR_FAILED` event:

**Request Body**:
```json
{
  "sessionId": "uuid",
  "event": "DTC_CLEAR_FAILED",
  "payload": {
    "success": false,
    "reason": "ECU rejected clear command (7F 04 31)"
  },
  "timestamp": "2026-06-13T10:20:00Z"
}
```

**Backend Processing**:
1. Write `DTC_CLEAR_FAILED` audit record for the session with `metadata.failureReason`
2. Clear the "pending clear" in-memory flag for the session
3. The frontend is notified via polling — existing fault codes remain unchanged

---

## Audit Records

All DTC clear operations generate `DiagnosticSessionAuditRecord` entries:

| Action | When | Metadata |
|---|---|---|
| `DTC_CLEAR_REQUESTED` | User confirms and endpoint is called | `{ userId, previousFaultCodeCount }` |
| `DTC_CLEAR_COMPLETED` | Agent pushes `DTC_CLEARED` event | `{ sessionId }` |
| `DTC_CLEAR_FAILED` | Agent pushes `DTC_CLEAR_FAILED` event | `{ sessionId, failureReason }` |

---

## Frontend Interaction Flow

1. User presses "Clear Fault Codes" button → **frontend** shows confirmation modal
2. User acknowledges warning and confirms → **frontend** calls `POST .../fault-codes/clear`
3. Backend validates prerequisites, writes `DTC_CLEAR_REQUESTED` audit, queues command → returns 202
4. Frontend shows "Clearing in progress..." state
5. Agent processes command and pushes `DTC_CLEARED` or `DTC_CLEAR_FAILED`
6. Backend processes event, writes audit record, clears pending flag
7. Frontend polls session state or is notified → shows success/failure banner
8. On success: frontend offers "Run scan again" action

---

## Error Response Schema

All error responses follow this shape:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable description",
  "details": {}
}
```

## Safety Guarantees

- The backend validates ALL prerequisites before queuing a clear command
- The frontend MUST show the confirmation modal before calling the endpoint
- The backend does NOT enforce the modal — it trusts the frontend client. The audit trail captures that the request was made by a specific user.
- Concurrent clear prevention is enforced server-side via in-memory pending flag
- Previous fault codes are NEVER deleted by the clear operation — they remain as historical `SessionFaultCode` records