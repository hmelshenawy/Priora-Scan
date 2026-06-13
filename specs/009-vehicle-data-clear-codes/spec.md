# Feature Specification: Vehicle Health & DTC Clear

**Feature Branch**: `009-vehicle-data-clear-codes`

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Feature 006B.3 — Vehicle Health & DTC Clear. Expand the diagnostic capability beyond basic DTC display by adding useful read-only vehicle data and safe fault-code clearing."

## Context

PrioraScan Features 001–007 are complete or in progress: Vehicle Management, Authentication, Diagnostic Sessions, OBD Foundation (Desktop Agent, VIN read, fault code import), Fault Code Intelligence (enriched knowledge base), Live Data & Sensor Monitoring (PID Foundation, VIN Intelligence, Live Data thin slice), and Diagnostic Results UI Polish (Control Unit Overview). A technician can now complete a full OBD scan, view enriched fault codes organized by control unit, and see live sensor telemetry.

However, two important diagnostic capabilities are still missing:

1. **Vehicle Health** — The technician cannot yet view useful one-shot vehicle information such as odometer/mileage, fuel level, readiness monitors, battery voltage, fuel system status, engine load, or the supported PID list. These are standard diagnostic checks a technician performs on every vehicle and are distinct from the streaming live-data feature (Feature 006).

2. **DTC Clear** — After diagnosing and repairing a vehicle, a technician must clear the stored DTCs and reset the check-engine light to verify the repair. PrioraScan currently has no way to send a Mode 04 (Clear DTC) command. This is a critical step in the diagnostic workflow: without it, the technician must use a separate scan tool to clear codes, defeating the purpose of an all-in-one diagnostic platform.

Feature 009 delivers both capabilities in a single feature with two clearly separated implementation phases:

- **Phase A — Vehicle Health**: One-shot reads of standard vehicle data points (battery voltage, VIN confirmation, readiness monitors, fuel system status, calculated engine load, fuel level, odometer/mileage, supported PID list) stored as a JSONB snapshot on the Diagnostic Session.
- **Phase B — DTC Clear**: Safe, confirmed clearing of DTCs via Mode 04, with audit trail and re-scan capability.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Read Vehicle Data During a Diagnostic Session (Priority: P1, Phase A)

A technician opens an active Diagnostic Session for a vehicle with a connected adapter. They press "Read Vehicle Data" and the system queries the vehicle for standard one-shot data points: battery voltage, VIN confirmation, readiness monitor status, fuel system status, calculated engine load, fuel level, and odometer/mileage. Each data point displays as "Supported" with its current value, or "Not supported by vehicle / adapter" if the vehicle or adapter does not support that PID. The results are stored as a JSONB snapshot on the Diagnostic Session.

**Why this priority**: This is the core value of Phase A. Without the ability to read and display vehicle health data, the Diagnostic Session lacks the one-shot vehicle overview that every professional scan tool provides. This is the most common first check a technician performs.

**Independent Test**: With a connected adapter and an open Diagnostic Session, press "Read Vehicle Data," verify that the Vehicle Health panel populates with values or "Not supported" labels for each data point within 30 seconds. No values should be fabricated for unsupported PIDs.

**Acceptance Scenarios**:

1. **Given** an open Diagnostic Session with a connected adapter and a vehicle that supports all standard data PIDs, **When** the technician presses "Read Vehicle Data," **Then** the system sends a READ_VEHICLE_DATA command through the agent, the Vehicle Health panel displays each data point with its current value and unit, and the data is persisted as a JSONB snapshot on the session.
2. **Given** an open Diagnostic Session with a connected adapter and a vehicle that does not support mileage (odometer PID), **When** the technician presses "Read Vehicle Data," **Then** the mileage field displays "Not supported by vehicle / adapter" and all other supported fields display their values normally.
3. **Given** an open Diagnostic Session with no connected adapter, **When** the technician presses "Read Vehicle Data," **Then** the system informs the user that no adapter is connected and the read cannot proceed.
4. **Given** a completed vehicle data read, **When** the technician returns to the session later, **Then** the previously read vehicle data is still visible on the session detail page (persisted in session JSONB).

