# Vehicle Data API Contract

**Feature**: 009-vehicle-data-clear-codes (Phase A)
**Date**: 2026-06-13
**Audience**: Frontend developers, backend developers

---

## Authentication

All endpoints require JWT authentication. Tenant isolation is enforced via the authenticated user's `organizationId`.

---

## Endpoints

### 1. Read Vehicle Data

Initiates a one-shot vehicle data read by queuing a `READ_VEHICLE_DATA` command to the Desktop Agent.

```
POST /api/v1/diagnostic-sessions/:sessionId/vehicle-data/read
Authorization: Bearer <token>
```

**Request Body**: None (empty)

**Response (202 Accepted)** — Command queued:
```json
{
  "sessionId": "uuid",
  "status": "READ_PENDING",
  "message": "Vehicle data read command queued."
}
```

**Response (404 Not Found)** — Session does not exist or tenant mismatch:
```json
{
  "code": "SESSION_NOT_FOUND",
  "message": "The diagnostic session does not exist or you do not have access to it."
}
```

**Response (409 Conflict)** — No adapter connected:
```json
{
  "code": "NO_ADAPTER_CONNECTED",
  "message": "No adapter is connected. Please connect an adapter before reading vehicle data."
}
```

**Response (409 Conflict)** — Session is closed:
```json
{
  "code": "SESSION_CLOSED",
  "message": "Cannot read vehicle data for a closed session."
}
```

**Response (409 Conflict)** — Read already in progress:
```json
{
  "code": "READ_IN_PROGRESS",
  "message": "A vehicle data read is already in progress for this session."
}
```

---

### 2. Get Vehicle Data

Returns the most recently read vehicle data for the given session.

```
GET /api/v1/diagnostic-sessions/:sessionId/vehicle-data
Authorization: Bearer <token>
```

**Response (200 OK)** — Vehicle data available:
```json
{
  "sessionId": "uuid",
  "vehicleData": {
    "batteryVoltage": { "value": 12.4, "unit": "V", "supported": true },
    "vin": { "value": "1HGCM82633A123456", "supported": true },
    "readinessMonitors": {
      "supported": true,
      "value": {
        "misfire": { "supported": true, "complete": true },
        "fuelSystem": { "supported": true, "complete": true },
        "components": { "supported": true, "complete": false },
        "catalyst": { "supported": true, "complete": false },
        "heatedCatalyst": { "supported": false, "complete": null },
        "evap": { "supported": true, "complete": false },
        "secondaryAir": { "supported": false, "complete": null },
        "acRefrigerant": { "supported": false, "complete": null },
        "oxygenSensor": { "supported": true, "complete": true },
        "oxygenSensorHeater": { "supported": true, "complete": true },
        "egrVvt": { "supported": true, "complete": false }
      }
    },
    "fuelSystemStatus": {
      "value": "Closed Loop",
      "supported": true,
      "details": { "system1": "Closed Loop", "system2": null }
    },
    "calculatedEngineLoad": { "value": 32.5, "unit": "%", "supported": true },
    "fuelLevel": { "value": 75, "unit": "%", "supported": true },
    "mileage": { "value": null, "unit": "km", "supported": false },
    "supportedPids": {
      "01": ["01", "03", "04", "05", "0C", "0D", "0F", "10", "11", "14", "2F", "31", "42"],
      "09": ["02"]
    }
  },
  "readAt": "2026-06-13T10:15:30Z"
}
```

**Response (200 OK)** — No vehicle data read yet:
```json
{
  "sessionId": "uuid",
  "vehicleData": null,
  "readAt": null
}
```

**Response (404 Not Found)** — Session does not exist or tenant mismatch:
```json
{
  "code": "SESSION_NOT_FOUND",
  "message": "The diagnostic session does not exist or you do not have access to it."
}
```

---

## Agent Event: VEHICLE_DATA_READ

When the agent completes a vehicle data read, it pushes a `VEHICLE_DATA_READ` event via the existing scan-events endpoint:

```
POST /obd/agents/:id/scan-events
X-Agent-Token: <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "sessionId": "uuid",
  "event": "VEHICLE_DATA_READ",
  "payload": {
    "vehicleData": {
      "batteryVoltage": { "value": 12.4, "unit": "V", "supported": true },
      "vin": { "value": "1HGCM82633A123456", "supported": true },
      "readinessMonitors": { "supported": true, "value": { ... } },
      "fuelSystemStatus": { "value": "Closed Loop", "supported": true, "details": { ... } },
      "calculatedEngineLoad": { "value": 32.5, "unit": "%", "supported": true },
      "fuelLevel": { "value": 75, "unit": "%", "supported": true },
      "mileage": { "value": null, "unit": "km", "supported": false },
      "supportedPids": { "01": [...], "09": [...] }
    }
  },
  "timestamp": "2026-06-13T10:15:30Z"
}
```

**Response (204 No Content)** — Event processed.

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

## Vehicle Data Point DTO

Each data point in the `vehicleData` object follows this shape:

| Field | Type | Required | Description |
|---|---|---|---|
| `value` | string \| number \| object \| null | Yes | Decoded value. `null` when `supported: false`. |
| `unit` | string | No | Unit of measurement (e.g., "V", "%", "km"). Absent for non-numeric values. |
| `supported` | boolean | Yes | Whether the vehicle/adapter returned data for this PID. |
| `details` | object | No | Additional structured detail (e.g., fuel system system1/system2). |