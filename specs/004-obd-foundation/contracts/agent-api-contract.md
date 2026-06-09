# Agent API Contract

**Feature**: OBD Foundation (Phase 004)
**Date**: 2026-06-09
**Audience**: Desktop Agent developers, backend developers

---

## Authentication

All agent-facing endpoints require the `X-Agent-Token` header.

```
X-Agent-Token: <agent-access-token>
```

The agent access token is obtained by exchanging a pairing token via `POST /obd/agents/register`.

---

## Endpoints

### 1. Register Agent (Exchange Pairing Token)

```
POST /obd/agents/register
Content-Type: application/json
```

**Request Body**:
```json
{
  "pairingToken": "ABC-123-DEF",
  "agentName": "Workshop-PC-01",
  "version": "1.0.0"
}
```

**Response (200 OK)**:
```json
{
  "agentId": "uuid",
  "accessToken": "256-bit-random-string",
  "organizationId": "uuid",
  "userId": "uuid",
  "expiresAt": "2026-06-09T12:00:00Z"
}
```

**Response (400 Bad Request)**:
```json
{
  "code": "PAIRING_TOKEN_INVALID",
  "message": "The pairing token is invalid or has expired."
}
```

**Idempotency**: Re-registering with the same consumed token returns `400`.

---

### 2. Send Heartbeat

```
POST /obd/agents/:id/heartbeat
X-Agent-Token: <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "version": "1.0.0",
  "adapterConnected": true,
  "adapterType": "ELM327",
  "protocol": "CAN"
}
```

**Response (204 No Content)**

**Response (401 Unauthorized)**:
```json
{
  "code": "AGENT_TOKEN_INVALID",
  "message": "The agent access token is invalid or expired."
}
```

**Response (404 Not Found)**:
```json
{
  "code": "AGENT_NOT_FOUND",
  "message": "The agent does not exist."
}
```

---

### 3. Poll Scan Queue

```
GET /obd/agents/:id/scan-queue
X-Agent-Token: <token>
```

**Response (200 OK) — Job Available**:
```json
{
  "scanJobId": "uuid",
  "vehicleId": "uuid",
  "commands": [
    { "type": "CONNECT_ADAPTER", "timeoutMs": 10000 },
    { "type": "READ_VIN", "timeoutMs": 30000 },
    { "type": "READ_DTCS", "timeoutMs": 30000 }
  ]
}
```

**Response (204 No Content) — No Jobs**

**Response (409 Conflict) — Agent Busy**:
```json
{
  "code": "AGENT_BUSY",
  "message": "Agent is already executing a scan."
}
```

---

### 4. Push Scan Event

```
POST /obd/agents/:id/scan-events
X-Agent-Token: <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "scanJobId": "uuid",
  "sequenceNumber": 1,
  "event": "VIN_READ",
  "payload": {
    "vin": "1HGCM82633A123456"
  },
  "timestamp": "2026-06-09T10:15:30Z"
}
```

**Supported Events**:

| Event | Payload | Description |
|---|---|---|
| `ADAPTER_CONNECTED` | `{ adapterType, connectionType, protocol }` | Adapter successfully opened |
| `ADAPTER_DISCONNECTED` | `{ reason }` | Adapter lost or closed |
| `VIN_READ` | `{ vin }` | VIN successfully retrieved |
| `VIN_READ_FAILED` | `{ reason }` | VIN could not be read |
| `DTC_READ` | `{ codes: [{ code, status, ecu }] }` | Fault codes retrieved |
| `DTC_READ_FAILED` | `{ reason }` | Fault codes could not be read |
| `ERROR` | `{ message, code }` | Generic scan error |

**Response (204 No Content)**

**Idempotency**: Events with the same `(scanJobId, sequenceNumber)` are idempotent. Backend stores the highest `sequenceNumber` processed and ignores duplicates.

---

### 5. Report Adapter Status

```
POST /obd/agents/:id/adapter-status
X-Agent-Token: <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "status": "CONNECTED",
  "adapterType": "ELM327",
  "connectionType": "USB",
  "protocol": "CAN",
  "errorMessage": null
}
```

**Status Values**: `CONNECTED`, `DISCONNECTED`, `ERROR`

**Response (204 No Content)**

---

## Error Response Schema

All error responses follow this shape:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable description",
  "details": {} // Optional, context-specific
}
```

## Event Sequencing

For a typical successful scan, the agent pushes events in this order:

```
sequenceNumber: 1  → ADAPTER_CONNECTED
sequenceNumber: 2  → VIN_READ
sequenceNumber: 3  → DTC_READ
```

For a failed scan:

```
sequenceNumber: 1  → ADAPTER_CONNECTED
sequenceNumber: 2  → VIN_READ_FAILED
sequenceNumber: 3  → ERROR (optional, terminal)
```

The backend uses `sequenceNumber` to detect gaps or out-of-order events.
