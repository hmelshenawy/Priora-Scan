# Feature Specification: Extended Live Data PIDs — Full Pipeline

**Feature Branch**: `018-extended-live-data-pids`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "Extend PrioraScan vehicle health capabilities to expose advanced fuel and air diagnostic PIDs through the complete pipeline: Desktop Agent → VehicleDataJson → Backend API → Frontend UI. Builds on completed Feature 018A validation framework. No AI diagnostics, no ECU discovery, no UDS, no graphing, no historical storage."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Fuel Trim Data (Priority: P1) 🎯 MVP

As a technician diagnosing a vehicle, I want to see Short Term and Long Term Fuel Trim values for both banks so that I can quickly identify lean or rich operating conditions.

**Why this priority**: Fuel trim data is the most diagnostically valuable extended PID group. P0171 (System Too Lean) is one of the most common OBD-II fault codes, and fuel trims are essential for diagnosing it. This user story delivers the highest diagnostic value first.

**Independent Test**: Can be fully tested by running the desktop agent against a mock vehicle with supported/unsupported fuel trim PIDs, verifying the backend persists the data, the API returns it, and the frontend renders it with correct state handling.

**Acceptance Scenarios**:

1. **Given** a vehicle that supports STFT Bank 1 and LTFT Bank 1, **When** the health scan completes, **Then** the Fuel & Air Data section displays "STFT Bank 1: [value] %" and "LTFT Bank 1: [value] %" with the hint state.
2. **Given** a vehicle that supports all four fuel trim PIDs, **When** the health scan completes, **Then** all four fuel trim values are displayed with their units and availability state.
3. **Given** a vehicle that does not support Bank 2 fuel trims (PIDs 08, 09 not in bitmap), **When** the health scan completes, **Then** STFT Bank 2 and LTFT Bank 2 show "Not Supported" and no OBD command is sent for them.
4. **Given** a vehicle that supports a fuel trim PID but it returns NO DATA, **When** the health scan completes, **Then** that fuel trim shows "No Data" without crashing.
5. **Given** a fuel trim value above +10%, **When** displayed, **Then** a subtle "Lean Tendency" hint badge is shown next to the value.
6. **Given** a fuel trim value between -10% and +10%, **When** displayed, **Then** a subtle "Normal" hint badge is shown next to the value.
7. **Given** a fuel trim value below -10%, **When** displayed, **Then** a subtle "Rich Tendency" hint badge is shown next to the value.

---

### User Story 2 - View Airflow and Intake Data (Priority: P2)

As a technician, I want to see MAP, MAF, and Throttle Position values so that I can evaluate sensor behavior during diagnosis.

**Why this priority**: Airflow and intake data complements fuel trim analysis. While fuel trims are the primary diagnostic tool, MAF and throttle data help confirm sensor-based hypotheses. This story adds the remaining extended PIDs.

**Independent Test**: Can be tested by running a scan against a vehicle profile with MAP/MAF/throttle support and verifying the UI renders all three values correctly.

**Acceptance Scenarios**:

1. **Given** a vehicle that supports MAP (PID 0B), **When** the health scan completes, **Then** MAP value is displayed in kPa with the correct availability state.
2. **Given** a vehicle that supports MAF (PID 10), **When** the health scan completes, **Then** MAF value is displayed in g/s with the correct availability state.
3. **Given** a vehicle that supports Throttle Position (PID 11), **When** the health scan completes, **Then** Throttle Position value is displayed in % with the correct availability state.
4. **Given** a vehicle that does not support MAF, **When** the health scan completes, **Then** MAF shows "Not Supported" and the other values still display correctly.
5. **Given** a vehicle that supports MAF but it returns NO DATA, **When** the health scan completes, **Then** MAF shows "No Data" and the other values still display correctly.

---

### User Story 3 - Full Pipeline Integration (Priority: P3)

As a PrioraScan developer, I want the extended PID data to flow through the complete agent → backend → frontend pipeline so that real vehicle data can be validated through the UI without console access.