---

### User Story 2 — View Vehicle Health Panel on Session Detail Page (Priority: P1, Phase A)

A technician or service advisor opens a Diagnostic Session detail page and sees a "Vehicle Health" panel that shows the most recently read vehicle data points with their values, units, and support status. If no vehicle data has been read yet, the panel shows a "Read Vehicle Data" action button.

**Why this priority**: This is the persistent display of Phase A's core value. Without the panel, the vehicle data read has no visible home and the user cannot review previously read data.

**Independent Test**: Open a Diagnostic Session that has previously read vehicle data. Verify the Vehicle Health panel shows all data points with values or "Not supported" labels. Open a session that has not yet read vehicle data. Verify the panel shows the "Read Vehicle Data" action.

**Acceptance Scenarios**:

1. **Given** a Diagnostic Session that has previously read vehicle data, **When** a user opens the session detail page, **Then** the Vehicle Health panel displays each data point (battery voltage, VIN, readiness monitors, fuel system status, engine load, fuel level, mileage, supported PIDs) with its value, unit, and a supported/unsupported indicator.
2. **Given** a Diagnostic Session that has not yet read vehicle data, **When** a user opens the session detail page, **Then** the Vehicle Health panel displays a "Read Vehicle Data" action button (if an adapter is connected) or a "No adapter connected" message.
3. **Given** a Diagnostic Session with vehicle data where some PIDs were unsupported, **When** the user views the Vehicle Health panel, **Then** unsupported PIDs display "Not supported by vehicle / adapter" and supported PIDs display their values — the panel does not mix unsupported indicators with real values or leave gaps.

---

### User Story 3 — Clear Fault Codes After Repair (Priority: P1, Phase B)

A technician has completed a repair on a vehicle whose fault codes were read during a Diagnostic Session. They press "Clear Fault Codes" in the fault code area. A confirmation modal appears warning: "Clearing fault codes may erase diagnostic evidence and reset readiness monitors." The technician must acknowledge the warning (via checkbox or typing "CLEAR") before proceeding. After confirming, the system sends a CLEAR_DTC command through the agent command queue. The result (success or failure) is displayed clearly.

**Why this priority**: This is the core value of Phase B. Without the ability to clear fault codes, the technician cannot verify repairs through PrioraScan and must use a separate tool — breaking the all-in-one diagnostic workflow.

**Independent Test**: Open a Diagnostic Session that has fault codes. Press "Clear Fault Codes." Verify the confirmation modal appears. Acknowledge the warning and confirm. Verify the clear command is queued and the result (success/failure) is displayed.

**Acceptance Scenarios**:

1. **Given** a Diagnostic Session that has active or pending fault codes and a connected adapter, **When** the technician presses "Clear Fault Codes," **Then** a confirmation modal appears with the warning text and a required confirmation action (checkbox or text input).
2. **Given** the confirmation modal is displayed, **When** the technician does not acknowledge the warning, **Then** the "Confirm" button remains disabled and the clear action cannot proceed.
3. **Given** the technician acknowledges the warning and confirms, **When** the clear command is submitted, **Then** a CLEAR_DTC command is queued through the agent, the session state is updated only after the agent confirms success, and a success banner is displayed.
4. **Given** the clear command fails (adapter error, ECU rejection), **When** the agent reports failure, **Then** a failure banner is displayed and the existing fault codes remain in the session unchanged.
5. **Given** a Diagnostic Session with no fault codes, **When** the user views the session, **Then** the "Clear Fault Codes" button is not displayed.

---

### User Story 4 — Re-Scan After Clearing Fault Codes (Priority: P2, Phase B)

After successfully clearing fault codes, the technician is offered a "Run scan again" action that initiates a new OBD scan to verify the repair. The new scan results replace the current fault code list in the session, while the previous scan results are preserved as historical evidence.

**Why this priority**: Re-scanning after clearing is the standard verification step. It confirms the repair resolved the issue. It is secondary to the clear action itself but essential for the complete workflow.

**Independent Test**: After a successful clear, verify the "Run scan again" action appears. Press it and verify a new scan starts. After completion, verify the session shows the new scan results and the previous results are available as historical evidence.

