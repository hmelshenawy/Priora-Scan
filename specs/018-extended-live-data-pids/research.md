# Research: Extended PID Validation

**Feature**: 018-extended-live-data-pids | **Date**: 2026-06-15

## R1: Which PIDs need new reader functions?

**Decision**: All 7 required PIDs need new Python reader functions.

**Rationale**: The existing `CONFIGURED_HEALTH_PIDS` dict in `health_pids.py` only contains PIDs 04, 05, 0C, 0D, 42, 2F. PIDs 06, 07, 08, 09, 0B, 10, 11 are NOT in the desktop agent at all. They exist only in the backend's `BUILT_IN_MVP_PIDS` seed constant (PIDs 06, 07, 10, 11) but those are database seeds, not Python reader functions.

**Alternatives considered**:
- Adding new readers to `health_pids.py` — rejected because it modifies an existing module that's covered by regression tests. A new module isolates changes.
- Parameterizing a single fuel-trim reader — rejected because each PID needs its own response prefix check (`4106`, `4107`, etc.) and the existing pattern uses one function per PID.

## R2: Can _send_pid and _parse_bytes be reused as-is?

**Decision**: Yes, import directly from `health_pids.py`.

**Rationale**: Both `_send_pid` and `_parse_bytes` are module-level functions (not private — no double underscore) that accept `adapter: BaseAdapter` and return well-typed results. They handle error detection, hex cleaning, and byte parsing. No extraction or refactoring needed.

**Alternatives considered**:
- Extracting to a shared `obd_helpers.py` module — rejected as unnecessary indirection. Importing from `health_pids.py` is consistent with how `vehicle_health.py` already imports these helpers.

## R3: Three-state result model coverage

**Decision**: The existing three-state model covers all validation states.

**Rationale**: The three factories (`_health_pid_result`, `_unsupported_pid_result`, `_unavailable_pid_result`) produce exactly the shapes needed:
- Supported + available: `{pid, value, unit, supported: True, available: True, rawResponse}`
- Supported + unavailable: `{pid, value: None, unit, supported: True, available: False, rawResponse}`
- Unsupported: `{pid, value: None, unit, supported: False, available: False, rawResponse: None}`

This matches FR-002 exactly. No new result types needed.

## R4: Discovery failure handling

**Decision**: The validation function raises `RuntimeError` when `read_supported_pids()` returns no Mode 01 PIDs.

**Rationale**: FR-016 mandates that validation MUST NOT fall back to attempting all PIDs. The existing `read_vehicle_health` has a fallback for backward compatibility, but this feature exists specifically to validate which PIDs are actually supported. A fallback would produce false validation results.