**Why this priority**: The pipeline integration connects the validated PIDs (018A) to the end user. Without it, extended PID data remains console-only. This story completes the full data flow.

**Independent Test**: Can be tested end-to-end by running a vehicle scan with a mock adapter and verifying data flows from agent through backend persistence to frontend display.

**Acceptance Scenarios**:

1. **Given** a completed vehicle health scan with extended PIDs, **When** the data is persisted to VehicleDataJson, **Then** the JSON contains `stftBank1`, `ltftBank1`, `stftBank2`, `ltftBank2`, `map`, `maf`, and `throttlePosition` fields with their full result objects.
2. **Given** a persisted diagnostic session with extended PID data, **When** the vehicle data API is called, **Then** the response includes extended PID fields in the same structure as existing health PIDs.
3. **Given** extended PID data in the API response, **When** the frontend renders VehicleHealthPanel, **Then** a "Fuel & Air Data" section appears with all extended PID values.
4. **Given** a vehicle that does not support any extended PIDs, **When** the frontend renders VehicleHealthPanel, **Then** no "Fuel & Air Data" section is shown (or it shows "Not Supported" for each field without crashing).
5. **Given** a vehicle where supported PID discovery fails, **When** the health scan completes, **Then** existing basic health PIDs still return their values (if available), extended PIDs are represented as unavailable with reason `PID_DISCOVERY_FAILED`, and the scan completes without crashing.

---

### Edge Cases

- What happens when a vehicle supports Bank 1 fuel trims but not Bank 2? — Bank 2 PIDs show "Not Supported" while Bank 1 values display normally.
- What happens when the agent returns data for a PID that the frontend type doesn't expect? — Frontend handles missing optional fields gracefully without crashing (FR-007).
- What happens when the VehicleDataJson from an older agent (pre-018B) is loaded? — Extended PID fields are missing, so the frontend shows the "Not Supported" state (backward compatibility). This is handled identically to unsupported PIDs.
- What happens when MAF returns an unusually large value (e.g., 650 g/s on a heavy-duty engine)? — The value displays as-is with its unit; no range clamping or validation is performed at the display level.
- What happens when supported PID discovery fails entirely? — Existing standard health PIDs follow the current fallback behavior (attempt all configured PIDs). Extended PIDs MUST NOT be blindly queried. Each extended PID is represented as unavailable with reason `PID_DISCOVERY_FAILED`. The health scan completes without crashing. Basic health values are still returned if available. The Fuel & Air Data section does not crash and shows "Not Available" for discovery-failed PIDs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The desktop agent MUST extend production vehicle health polling to include PIDs 06, 07, 08, 09, 0B, 10, and 11, using the existing supported PID discovery mechanism. The agent MUST NOT send OBD commands for PIDs that the vehicle bitmap indicates are unsupported.

- **FR-002**: Each extended PID result MUST use the existing HealthPidResult shape: `{ pid, supported, available, value, unit, rawResponse }`. No new result model is introduced.

- **FR-003**: Extended PID values MUST be persisted into the existing `DiagnosticSession.vehicleDataJson` field. No new database tables or schema changes are required.

- **FR-004**: Extended PID values MUST be exposed through the existing `GET /api/v1/diagnostic-sessions/:sessionId/vehicle-data` endpoint. DTOs and typings MUST be extended to include the new fields while maintaining backward compatibility.

- **FR-005**: Frontend TypeScript types in `vehicle-data-api.ts` MUST be extended with optional fields: `stftBank1`, `ltftBank1`, `stftBank2`, `ltftBank2`, `map`, `maf`, `throttlePosition`. These fields are optional to maintain backward compatibility with pre-018B data.

- **FR-006**: A new "Fuel & Air Data" section MUST be added inside `VehicleHealthPanel`, displaying STFT Bank 1, LTFT Bank 1, STFT Bank 2, LTFT Bank 2, MAP, MAF, and Throttle Position with their values and units.