**Acceptance Scenarios**:

1. **Given** a successful fault code clear, **When** the success banner is displayed, **Then** a "Run scan again" action is shown alongside the success banner.
2. **Given** the technician presses "Run scan again," **When** the new scan completes, **Then** the session's current fault code list reflects the new scan results (zero codes if the repair was successful, or a reduced set).
3. **Given** a previous scan existed before the clear, **When** the new scan completes, **Then** the previous scan results are preserved as historical evidence and remain accessible through the session audit trail.

---

### User Story 5 — View Supported PID List (Priority: P2, Phase A)

After reading vehicle data, the technician can view the list of PIDs that the vehicle's ECU supports. This helps the technician understand what data the vehicle can provide, including which live data PIDs are available for the Live Data feature.

**Why this priority**: The supported PID list is useful for diagnostic planning but is secondary to the primary vehicle data values. It informs the technician about the vehicle's capabilities rather than providing a direct diagnostic reading.

**Independent Test**: Complete a vehicle data read. Verify the supported PID list is visible in the Vehicle Health panel. Verify that unsupported PIDs are clearly distinguished from supported ones.

**Acceptance Scenarios**:

1. **Given** a completed vehicle data read, **When** the technician views the Vehicle Health panel, **Then** a "Supported PIDs" section lists the PIDs the vehicle supports, grouped by mode (Mode 01, etc.).
2. **Given** a completed vehicle data read, **When** the technician views the supported PID list, **Then** each supported PID shows its hex code and human-readable name; unsupported PIDs are not listed (the list shows what IS supported).

---

### User Story 6 — Clear Fault Codes Audit Trail (Priority: P2, Phase B)

Every clear fault codes action generates immutable audit events: DTC_CLEAR_REQUESTED (when the user confirms), DTC_CLEAR_COMPLETED (when the agent confirms success), and DTC_CLEAR_FAILED (when the agent reports failure). These audit events are tenant-scoped and visible in the session audit trail.

**Why this priority**: Auditability is essential for workshop compliance and dispute resolution. It is secondary to the functional clear action but must ship with it.

**Independent Test**: Perform a successful clear operation. Verify three audit events (REQUESTED, COMPLETED) appear in the session audit trail. Perform a failed clear. Verify two audit events (REQUESTED, FAILED) appear.

**Acceptance Scenarios**:

1. **Given** a successful fault code clear, **When** the clear completes, **Then** two audit events are written: DTC_CLEAR_REQUESTED (with the user ID and timestamp) and DTC_CLEAR_COMPLETED (with the agent result and timestamp).
2. **Given** a failed fault code clear, **When** the agent reports failure, **Then** two audit events are written: DTC_CLEAR_REQUESTED and DTC_CLEAR_FAILED (with the failure reason).
3. **Given** an existing audit trail for a Diagnostic Session, **When** a user in the same tenant views the session, **Then** the clear-code audit events are visible. A user in a different tenant cannot see these events.

---

### Edge Cases

- **Mileage not supported**: Many generic OBD-II adapters and vehicles do not support the odometer PID (Mode 01 PID 31 or Mode 09 PID 31). The system must display "Not supported by vehicle / adapter" rather than an error, zero, or fabricated value.
- **Fuel level not supported**: Similar to mileage — fuel level (Mode 01 PID 2F) is optional. Handle identically to mileage.
- **Readiness monitors partially supported**: Some vehicles support only a subset of readiness monitors. The system must display whichever monitors are reported and label missing ones appropriately.
- **Battery voltage and engine load read during live data session**: PIDs 42 (Control Module Voltage) and 04 (Calculated Engine Load) are already part of the Live Data MVP set. The vehicle data read should not conflict with an active live data polling session. The read is a one-shot snapshot; the live data dashboard shows the streaming value.
- **Clear fault codes with no adapter**: The clear action requires a connected adapter. If the adapter is offline, the clear button should be disabled or show a clear "No adapter connected" message.
- **Clear fault codes on a closed session**: A closed session should not allow clearing fault codes. The clear button should not appear on closed sessions.
- **Adapter disconnection mid-clear**: If the adapter disconnects while the CLEAR_DTC command is in flight, the agent should report a failure event and the system should display a failure banner.
- **Previous scan results after clear**: Previous fault code scan results must remain accessible as historical evidence. The clear operation must not delete or hide historical scan data.
- **Tenant isolation on vehicle data and clear operations**: A user in tenant A cannot read vehicle data from or clear fault codes in a session belonging to tenant B.
- **Clear codes when vehicle has only permanent codes**: Permanent DTCs cannot be cleared by Mode 04. If a session contains only permanent codes, the system should warn the user that permanent codes may not be clearable through standard OBD-II commands.
- **Race condition: user presses clear while previous clear is pending**: The system must prevent concurrent clear commands. If a clear is already pending, the button should be disabled or show "Clear in progress."

