# Research: Vehicle Health & DTC Clear

**Feature**: 009-vehicle-data-clear-codes
**Date**: 2026-06-13
**Spec**: [spec.md](spec.md)

---

## 1. OBD-II Vehicle Data PIDs — Availability & Handling

### Decision
Include 7 data points in Phase A: battery voltage (PID 42), VIN (Mode 09 PID 02), readiness monitors (PID 01), fuel system status (PID 03), calculated engine load (PID 04), fuel level (PID 2F), and mileage (PID 31/Mode 09 PID 31). Treat mileage and fuel level as optional with graceful fallback.

### Rationale
- **Battery voltage (PID 42)**: Universally supported. Already in PIDDefinition from Feature 006.
- **VIN (Mode 09 PID 02)**: Already implemented in Feature 004 scan flow. Reuse the same agent command.
- **Readiness monitors (PID 01)**: Standard on all OBD-II vehicles. Returns a bitmask of monitor statuses.
- **Fuel system status (PID 03)**: Standard status PID. Returns Open Loop / Closed Loop / Open Loop Fault states. Trivial to decode (2-byte response maps to SAE J1979 Table 7).
- **Calculated engine load (PID 04)**: Already in PIDDefinition from Feature 006. Zero additional infrastructure cost.
- **Fuel level (PID 2F)**: Widely supported but not universal. Formula: `A * 100 / 255` (%).
- **Mileage (PID 31 / Mode 09 PID 31)**: Least reliable. Many vehicles and generic adapters do not support. Treat as optional.

### Alternatives Considered
- **Include only universally supported PIDs**: Rejected — fuel level and mileage are useful when available, and the "Not supported" pattern handles absence gracefully.
- **Include Mode 09 PID 31 (cumulative mileage)**: Considered alongside Mode 01 PID 31. Mode 09 PID 31 is more reliable for total odometer but still not universal. Agent will attempt both and report whichever succeeds.

---

## 2. JSONB Snapshot vs Dedicated VehicleData Table

### Decision
Store vehicle data as JSONB (`vehicleDataJson`) directly on `DiagnosticSession` with a `vehicleDataReadAt` timestamp column. No dedicated `VehicleData` table.

### Rationale
- Vehicle data is a one-shot snapshot with no independent lifecycle — always session-scoped.
- Feature 006 established the JSONB pattern: `LiveDataSnapshot.values`, `LiveDataSession.supportedPidMask`.
- Query pattern for MVP is simple: "get vehicle data for session X" — single row, no joins.
- A future migration to a dedicated table is additive if cross-session analytics are needed.
- Two nullable columns on `DiagnosticSession` vs. a new table + FK + repository + service = significantly less overhead.

### Alternatives Considered
- **Dedicated `VehicleData` table**: More structured, queryable across sessions. Rejected for MVP because vehicle data has no independent lifecycle and the JSONB pattern is already established.

---

## 3. DTC Clear Tracking: Audit Records vs DtcClearRequest Table

### Decision
Use existing `DiagnosticSessionAuditRecord` entries with metadata. No dedicated `DtcClearRequest` table.

### Rationale
- All tracking data fits in audit metadata: `previousFaultCodeCount`, `userId`, `failureReason`.
- The "pending clear" state is transient service-layer state during command execution — not persistent domain state.
- `DiagnosticSessionAuditRecord` already supports `metadata Json?` and is immutable + tenant-scoped.
- Cross-session analytics ("all clear operations across sessions") is a reports feature that is out of scope.

### Alternatives Considered
- **Dedicated `DtcClearRequest` table**: Would enable direct querying of clear operations. Rejected because the data is already capturable in audit metadata and adds schema complexity for no MVP user-value.

---

## 4. OBD-II Mode 04 (Clear DTCs) — Protocol Details

### Decision
Implement Mode 04 clear via the Desktop Agent command queue. The agent sends `04` (single byte, no PID) to the ECU. Success = ECU returns `44` (positive response). Failure = ECU returns `7F 04 XX` (negative response with reason code).

### Rationale
- SAE J1979 defines Mode 04 as: Request `04`, Response `44` (success) or `7F 04 XX` (failure).
- Mode 04 clears both stored (Mode 03) and pending (Mode 07) DTCs, and resets the MIL.
- Mode 04 also resets readiness monitors to "not complete" — hence the warning text in the spec.
- Permanent DTCs (Mode 0A) are NOT cleared by Mode 04 — the ECU will reject the clear for these.
- After a successful clear, a re-scan (Mode 03/07/0A) should return zero codes (or only permanent codes that could not be cleared).

### Alternatives Considered
- **Clear per-module**: Some manufacturer-specific protocols support per-ECU clearing. Rejected — standard OBD-II Mode 04 is a global clear, which is what generic adapters support.
- **Automatic re-scan after clear**: Considered but rejected — the spec requires explicit user action ("Run scan again") rather than auto-re-scan, because the technician may want to drive the vehicle before re-scanning to verify the repair.

---

## 5. Fuel System Status (PID 03) — Decode Rules

### Decision
Decode PID 03 as a status enum with human-readable labels. The 2-byte response encodes fuel system 1 and fuel system 2 status.

### Rationale
SAE J1979 PID 03 response format:
- Byte A: Fuel System 1 status
- Byte B: Fuel System 2 status (or 0x00 if not supported)

Status values for each fuel system:
| Hex | Meaning |
|---|---|
| 0x01 | Open Loop - Insufficient Engine Temperature |
| 0x02 | Closed Loop - No Faults |
| 0x04 | Open Loop - Engine Load or Fuel Cut |
| 0x08 | Open Loop - Due to Fault |
| 0x10 | Closed Loop - Some Fault |

