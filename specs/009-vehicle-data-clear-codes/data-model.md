# Data Model: Vehicle Health & DTC Clear

**Feature**: 009-vehicle-data-clear-codes
**Branch**: `009-vehicle-data-clear-codes`
**Date**: 2026-06-13
**Spec**: [spec.md](spec.md)
**Plan**: [plan.md](plan.md)

---

## Overview

This document describes the Prisma schema additions required for Feature 009. The feature takes a minimal-schema approach: vehicle data is stored as a JSONB snapshot on the existing `DiagnosticSession` model, and DTC clear tracking uses the existing `DiagnosticSessionAuditRecord` model. **No new tables are created.**

---

## Updated Models

### `DiagnosticSession` (additive — two new columns)

| Field | Type | Constraints | Description |
|---|---|---|---|
| `vehicleDataJson` | Json (JSONB) | Nullable | One-shot snapshot of vehicle health data read from the ECU. Null means no vehicle data has been read for this session. |
| `vehicleDataReadAt` | DateTime | Nullable, `@db.Timestamptz(6)` | Timestamp of the most recent vehicle data read. Null means no data has been read. |

**`vehicleDataJson` shape**:

```json
{
  "batteryVoltage": { "value": 12.4, "unit": "V", "supported": true },
  "vin": { "value": "1HGCM82633A123456", "supported": true },
  "readinessMonitors": {
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
    },
    "supported": true
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
}
```

Each data point includes:
- `supported` (boolean): Whether the vehicle/adapter returned data for this PID
- `value` (string | number | object | null): The decoded value (null when unsupported)
- `unit` (string, optional): The unit of measurement (e.g., "V", "%", "km")

Unsupported PIDs have `supported: false` and `value: null`. The system MUST NOT fabricate values.

---

### `DiagnosticSessionAuditRecord` (extended — new action values)

No schema changes. New `action` string values used by this feature:

| Action | Metadata | Trigger |
|---|---|---|
| `VEHICLE_DATA_READ_REQUESTED` | `{ userId, sessionId }` | User presses "Read Vehicle Data" |
| `VEHICLE_DATA_READ_COMPLETED` | `{ sessionId, pidCount: <number> }` | Agent returns vehicle data |
| `DTC_CLEAR_REQUESTED` | `{ userId, sessionId, previousFaultCodeCount: <number> }` | User confirms DTC clear |
| `DTC_CLEAR_COMPLETED` | `{ sessionId }` | Agent confirms DTC clear success |
| `DTC_CLEAR_FAILED` | `{ sessionId, failureReason: <string> }` | Agent reports DTC clear failure |

All audit records remain tenant-scoped (`organizationId`) and immutable (no `updatedAt` field).

---

### `LiveDataCommand` (extended — new command type values)

No schema changes. New `type` string values used by this feature:

| Command Type | Description | Payload |
|---|---|---|
| `READ_VEHICLE_DATA` | One-shot vehicle health data read | `{ sessionId, pids: ["01", "03", "04", "2F", "31", "42", "09/02"] }` |
| `CLEAR_DTC` | Clear DTCs via Mode 04 | `{ sessionId }` |

---

## New Enums

### `ScanEventType` (extended)

Add to existing enum:

| Value | Payload Shape | Description |
|---|---|---|
| `VEHICLE_DATA_READ` | `{ vehicleData: VehicleDataJson }` | Agent completed vehicle data read |
| `DTC_CLEARED` | `{ success: true }` | Agent confirmed DTC clear success |
| `DTC_CLEAR_FAILED` | `{ success: false, reason: string }` | Agent reported DTC clear failure |

---

## Migration Impact

### Additive Migration: `20260613_add_vehicle_data_json`

```sql
ALTER TABLE "DiagnosticSession"
  ADD COLUMN "vehicleDataJson" JSONB,
  ADD COLUMN "vehicleDataReadAt" TIMESTAMPTZ(6);
```

### Backward Compatibility