- **FR-007**: State handling MUST follow these rules:
  - Supported + Available → Display value and unit (e.g., "2.3 %")
  - Supported + Unavailable → Display "No Data"
  - Unsupported → Display "Not Supported"
  - Missing field → Do not crash (graceful handling of pre-018B data)

- **FR-008**: Fuel trim hint badges MUST be displayed as lightweight, non-diagnostic indicators only:
  - Values between -10% and +10% → "Normal" badge
  - Values above +10% → "Lean Tendency" badge
  - Values below -10% → "Rich Tendency" badge
  - No repair recommendations, no AI language, no diagnosis

- **FR-009**: All extended PIDs MUST be visible from a real vehicle session through the UI, without requiring console access. The purpose is to allow a single vehicle validation session through the UI.

- **FR-010**: The desktop agent MUST reuse the reader functions and CONFIGURED_EXTENDED_PIDS from Feature 018A's `extended_pids.py` module. The integration MUST happen in `vehicle_health.py` — the existing `read_vehicle_health()` function MUST be extended to include the extended PIDs alongside the current health PIDs.

- **FR-011**: The existing `vehicle_health.py` workflow MUST integrate the extended PID readers from CONFIGURED_EXTENDED_PIDS into production vehicle health polling. No `vehicle_data.py` re-export changes are required. The integration MUST preserve the existing health PID behavior for RPM, Speed, Coolant Temperature, Engine Load, Fuel Level, and Control Module Voltage.

- **FR-012**: Backend DTOs and API response types MUST be extended with the new extended PID fields. The response MUST maintain backward compatibility — clients that do not expect extended PID fields MUST continue to work without errors.

- **FR-013**: The VehicleHealthPanel MUST NOT modify existing health data display (RPM, Speed, Coolant, Engine Load, Battery Voltage). The Fuel & Air Data section MUST be added as a new section, not a replacement.

- **FR-014**: All existing tests for vehicle health, readiness, freeze frame, DTC, VIN, and extended PID validation (Feature 018A) MUST continue to pass without modification.

- **FR-015**: The `extended_pids.py` module created in Feature 018A MUST NOT be modified. Feature 018B integrates it into the production pipeline without changing the validation-only module.

- **FR-016**: Unit tests MUST cover: agent extended PID polling with supported/unsupported/NO DATA scenarios, backend VehicleDataJson persistence with extended fields, API response serialization with new fields, and frontend rendering of all state combinations.

- **FR-017**: Frontend tests MUST verify that the VehicleHealthPanel renders supported values, unsupported state ("Not Supported"), no-data state ("No Data"), and handles missing optional fields without crashing.

- **FR-018**: The mock profile `extended_pid_validation_profile.py` created in Feature 018A MUST NOT be modified. The existing `toyota_real_sample.py` profile remains a frozen reference.

- **FR-019**: If supported PID discovery fails, the system MUST preserve existing standard health fallback behavior (attempt all configured health PIDs), but extended PIDs MUST NOT be blindly queried. Instead, each extended PID MUST be represented safely as unavailable or unsupported with reason `PID_DISCOVERY_FAILED`. The health scan MUST complete without crashing. Existing basic health values MUST still be returned if available.

- **FR-020**: If an extended PID is missing or marked unavailable because PID discovery failed, the Fuel & Air Data section MUST NOT crash. The row MUST display a safe state such as "Not Available" or "Not Supported". No diagnosis or warning MUST be shown.

### Key Entities