The agent codebase has **no custom exception classes** — it uses `RuntimeError` for infrastructure failures (`vin.py:100`, `usb_elm327.py:39`, `wifi_elm327.py:179`) and result-dicts for domain-level failures. Discovery failure is an infrastructure failure (the adapter couldn't determine vehicle capabilities), so `RuntimeError` is consistent with existing conventions.

**Alternatives considered**:
- Custom `DiscoveryError` class — rejected because no custom exception classes exist in the codebase. `RuntimeError` follows the established convention.
- Returning an empty result dict with a `discovery_failed: True` flag — rejected because it's too easy to miss. An exception forces the caller to handle it.
- Using the existing fallback behavior — explicitly rejected by FR-016.

## R5: Mock profile strategy

**Decision**: Create a dedicated `extended_pid_validation_profile.py`. Do NOT modify `toyota_real_sample.py`.

**Rationale**: The `toyota_real_sample.py` profile represents real captured vehicle data and has been used for VIN, health, readiness, freeze frame, and DTC validation. It is a frozen reference that must not be modified. A new dedicated profile provides deterministic responses specifically for Feature 018A testing, with all 7 required PIDs and 2 optional PIDs in the bitmap.

The new profile (`extended_pid_validation_profile`) includes:
- PID bitmap with all 9 PIDs supported
- Deterministic PID responses with known decode outputs for unit test verification
- VIN response, no fault codes, standard clear response

**Alternatives considered**:
- Modifying `toyota_real_sample.py` — rejected because it's a frozen reference profile used by multiple existing test suites. Modifying it introduces regression risk for tests that rely on its exact responses.

## R6: Response prefixes for extended PIDs

**Decision**: Each Mode 01 PID uses prefix `41` + PID hex, following the standard OBD-II convention.

| PID | Command | Response Prefix |
|-----|---------|----------------|
| 06 | 0106 | 4106 |
| 07 | 0107 | 4107 |
| 08 | 0108 | 4108 |
| 09 | 0109 | 4109 |
| 0B | 010B | 410B |
| 10 | 0110 | 4110 |
| 11 | 0111 | 4111 |

**Rationale**: This is the standard SAE J1979 response format. Same pattern as all existing readers (e.g., RPM `010C` → `410C`).

## R7: Validation function isolation

**Decision**: `read_extended_pid_validation()` lives in `pid_validation.py`, not integrated into the agent event loop, and NOT re-exported through `vehicle_data.py`.

**Rationale**: Feature 018A is an internal validation utility. Nothing in production should consume `read_extended_pid_validation()` yet. Keeping it isolated in its own module with no re-exports reduces regression risk. Future Feature 018B can add production integration when needed.

**Alternatives considered**:
- Re-exporting through `vehicle_data.py` — rejected because it creates a public import path for an internal validation utility. No production consumer exists yet.

## R8: Exception convention

**Decision**: Use `RuntimeError` for discovery failure, consistent with the agent's existing pattern.

**Rationale**: Audit of the desktop-agent codebase shows:
- **No custom exception classes** exist anywhere in the codebase
- `RuntimeError` is used for infrastructure failures: adapter not connected (`usb_elm327.py:39`, `wifi_elm327.py:179`), VIN read failed (`vin.py:100`), profile load failure (`profile_registry.py:90`)
- `ConnectionError` and `TimeoutError` are used for WiFi transport failures
- Domain-level failures (unsupported PIDs, NO DATA) use result-dicts, not exceptions
- Discovery failure is an infrastructure failure (adapter couldn't determine capabilities), so `RuntimeError` is the appropriate type

**Alternatives considered**:
- Custom `DiscoveryError` class — rejected because it would be the only custom exception in the entire codebase, breaking consistency.
- Result-dict with `discovery_failed` flag — rejected because it's too easy to silently ignore. An exception forces handling.

---

## 018B Pipeline Research

### R9: Integration point for extended PIDs

**Decision**: Extended PIDs integrate through `vehicle_health.py` only. No `vehicle_data.py` re-export changes.

**Rationale**: `vehicle_health.py:read_vehicle_health()` is the orchestrator that calls health PID readers and builds the result dict. `vehicle_data.py` is a pure re-export facade — adding re-exports there would violate its purpose. The `scan_executor.py:execute_vehicle_data_read()` function calls `read_vehicle_health()` and enriches the result dict with additional data (fuelSystemStatus, readinessMonitors, freezeFrame, supportedPids, mileage, vin). Since extended PID fields will be added to the `vehicle_health` dict directly, they flow through to `emit_session_event()` automatically.

### R10: Discovery failure behavior for extended PIDs

**Decision**: When `read_supported_pids()` fails or returns empty Mode 01 PIDs, standard health PIDs fall back to attempting all `CONFIGURED_HEALTH_PIDS` (existing behavior preserved), but extended PIDs MUST NOT be blindly queried. Each extended PID is represented as unavailable with `reason: "PID_DISCOVERY_FAILED"`.

**Rationale**: FR-019 explicitly mandates this difference. Standard health PIDs have fallback behavior for backward compatibility. Extended PIDs are new additions where blindly querying could send commands the vehicle doesn't support, potentially causing timeouts or error responses. The safe behavior is to mark them as unavailable rather than risk ECU communication issues.

**Implementation**: In `vehicle_health.py`, after the standard health PID section, add an extended PID section that:
1. Checks `discovery_ok` (same flag used for standard health PIDs)
2. If `discovery_ok`: iterate `CONFIGURED_EXTENDED_PIDS`, read supported PIDs, mark unsupported PIDs
3. If `not discovery_ok`: set all extended PIDs to `{pid, supported: false, available: false, value: null, unit: "...", reason: "PID_DISCOVERY_FAILED"}`
4. Map extended PIDs to their field names and add to the result dict

No top-level metadata fields (`extendedPidsDiscoveryFailed`, `supportedExtendedPids`, `unsupportedExtendedPids`). Discovery state lives inside each PID result's `reason` field.

### R11: Backend VehicleDataJson extension

**Decision**: Add optional fields to the `VehicleDataJson` interface. Update `isValidVehicleDataJson()` to accept but not require them.

**Rationale**: The `vehicleDataJson` column is JSONB — no schema migration needed. The `isValidVehicleDataJson()` function currently checks for required top-level keys (`batteryVoltage`, `vin`, etc.). Adding optional fields means:
1. Pre-018B payloads without extended fields still pass validation
2. 018B payloads with extended fields also pass validation
3. The function should NOT require the new optional fields

**Implementation**: Add `stftBank1?`, `ltftBank1?`, `stftBank2?`, `ltftBank2?`, `map?`, `maf?`, `throttlePosition?`, `extendedPidsDiscoveryFailed?`, `supportedExtendedPids?`, `unsupportedExtendedPids?` as optional fields. Do NOT add them to the `requiredPoints` array in `isValidVehicleDataJson()`.

### R12: Frontend VehicleHealthPanel integration

**Decision**: Add a new "Fuel & Air Data" section as a separate card within VehicleHealthPanel. Use existing `VehicleDataPointRow` component for rendering extended PID data points, with fuel trim hints added as subtle badges.

**Rationale**: The existing `VehicleDataPointRow` component already handles `VehicleDataPoint` objects with `supported`, `value`, and `unit` fields. Extended PID data points follow the same shape. The fuel trim hints need a new pure function (`getFuelTrimHint`) but no new UI primitives.

**Implementation approach**:
1. Add a `FuelAndAirDataCard` sub-component (can be inline in the same file)
2. Check if any extended PID field exists in `vehicleData` before rendering the section
3. Render each extended PID as a `VehicleDataPointRow` with appropriate icon
4. Add fuel trim hint badges next to STFT/LTFT values using `getFuelTrimHint()`
5. Handle `extendedPidsDiscoveryFailed` flag: show "Not Available" for discovery-failed PIDs
6. Handle missing fields (pre-018B data): show "Not Supported"

### R13: scan_executor.py data flow

**Decision**: No structural changes needed to `scan_executor.py`. Extended PID fields flow through automatically because `read_vehicle_health()` adds them to the result dict.

**Rationale**: `execute_vehicle_data_read()` calls `read_vehicle_health(adapter)` and then enriches the result dict with additional data. The enrichment only adds fields that are NOT part of `read_vehicle_health()`. Since extended PID fields are added inside `read_vehicle_health()`, they're already in the dict when `emit_session_event()` is called. No changes to the executor are needed for the data payload.

**Verification needed**: Confirm that the enrichment step doesn't overwrite or conflict with the extended PID fields. Current enrichment adds: `fuelSystemStatus`, `readinessMonitors`, `freezeFrame`, `supportedPids`, `mileage`, `vin`. None of these conflict with the extended PID field names.