---

## Requirements *(mandatory)*

### Phase A — Vehicle Health

- **FR-001**: The system MUST allow a technician to request a one-shot read of vehicle data from within an open Diagnostic Session by sending a READ_VEHICLE_DATA command through the existing agent command queue.
- **FR-002**: The READ_VEHICLE_DATA command MUST request the following standard OBD-II data points where supported by the vehicle: battery voltage (PID 42), VIN confirmation (Mode 09 PID 02), readiness monitors (Mode 01 PID 01), fuel system status (PID 03), calculated engine load (PID 04), fuel level (PID 2F), and odometer/mileage (Mode 01 PID 31 or Mode 09 PID 31). The command MUST also include supported PID discovery (Mode 01 PIDs 00/20/40/60/80/A0).
- **FR-003**: If a vehicle data point is not supported by the vehicle or adapter, the system MUST display "Not supported by vehicle / adapter" for that data point. The system MUST NOT display zero, null, or fabricated values for unsupported PIDs.
- **FR-004**: Mileage (odometer) and fuel level MUST be treated as optional data points. Their availability varies significantly across vehicles and adapters. The system MUST NOT require them for a successful vehicle data read.
- **FR-005**: Vehicle data MUST be persisted as a JSONB snapshot (`vehicleDataJson`) directly on the Diagnostic Session, with a `vehicleDataReadAt` timestamp. This avoids a dedicated VehicleData table for the MVP while preserving all functionality, tenant isolation, and session history. The snapshot can be migrated to a dedicated table in a future feature if cross-session analytics are needed.
- **FR-006**: The system MUST display a Vehicle Health panel on the Diagnostic Session detail page showing all read data points with their values, units, and supported/unsupported status.
- **FR-007**: The Vehicle Health panel MUST show a "Read Vehicle Data" action button when no vehicle data has been read yet and an adapter is connected, or a "No adapter connected" message when no adapter is available.
- **FR-008**: The system MUST display the supported PID list in the Vehicle Health panel after a successful read, showing each supported PID with its hex code and human-readable name.
- **FR-009**: The backend MUST expose an authenticated endpoint `POST /api/v1/diagnostic-sessions/:id/vehicle-data/read` that queues a READ_VEHICLE_DATA command to the agent for the given session. The endpoint MUST validate that the session exists, belongs to the user's tenant, and has a connected adapter.
- **FR-010**: The backend MUST expose an authenticated endpoint `GET /api/v1/diagnostic-sessions/:id/vehicle-data` that returns the most recently read vehicle data for the given session, including each data point's value, unit, and supported/unsupported status.
- **FR-011**: Vehicle data MUST be tenant-scoped through the parent Diagnostic Session. A user in tenant A MUST NOT be able to read vehicle data from a session in tenant B.
- **FR-012**: The READ_VEHICLE_DATA command MUST reuse the existing agent command queue and event push mechanism from Feature 004. The agent pushes a VEHICLE_DATA_READ event with the results.
- **FR-013**: The system MUST write a `DiagnosticSessionAuditRecord` with action `VEHICLE_DATA_READ_REQUESTED` when a read is initiated and `VEHICLE_DATA_READ_COMPLETED` when the agent returns results.

### Phase B — DTC Clear