- **Extended Health PID**: The extended PIDs (06, 07, 08, 09, 0B, 10, 11) are added to the production vehicle health polling pipeline alongside the existing health PIDs (04, 05, 0C, 0D, 42, 2F) through `vehicle_health.py`. They use the same three-state result model and are persisted in the same VehicleDataJson structure.
- **Fuel & Air Data Card**: A new UI section within VehicleHealthPanel that groups fuel trim and airflow data together. Contains 7 data rows with value/unit display, support/availability state, and fuel trim hints.
- **Fuel Trim Hint**: A lightweight, non-diagnostic badge displayed next to fuel trim values indicating whether the value is within normal range (-10% to +10%), shows lean tendency (above +10%), or shows rich tendency (below -10%). Not AI, not a diagnosis, not a repair recommendation.
- **Discovery Failure Guard**: When supported PID discovery fails, extended PIDs are not blindly queried. Instead, they are represented as unavailable with reason `PID_DISCOVERY_FAILED`. This differs from the standard health PIDs which fall back to attempting all configured PIDs. The health scan always completes — existing basic health values are returned if available.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running a vehicle health scan against a mock adapter that supports all extended PIDs produces a VehicleDataJson containing `stftBank1`, `ltftBank1`, `stftBank2`, `ltftBank2`, `map`, `maf`, and `throttlePosition` fields with correct values.

- **SC-002**: The vehicle data API returns extended PID fields in the same response structure as existing health PIDs, and pre-018B clients that ignore the new fields continue to work without errors.

- **SC-003**: The VehicleHealthPanel renders a "Fuel & Air Data" section showing all 7 extended PIDs with correct values and units when all PIDs are supported.

- **SC-004**: When extended PIDs are unsupported or unavailable, the UI displays "Not Supported" or "No Data" respectively without crashing or showing incorrect data.

- **SC-005**: Fuel trim values outside the -10% to +10% range display the appropriate "Lean Tendency" or "Rich Tendency" hint badge. Values within range display "Normal".

- **SC-006**: All existing vehicle health, readiness, freeze frame, DTC, VIN, and extended PID validation (018A) tests pass without modification.

- **SC-007**: Extended PID data is visible from a real vehicle session through the UI without requiring console access.

- **SC-008**: Pre-018B VehicleDataJson data (without extended PID fields) is handled gracefully by the frontend — no crashes, no errors, missing fields show "Not Supported" state. This is handled identically to unsupported PIDs.

- **SC-009**: When supported PID discovery fails, the health scan completes without crashing. Existing basic health PIDs are still attempted (current fallback behavior). Extended PIDs are represented as unavailable with reason `PID_DISCOVERY_FAILED` and are not blindly queried. The Fuel & Air Data section does not crash and shows "Not Available" for discovery-failed PIDs.

## Assumptions

- Feature 018A (validation framework) is complete and provides the reader functions, CONFIGURED_EXTENDED_PIDS dict, and mock profile. This feature promotes those validated PIDs into the production pipeline.
- The existing `read_vehicle_health()` function in `vehicle_health.py` currently handles fallback behavior when PID discovery fails. For standard health PIDs, this fallback behavior remains unchanged. For extended PIDs, discovery failure means extended PIDs are NOT blindly queried — they are represented as unavailable with reason `PID_DISCOVERY_FAILED` instead.
- The integration point for extended PIDs is `vehicle_health.py`, not `vehicle_data.py`. No `vehicle_data.py` re-export changes are required.
- The existing three-state result model (`HealthPidResult`) is sufficient for the extended PIDs. No new result types are needed.
- The backend VehicleDataJson field is a JSON column that can accommodate new keys without schema migration.
- Frontend TypeScript types are extended with optional fields to maintain backward compatibility with pre-018B data. Pre-018B VehicleDataJson without extended PID fields is handled the same way as unsupported/unavailable extended PIDs — the UI must not crash.
- The `extended_pids.py` module from 018A is imported but not modified. Integration happens in `vehicle_health.py` only.
- Fuel trim hints are lightweight indicators only — they do not constitute diagnosis, repair recommendations, or AI-generated content. They follow simple deterministic rules based on the numeric value.
- The extended PID validation profile (`extended_pid_validation_profile`) from 018A is available for integration testing but will not be used as the primary production profile. The `toyota_real_sample` profile and real vehicle connections remain the primary data sources.