- Fully additive. No existing columns are altered.
- Existing `DiagnosticSession` rows have `vehicleDataJson = NULL` and `vehicleDataReadAt = NULL`.
- The `DiagnosticSessionAuditRecord.action` column is a `VarChar(50)` — new action strings require no schema change.
- The `LiveDataCommand.type` column is a string — new command types require no schema change.
- The `ScanEventType` enum needs new values added.

### Rollback Plan

```sql
ALTER TABLE "DiagnosticSession"
  DROP COLUMN "vehicleDataJson",
  DROP COLUMN "vehicleDataReadAt";
```

---

## Validation Rules

| Entity | Field | Rule |
|---|---|---|
| `DiagnosticSession` | `vehicleDataJson` | When non-null, must conform to the VehicleDataJson shape (validated by service layer before write) |
| `DiagnosticSession` | `vehicleDataReadAt` | When `vehicleDataJson` is non-null, `vehicleDataReadAt` must also be non-null |
| `VehicleDataPoint` (DTO) | `supported` | Required boolean |
| `VehicleDataPoint` (DTO) | `value` | Required (null when `supported: false`) |
| `VehicleDataPoint` (DTO) | `unit` | Optional string |

### Cross-Model

- `DiagnosticSession.vehicleDataJson` is tenant-scoped via the parent session's `organizationId`.
- DTC clear audit records (`DiagnosticSessionAuditRecord.sessionId`) must reference a session in the same `organizationId`.
- `LiveDataCommand` entries for `READ_VEHICLE_DATA` and `CLEAR_DTC` must reference a `diagnosticSessionId` belonging to the same `organizationId` as the agent.

---

## Entity Relationship Diagram (updated)

```
┌───────────────────────────────────────────────┐
│                DiagnosticSession               │
│  + vehicleDataJson (JSONB, nullable)           │
│  + vehicleDataReadAt (Timestamp, nullable)      │
│        │                                       │
│        ├── 1 → Many ScanJob                    │
│        ├── 1 → Many SessionFaultCode           │
│        ├── 1 → Many LiveDataSession            │
│        ├── 1 → Many DiagnosticSessionAuditRecord│
│        └── 1 → Many LiveDataCommand            │
└───────────────────────────────────────────────┘

No new tables. Vehicle data is embedded in DiagnosticSession.
DTC clear tracking uses DiagnosticSessionAuditRecord.
Commands use existing LiveDataCommand table.
```

---

## Vehicle Data JSONB Schema (Detailed)

### Readiness Monitors Value Object

```json
{
  "misfire":           { "supported": true,  "complete": true },
  "fuelSystem":        { "supported": true,  "complete": true },
  "components":        { "supported": true,  "complete": false },
  "catalyst":          { "supported": true,  "complete": false },
  "heatedCatalyst":    { "supported": false, "complete": null },
  "evap":              { "supported": true,  "complete": false },
  "secondaryAir":      { "supported": false, "complete": null },
  "acRefrigerant":     { "supported": false, "complete": null },
  "oxygenSensor":      { "supported": true,  "complete": true },
  "oxygenSensorHeater": { "supported": true,  "complete": true },
  "egrVvt":            { "supported": true,  "complete": false }
}
```

- `supported: false` → monitor is not supported by this ECU
- `supported: true, complete: true` → monitor has completed its test
- `supported: true, complete: false` → monitor has not yet completed (drive cycle needed)
- `supported: false, complete: null` → monitor not applicable to this vehicle

### Fuel System Status Values

| Value | Meaning |
|---|---|
| `"Open Loop - Temperature"` | Open loop due to insufficient engine temperature |
| `"Closed Loop"` | Closed loop, no faults detected |
| `"Open Loop - Load"` | Open loop due to engine load or fuel cut |
| `"Open Loop - Fault"` | Open loop due to a fault condition |
| `"Closed Loop - Fault"` | Closed loop but a fault is present |

### Supported PIDs Value Object

```json
{
  "01": ["01", "03", "04", "05", "0C", "0D", "0F", "10", "11", "14", "2F", "31", "42"],
  "09": ["02"]
}
```

Keys are OBD modes ("01", "09"). Values are arrays of supported PID hex codes within that mode.