- **FR-014**: The system MUST allow a technician to clear fault codes from a Diagnostic Session that has active or pending fault codes, by sending a CLEAR_DTC command through the existing agent command queue.
- **FR-015**: The "Clear Fault Codes" action MUST only appear when the Diagnostic Session has fault codes. If the session has no fault codes, the clear action MUST NOT be displayed.
- **FR-016**: The system MUST display a confirmation modal before clearing fault codes. The modal MUST include the warning text: "Clearing fault codes may erase diagnostic evidence and reset readiness monitors."
- **FR-017**: The confirmation modal MUST require the user to actively acknowledge the warning before proceeding, either by checking a checkbox or typing a confirmation phrase. The "Confirm" button MUST remain disabled until the user acknowledges.
- **FR-018**: The system MUST NOT auto-clear fault codes under any circumstances. Clearing requires explicit user confirmation every time.
- **FR-019**: After the user confirms, the system MUST send a CLEAR_DTC command through the agent command queue. The session state MUST be updated only after the agent confirms success or failure.
- **FR-020**: Upon successful clear, the system MUST display a success banner and offer a "Run scan again" action that initiates a new OBD scan for the session.
- **FR-021**: Upon failed clear, the system MUST display a failure banner with the reason. The existing fault codes in the session MUST remain unchanged.
- **FR-022**: Previous scan results (fault codes from before the clear) MUST be preserved as historical evidence. The clear operation MUST NOT delete or hide historical scan data. A new scan after clearing shows the current state.
- **FR-023**: The system MUST prevent concurrent clear commands. If a clear is already pending for a session, subsequent clear requests MUST be rejected with a clear message (e.g., "Clear already in progress").
- **FR-024**: The clear fault codes action MUST NOT be available on closed Diagnostic Sessions. Only open sessions can clear codes.
- **FR-025**: The backend MUST expose an authenticated endpoint `POST /api/v1/diagnostic-sessions/:id/fault-codes/clear` that queues a CLEAR_DTC command to the agent for the given session. The endpoint MUST validate that the session exists, belongs to the user's tenant, is open, has fault codes, and has a connected adapter.
- **FR-026**: The system MUST write the following audit events as `DiagnosticSessionAuditRecord` entries: `DTC_CLEAR_REQUESTED` (when the user confirms and the command is queued, with metadata including `previousFaultCodeCount` and `userId`), `DTC_CLEAR_COMPLETED` (when the agent confirms success), and `DTC_CLEAR_FAILED` (when the agent reports failure, with metadata including `failureReason`). All audit events MUST be tenant-scoped and immutable. A dedicated `DtcClearRequest` table is NOT required for the MVP — the audit records capture all necessary tracking data.
- **FR-027**: If the session contains only permanent (PERMANENT status) fault codes, the system MUST warn the user that permanent codes may not be clearable through standard OBD-II Mode 04 before proceeding with the clear attempt.
- **FR-028**: Clear fault codes operations MUST be tenant-scoped. A user in tenant A MUST NOT be able to clear fault codes in a session belonging to tenant B.

### Backward Compatibility

- **FR-029**: The existing Feature 004 scan flow, Feature 005 enrichment flow, Feature 006 live data flow, and Feature 007 control unit scan presentation MUST continue to work unchanged after this feature ships. The Desktop Agent's existing command queue MUST be extended, not replaced.
- **FR-030**: The new endpoints MUST NOT introduce any new permission requirements. The same authenticated users who can view a Diagnostic Session in their tenant can read vehicle data and clear fault codes.

### Out-of-Scope Constraints

- **FR-031**: This feature MUST NOT include: actuation tests, service functions, coding/programming/flashing, manufacturer-specific ECU topology, ABS/SRS/BCM real diagnostics, reports, AI analysis, graphing, or snapshot capture.

### Key Entities *(include if feature involves data)*