The vehicle data JSONB will store: `{ "fuelSystemStatus": { "value": "Closed Loop", "supported": true, "details": { "system1": "Closed Loop", "system2": null } } }`.

---

## 6. Readiness Monitors (PID 01) — Decode Rules

### Decision
Decode PID 01 readiness monitor bitmask into named monitor statuses. The 4-byte response encodes both "supported" bits and "complete" bits.

### Rationale
SAE J1979 PID 01 response format (6 bytes total: 2 for MIL/DTF count, 4 for monitors):
- Byte A bits 0-6: Monitor supported flags
- Byte A bit 7: MIL on/off
- Byte B: Number of confirmed DTCs
- Bytes C-D: Monitor completion flags (continuously monitored)
- Bytes E-F: Monitor completion flags (once-per-trip monitored)

Standard monitors decoded:
| Bit | Monitor |
|---|---|
| 0 | MISFIRE |
| 1 | FUEL_SYSTEM |
| 2 | COMPONENTS |
| 3-7 | (reserved/spare) |
| 8 | CATALYST |
| 9 | HEATED_CATALYST |
| 10 | EVAP |
| 11 | SECONDARY_AIR |
| 12 | A/C_REFRIGERANT |
| 13 | OXYGEN_SENSOR |
| 14 | OXYGEN_SENSOR_HEATER |
| 15 | EGR/VVT |

The vehicle data JSONB will store readiness monitors as: `{ "readinessMonitors": { "value": { "misfire": { "supported": true, "complete": true }, "fuelSystem": { "supported": true, "complete": true }, "components": { "supported": true, "complete": false }, ... }, "supported": true } }`.

---

## 7. Mock Agent Vehicle Data Responses

### Decision
The mock agent (used in tests and development) will return realistic vehicle data with configurable PID support. A default mock returns all PIDs supported except mileage. A configurable flag can simulate unsupported mileage and/or fuel level.

### Rationale
- Most vehicles support PID 42 (voltage), PID 01 (readiness), PID 03 (fuel system status), PID 04 (engine load), and Mode 09 PID 02 (VIN).
- Mileage (PID 31/Mode 09 PID 31) is the least reliably supported PID across generic adapters.
- The mock should reflect this reality so the "Not supported" UI path is exercised during development.
- For DTC clear, the mock should return success by default, with a configurable failure flag.

### Mock Response Shapes

**Vehicle Data (READ_VEHICLE_DATA response)**:
```json
{
  "batteryVoltage": { "value": 12.4, "unit": "V", "supported": true },
  "vin": { "value": "1HGCM82633A123456", "supported": true },
  "readinessMonitors": { "value": { ... }, "supported": true },
  "fuelSystemStatus": { "value": "Closed Loop", "supported": true },
  "calculatedEngineLoad": { "value": 32.5, "unit": "%", "supported": true },
  "fuelLevel": { "value": 75, "unit": "%", "supported": true },
  "mileage": { "value": null, "unit": "km", "supported": false },
  "supportedPids": { "01": ["01", "03", "04", "05", "0C", "0D", "2F", "42"], "09": ["02"] }
}
```

**DTC Clear (CLEAR_DTC response)**:
```json
{ "success": true }
// or
{ "success": false, "reason": "ECU rejected clear command" }
```

---

## 8. Command Queue Integration Pattern

### Decision
Extend the existing agent command queue (Feature 004) with two new command types and three new event types. The pattern follows the existing scan-queue/scan-events flow.

### Rationale
The existing flow (Feature 004):
1. User initiates action → backend creates command in queue
2. Agent polls `GET /obd/agents/:id/scan-queue` → receives commands
3. Agent pushes events via `POST /obd/agents/:id/scan-events` → backend processes

New commands to add:
- `READ_VEHICLE_DATA` — agent reads one-shot vehicle data PIDs and pushes `VEHICLE_DATA_READ` event
- `CLEAR_DTC` — agent sends Mode 04 and pushes `DTC_CLEARED` or `DTC_CLEAR_FAILED` event

The vehicle-data and dtc-clear modules will queue commands by updating the `DiagnosticSession` state (or a command table). The agent-webhook controller will handle the new event types and delegate to the appropriate service.

### Alternatives Considered
- **Separate command endpoints**: Dedicated agent endpoints for vehicle-data and clear commands. Rejected — the existing scan-queue/scan-events pattern is established and the agent polls a single queue. Adding new command types is simpler than new endpoints.
- **Use LiveDataCommand table**: Feature 006 introduced a `LiveDataCommand` table for agent polling commands. Could reuse this for vehicle data and clear commands. Accepted — the `LiveDataCommand` table is the agent command queue; extend it with new command types rather than creating a separate queue.

---

## 9. Concurrent Clear Prevention

### Decision
Use a service-layer transient state flag (in-memory Map or Redis) to track "pending clear" per session. The flag is set when DTC_CLEAR_REQUESTED is written and cleared when DTC_CLEAR_COMPLETED or DTC_CLEAR_FAILED arrives. If a second clear is requested while the flag is set, return HTTP 409 Conflict.

### Rationale
- The "pending clear" state is short-lived (seconds to a minute) — it's the time between the user confirming and the agent responding.
- A dedicated database field for transient state adds migration overhead and schema complexity.
- The flag must be cleared on service restart (graceful) — a missed DTC_CLEAR_COMPLETED/FDTC_CLEAR_FAILED after restart is handled by a timeout (the agent will not respond, and the flag expires).
- For MVP scale (~5 concurrent sessions), an in-memory Map is sufficient. Redis can be added later without API contract changes.

### Alternatives Considered
- **Database flag on DiagnosticSession**: Rejected — adds a column for transient state that doesn't need persistence.
- **Redis key**: More robust for multi-instance deployments. Rejected for MVP scale — in-memory is sufficient and Redis can be slotted in transparently later.