- **DiagnosticSession** (existing, extended with two new columns for MVP):
  - `vehicleDataJson` (JSONB, nullable): A one-shot snapshot of vehicle health data read from the ECU. Shape: `{ "batteryVoltage": { "value": 12.4, "unit": "V", "supported": true }, "vin": { "value": "1HGCM82633A123456", "supported": true }, "readinessMonitors": { "value": { "misfire": "complete", "fuelSystem": "complete", "components": "incomplete" }, "supported": true }, "fuelSystemStatus": { "value": "Closed Loop", "supported": true }, "calculatedEngineLoad": { "value": 32.5, "unit": "%", "supported": true }, "fuelLevel": { "value": 75, "unit": "%", "supported": true }, "mileage": { "value": null, "unit": "km", "supported": false }, "supportedPids": { "01": ["0C", "0D", "05", "42", "03", "04", "2F", "11"], "09": ["02"] } }`. Each data point includes `supported`, `value`, and `unit`. Unsupported PIDs have `supported: false` and `value: null`. Follows the JSONB snapshot pattern established by `LiveDataSnapshot.values` in Feature 006.
  - `vehicleDataReadAt` (Timestamp, nullable): When the vehicle data snapshot was last read. Null means no vehicle data has been read for this session.

- **DiagnosticSessionAuditRecord** (existing, extended with new action types): The existing audit trail entity is used for DTC clear tracking instead of a dedicated `DtcClearRequest` table. New actions: `DTC_CLEAR_REQUESTED` (metadata: `{ previousFaultCodeCount, userId }`), `DTC_CLEAR_COMPLETED`, `DTC_CLEAR_FAILED` (metadata: `{ failureReason }`), `VEHICLE_DATA_READ_REQUESTED`, `VEHICLE_DATA_READ_COMPLETED`. All audit records are tenant-scoped and immutable.

- **VehicleDataPoint** (read-model / DTO, not a stored entity): The combined view of a single vehicle data point with its value, unit, and support status. Parsed from `DiagnosticSession.vehicleDataJson` by the service layer. Used by the frontend to render the Vehicle Health panel uniformly.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A technician can read vehicle data from an open Diagnostic Session and see all supported values (battery voltage, VIN, readiness monitors, fuel system status, engine load, fuel level, mileage) displayed in the Vehicle Health panel within 30 seconds of pressing "Read Vehicle Data."
- **SC-002**: Unsupported vehicle data points display "Not supported by vehicle / adapter" rather than errors, zeros, or fabricated values — 100% of the time.
- **SC-003**: Previously read vehicle data persists and is visible when a user reopens the Diagnostic Session later — verified by closing and reopening the session.
- **SC-004**: A technician can clear fault codes from an open Diagnostic Session with a connected adapter, after confirming the warning modal, and see a success or failure result within 60 seconds of confirming.
- **SC-005**: The confirmation modal blocks 100% of accidental fault code clears — no clear can proceed without the user explicitly acknowledging the warning.
- **SC-006**: After a successful clear, the "Run scan again" action is displayed and initiates a new scan that completes normally.
- **SC-007**: 100% of clear fault code operations generate the appropriate audit events (DTC_CLEAR_REQUESTED + DTC_CLEAR_COMPLETED or DTC_CLEAR_FAILED), visible in the session audit trail.
- **SC-008**: Previous scan results are preserved after a successful clear — a technician can see the historical fault code data from before the clear.
- **SC-009**: A user in tenant A cannot read vehicle data from or clear fault codes in a Diagnostic Session belonging to tenant B.
- **SC-010**: The existing Feature 004/005/006/007 flows continue to work after this feature ships. Existing tests continue to pass.

## Assumptions

- The user is multi-tenant and the existing tenant-isolation model in `DiagnosticSession` is preserved. All new data is tenant-scoped through the parent session.
- The Desktop Agent continues to be the bridge for OBD communication. READ_VEHICLE_DATA and CLEAR_DTC are new command types added to the existing command queue; they follow the same event-push pattern established in Feature 004.
- Mileage (odometer) and fuel level are treated as optional because generic OBD-II support varies. Many vehicles and adapters do not expose these PIDs. The system must handle their absence gracefully.
- **Vehicle data is stored as a JSONB snapshot (`vehicleDataJson`) on `DiagnosticSession`** rather than in a dedicated `VehicleData` table. This follows the JSONB snapshot pattern established by `LiveDataSnapshot.values` in Feature 006. The data has no independent lifecycle — it is always session-scoped. If cross-session vehicle-data analytics are needed in the future, a migration from JSONB to a dedicated table is additive.
- **DTC clear tracking uses `DiagnosticSessionAuditRecord` entries** rather than a dedicated `DtcClearRequest` table. The audit records capture who, when, outcome, and metadata (previous code count, failure reason). The "pending clear" state during command execution is transient service-layer state, not persistent domain state.
- The Vehicle Data read is a one-shot snapshot, distinct from the streaming Live Data feature (Feature 006). It uses the same PID infrastructure (PIDDefinition table, supported-PID mask) but does not start a polling session.
- Battery voltage (PID 42) and calculated engine load (PID 04) are already part of the Live Data MVP set (Feature 006). The vehicle data read captures one-shot values; it does not conflict with or replace the live data streaming values. Both can coexist in the same session.
- Fuel system status (PID 03) is a standard status PID that reports the fuel system's operating mode (Open Loop, Closed Loop, Open Loop Due to Fault, etc.). It is a one-shot read-only value, universally supported on OBD-II vehicles.
- The VIN confirmation read (Mode 09 PID 02) reuses the existing VIN-read capability from Feature 004 but presents it as a data point in the Vehicle Health panel rather than as a vehicle-identification step.
- The supported PID list from Mode 01 PID 00/20/40/60/80/A0 overlaps with the PID Discovery feature from Feature 006. In this feature, the supported PID list is displayed as part of the Vehicle Health panel. The Feature 006 discovery remains the mechanism used for the Live Data dashboard.
- Clear fault codes uses OBD-II Mode 04 (Clear DTCs and reset MIL). This is a standard SAE J1979 service. The Desktop Agent sends the command and reports success/failure.
- Permanent DTCs (Mode 0A) cannot be cleared by Mode 04. The system warns the user but does not prevent the clear attempt — the ECU itself will reject the clear for permanent codes, and the result is reported back.
- Previous fault codes remain as `SessionFaultCode` records with their original timestamps; the clear does not delete them. A new scan after clearing creates new `SessionFaultCode` records.
- The new endpoints do not require new permissions beyond the existing read/write access to Diagnostic Sessions in the tenant.
- The mock agent will simulate realistic optional vehicle data (including unsupported mileage) and simulate clear DTC success/failure scenarios for development and testing.

## Out of Scope (Confirmed Exclusions)

Feature 009 explicitly does **NOT** include any of the following; they remain in future roadmap phases:

- **Actuation tests** — bi-directional control of vehicle actuators
- **Service functions** — throttle adaptation, steering angle reset, oil reset, etc.
- **Coding/programming/flashing** — ECU software modification
- **Manufacturer-specific ECU topology** — dynamic discovery of vehicle-specific modules
- **ABS/SRS/BCM real diagnostics** — actual hardware communication beyond OBD-II
- **Reports** — PDF/digital report generation (Feature 008 in the PRD roadmap, separate from this spec)
- **AI Analysis** — AI-powered diagnostic recommendations
- **Graphing** — visualization of live or historical sensor data
- **Snapshot capture** — saving live data snapshots (already in Feature 006)

## Implementation Phase Separation

This feature has two clearly separated implementation phases:

### Phase A — Vehicle Health

Delivers: User Stories 1, 2, 5; FR-001 through FR-013; backend vehicle-data endpoints; `vehicleDataJson` and `vehicleDataReadAt` columns on `DiagnosticSession`; READ_VEHICLE_DATA agent command; Vehicle Health panel UI; supported PID list display.

### Phase B — DTC Clear

Delivers: User Stories 3, 4, 6; FR-014 through FR-028; backend fault-codes/clear endpoint; DTC_CLEAR_REQUESTED/COMPLETED/FAILED audit records (using existing `DiagnosticSessionAuditRecord`); CLEAR_DTC agent command; confirmation modal; success/failure banners; re-scan action.

Phase B depends on Phase A being substantially complete (shared session context, agent command queue extensions, vehicle data infrastructure) but the two phases can be developed and tested incrementally.