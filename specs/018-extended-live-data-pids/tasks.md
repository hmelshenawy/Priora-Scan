# Tasks: Extended Live Data PIDs — Full Pipeline (018B)

**Input**: Design documents from `/specs/018-extended-live-data-pids/`

**Prerequisites**: plan.md (required), spec-018b.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — the spec requires unit tests, integration tests, and frontend rendering tests (FR-016, FR-017).

**Organization**: Tasks are grouped by implementation layer, then mapped to user stories. The agent and backend work is foundational (serves all stories). The frontend UI work is split by user story.

**Scope**: Full pipeline — Desktop Agent → VehicleDataJson → Backend API → Frontend UI. No AI, no ECU discovery, no UDS, no graphing, no new database tables, no schema migration, no new API endpoint.

## Architectural Simplifications Applied

1. **No metadata fields**: `supportedExtendedPids`, `unsupportedExtendedPids`, and `extendedPidsDiscoveryFailed` are removed. Discovery state lives inside individual PID result objects via `reason: "PID_DISCOVERY_FAILED"`.
2. **Scan executor read-only**: No code changes to `scan_executor.py` unless a real issue is discovered. No documentation comments required.
3. **Render condition**: Fuel & Air Data section renders when at least one extended PID field exists in `VehicleDataJson`. No metadata flag dependency.
4. **Discovery failure**: Represented through PID result `reason` field only. Frontend displays "Not Available" based on PID result state. No separate top-level flag.
5. **Pre-018B sessions**: Fuel & Air Data section is not rendered at all for sessions that have no extended PID fields. Do not show "Not Supported" for data that was never collected.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Desktop agent**: `desktop-agent/src/obd/commands/` (source), `desktop-agent/tests/` (tests)
- **Backend**: `backend/src/vehicle-data/` (source), `backend/src/vehicle-data/` (tests)
- **Frontend**: `frontend/src/services/` (API types), `frontend/src/components/vehicle-data/` (UI)
- **Do NOT modify**: `desktop-agent/src/obd/commands/extended_pids.py`, `desktop-agent/src/obd/commands/pid_validation.py`, `desktop-agent/src/obd/mock_profiles/extended_pid_validation_profile.py`, `desktop-agent/src/obd/mock_profiles/toyota_real_sample.py`
- **Do NOT modify**: `desktop-agent/src/obd/commands/vehicle_data.py` (no re-export changes required)

---

## Phase 1: Agent Integration — Extended PID Polling

**Purpose**: Extend `read_vehicle_health()` to poll extended PIDs alongside existing health PIDs, with discovery failure guard.

**Goal**: When `read_vehicle_health()` is called, it returns a dict containing all current health PID fields PLUS the 7 extended PID fields (stftBank1, ltftBank1, stftBank2, ltftBank2, map, maf, throttlePosition). Each PID result contains its own `supported`, `available`, and `reason` state. No top-level metadata fields.

- [X] T001 [US1] Import `CONFIGURED_EXTENDED_PIDS`, `EXTENDED_PID_NAMES`, `EXTENDED_PID_UNITS` from `extended_pids.py` and `_unsupported_pid_result`, `_unavailable_pid_result`, `_get_unit_for_pid` from `health_pids.py` in `desktop-agent/src/obd/commands/vehicle_health.py`

- [X] T002 [US1] Add extended PID polling logic after the standard health PID section in `read_vehicle_health()` in `desktop-agent/src/obd/commands/vehicle_health.py` — if `discovery_ok` (supported_mode01 is non-empty): iterate `CONFIGURED_EXTENDED_PIDS`, for PIDs in `supported_mode01` call the reader function, for PIDs not in `supported_mode01` mark as `_unsupported_pid_result(pid, unit)`. For readers that return `supported: False` when the PID was in the bitmap, add a `reason` field via `_classify_unavailable_reason` logic (reuse from `pid_validation.py` or inline the classification: NO_DATA for null rawResponse, PREFIX_MISMATCH for wrong prefix, INVALID_RESPONSE as default). If `not discovery_ok`: mark ALL extended PIDs as `{pid, supported: false, available: false, value: null, unit: "...", rawResponse: null, reason: "PID_DISCOVERY_FAILED"}`. DO NOT blindly query extended PIDs when discovery fails. DO NOT add top-level metadata fields (`supportedExtendedPids`, `unsupportedExtendedPids`, `extendedPidsDiscoveryFailed`). Discovery state lives inside each PID result's `reason` field.

- [X] T003 [US1] Add extended PID result mapping in `read_vehicle_health()` in `desktop-agent/src/obd/commands/vehicle_health.py` — map PID hex codes to field names: `"06" → "stftBank1"`, `"07" → "ltftBank1"`, `"08" → "stftBank2"`, `"09" → "ltftBank2"`, `"0B" → "map"`, `"10" → "maf"`, `"11" → "throttlePosition"`. Add each result to the `vehicle_health` dict. Each result contains `pid`, `supported`, `available`, `value`, `unit`, `rawResponse`, and optional `reason` — no top-level metadata fields.

- [X] T004 [US1] Verify `scan_executor.py` passes through `read_vehicle_health()` results unchanged in `desktop-agent/src/agent/scan_executor.py` — read the file, confirm that `read_vehicle_health()` result dict is passed as-is to `emit_session_event()`, and that the enrichment step (adding fuelSystemStatus, readinessMonitors, etc.) does not overwrite or conflict with the extended PID field names. No code changes expected. No documentation comments required. Modify only if a real issue is discovered. ✅ Verified: no changes needed.

**Checkpoint**: `read_vehicle_health()` returns extended PID fields with state inside each result. Discovery failure guard works correctly. Standard health PID behavior is unchanged. Run: `cd desktop-agent && python -m pytest tests/test_vehicle_health_integration.py -v`

---

## Phase 2: Agent Tests — Extended PID Integration

**Purpose**: Test the extended PID integration in `vehicle_health.py` with supported PIDs, unsupported PIDs, NO DATA handling, discovery failure behavior, and existing health regression.

- [X] T005 [US1] Add `TestExtendedPidsInVehicleHealth` class to `desktop-agent/tests/test_vehicle_health_integration.py` — test that `read_vehicle_health()` with `MockObdAdapter(profile_name="extended_pid_validation")` returns all 7 extended PID fields (stftBank1, ltftBank1, stftBank2, ltftBank2, map, maf, throttlePosition) with correct values, correct units, and `supported: true, available: true`. Verify no top-level metadata fields (`supportedExtendedPids`, `unsupportedExtendedPids`, `extendedPidsDiscoveryFailed`) exist in the result.

- [X] T006 [US1] Add `TestExtendedPidsUnsupported` class to `desktop-agent/tests/test_vehicle_health_integration.py` — test with the toyota_real_sample profile which has PIDs 06,07,10,11 in bitmap (supported-but-unavailable) and PIDs 08,09,0B not in bitmap (unsupported). Verify unsupported PIDs have `supported: false, available: false, value: null`. Verify bitmap PIDs without data have `supported: true, available: false`. Verify no top-level metadata fields.

- [X] T007 [US1] Add `TestExtendedPidsDiscoveryFailure` class to `desktop-agent/tests/test_vehicle_health_integration.py` — test with a custom adapter that returns empty for 0100 (discovery fails). Verify standard health PIDs still use fallback behavior. Verify ALL extended PIDs have `supported: false, available: false, value: null, reason: "PID_DISCOVERY_FAILED"`. Verify no top-level metadata fields.

- [X] T008 [US1] Add `TestExtendedPidsNoData` class to `desktop-agent/tests/test_vehicle_health_integration.py` — test with a custom adapter using the extended_pid_validation bitmap but PID 06 returns no data. Verify the result has `supported: true, available: false, value: null` with `reason: "NO_DATA"` inside the PID result object.

- [X] T009 [US1] Add `TestStandardHealthRegression` class to `desktop-agent/tests/test_vehicle_health_integration.py` — verify standard health PIDs (RPM, Speed, Coolant, Engine Load, Battery Voltage) still work with the toyota_real_sample profile. Verify extended PIDs in the bitmap (06,07,10,11) are supported-but-unavailable and PIDs not in bitmap (08,09,0B) are unsupported.

**Checkpoint**: All agent integration tests pass. Run: `cd desktop-agent && python -m pytest tests/test_vehicle_health_integration.py -v`

---

## Phase 3: Backend DTO Extension — VehicleDataJson

**Purpose**: Extend backend TypeScript types to accept extended PID fields in the VehicleDataJson interface, without breaking backward compatibility.

- [X] T010 [P] [US3] Add optional extended PID fields to `VehicleDataJson` interface in `backend/src/vehicle-data/dtos/vehicle-data-response.dto.ts` — added `ExtendedPidDataPoint` interface with `pid`, `value`, `unit`, `supported`, `available`, `rawResponse?`, and `reason?` fields. Added 7 optional extended PID fields: `stftBank1?`, `ltftBank1?`, `stftBank2?`, `ltftBank2?`, `map?`, `maf?`, `throttlePosition?`. No top-level metadata fields.

- [X] T011 [US3] Update `isValidVehicleDataJson()` in `backend/src/vehicle-data/dtos/vehicle-data-response.dto.ts` — extended validation to accept but not require extended PID fields. Pre-018B payloads still pass. When present, each extended PID field must have `pid`, `supported`, and `available` properties. The `reason` field is accepted as an optional string.

**Checkpoint**: Backend DTOs accept extended PID fields. Pre-018B payloads still pass validation. Run: `cd backend && npm run build`

---

## Phase 4: Backend Tests — DTO Persistence and API

**Purpose**: Verify backend persistence and API response serialization with extended PID fields.

- [X] T012 [US3] Add `TestVehicleDataJsonWithExtendedPids` test in `backend/tests/unit/vehicle-data/vehicle-data-response.dto.unit.test.ts` — test that `isValidVehicleDataJson()` accepts payloads containing all 7 extended PID fields. Each field has the `ExtendedPidDataPoint` shape with `pid`, `value`, `unit`, `supported`, `available`, and optional `rawResponse`/`reason`. Also tests rejection of invalid extended PID shapes (missing `pid`, `supported`, or `available`).

- [X] T013 [US3] Add `TestVehicleDataJsonWithoutExtendedPids` test in `backend/tests/unit/vehicle-data/vehicle-data-response.dto.unit.test.ts` — test that `isValidVehicleDataJson()` still accepts pre-018B payloads that do NOT contain any extended PID fields. Also tests minimal payload with only required fields and payload with freezeFrame but no extended PIDs.

- [X] T014 [US3] Add `TestVehicleDataJsonExtendedPidsPartial` test in `backend/tests/unit/vehicle-data/vehicle-data-response.dto.unit.test.ts` — test that `isValidVehicleDataJson()` accepts payloads with only some extended PID fields (only `stftBank1`+`maf`, only `map`, only `throttlePosition`, only unsupported PIDs).

- [X] T015 [US3] Add `TestVehicleDataJsonDiscoveryFailure` test in `backend/tests/unit/vehicle-data/vehicle-data-response.dto.unit.test.ts` — test that `isValidVehicleDataJson()` accepts payloads where extended PID fields have `supported: false, available: false, reason: "PID_DISCOVERY_FAILED"`. Tests all 7 PIDs with discovery failure, mixed valid+failed PIDs, and confirms no top-level flag is required.

**Checkpoint**: Backend tests pass for extended PID fields, backward compatibility, and discovery failure. Run: `cd backend && npm run test -- --testPathPattern="vehicle-data-response"`

---

## Phase 5: Frontend API Types

**Purpose**: Extend frontend TypeScript types to match the backend VehicleDataJson interface.

- [X] T016 [US3] Add optional extended PID fields to `VehicleDataJson` interface in `frontend/src/services/vehicle-data-api.ts` — add `stftBank1?: VehicleDataPoint`, `ltftBank1?: VehicleDataPoint`, `stftBank2?: VehicleDataPoint`, `ltftBank2?: VehicleDataPoint`, `map?: VehicleDataPoint`, `maf?: VehicleDataPoint`, `throttlePosition?: VehicleDataPoint`. Only the seven PID fields. No top-level metadata fields. All new fields are optional for backward compatibility.

**Checkpoint**: Frontend types compile without errors. Run: `cd frontend && npm run type-check`

---

## Phase 6: Frontend UI — Fuel & Air Data Section

**Purpose**: Add the "Fuel & Air Data" section to VehicleHealthPanel with fuel trim hints.

- [X] T017 [US1] Add `getFuelTrimHint()` pure function in `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` — takes a `number | null | undefined`, returns `"Normal"` for -10% to +10%, `"Lean Tendency"` for above +10%, `"Rich Tendency"` for below -10%, `null` for null/undefined. No diagnosis, no repair recommendations, no AI language. Just deterministic value classification.

- [X] T018 [US1] Add `FuelAndAirDataCard` sub-component in `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` — renders STFT Bank 1, LTFT Bank 1, STFT Bank 2, LTFT Bank 2, MAP, MAF, Throttle Position. Each row uses `VehicleDataPointRow` for rendering. State handling: (1) Supported + Available → show value and unit with fuel trim hint badge for STFT/LTFT fields, (2) Supported + Unavailable → show "No Data", (3) Unsupported → show "Not Supported", (4) Discovery failed → show "Not Available" (detected by `supported: false` with `reason: "PID_DISCOVERY_FAILED"` inside the PID result). (5) Missing field (pre-018B data) → do NOT render the row at all. Fuel trim hint badges use `getFuelTrimHint()` and display as subtle badges next to the value. No separate top-level flag is used for discovery state.

- [X] T019 [US1] Integrate `FuelAndAirDataCard` into the main `VehicleHealthPanel` render in `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` — add the "Fuel & Air Data" section after the existing health data rows (Battery Voltage, VIN, Fuel System Status, Engine Load, Fuel Level, Mileage) but before the Readiness Monitors section. Render the section only if at least one of the 7 extended PID fields (`stftBank1`, `ltftBank1`, `stftBank2`, `ltftBank2`, `map`, `maf`, `throttlePosition`) exists in `vehicleData`. For pre-018B sessions where none of these fields exist, do NOT render the section at all — do not show "Not Supported" for data that was never collected.

**Checkpoint**: VehicleHealthPanel renders Fuel & Air Data section with correct state handling. Pre-018B sessions do not show the section. Run: `cd frontend && npm run type-check && npm run build`

---

## Phase 7: Frontend Tests — Fuel & Air Data Rendering

**Purpose**: Verify the Fuel & Air Data section renders correctly in all states.

- [X] T020 [P] [US1] Add `TestFuelAndAirDataRendering` test in `frontend/src/components/vehicle-data/__tests__/VehicleHealthPanel.test.tsx` — test that the Fuel & Air Data section renders with all 7 extended PID values when all are supported and available. Use a mock `VehicleDataJson` with all extended PID fields populated.

- [X] T021 [P] [US1] Add `TestUnsupportedExtendedPids` test in `frontend/src/components/vehicle-data/__tests__/VehicleHealthPanel.test.tsx` — test that unsupported PIDs show "Not Supported" text. Use a mock `VehicleDataJson` where some PIDs have `supported: false`.

- [X] T022 [P] [US1] Add `TestUnavailableExtendedPids` test in `frontend/src/components/vehicle-data/__tests__/VehicleHealthPanel.test.tsx` — test that unavailable PIDs show "No Data" text. Use a mock `VehicleDataJson` where some PIDs have `supported: true, available: false`.

- [X] T023 [P] [US1] Add `TestMissingExtendedPidsFields` test in `frontend/src/components/vehicle-data/__tests__/VehicleHealthPanel.test.tsx` — test that pre-018B data is handled gracefully. Use a mock `VehicleDataJson` WITHOUT any extended PID fields. Verify: no crash, no "Fuel & Air Data" section rendered (since no extended data exists). Do NOT show "Not Supported" for data that was never collected.

- [X] T024 [P] [US1] Add `TestDiscoveryFailureState` test in `frontend/src/components/vehicle-data/__tests__/VehicleHealthPanel.test.tsx` — test that when extended PID fields have `supported: false, available: false, reason: "PID_DISCOVERY_FAILED"`, each PID row shows "Not Available". Use a mock `VehicleDataJson` where all 7 extended PID fields exist with discovery failure state. The Fuel & Air Data section IS visible (because the fields exist). No top-level `extendedPidsDiscoveryFailed` flag is used.

- [X] T025 [P] [US1] Add `TestFuelTrimHints` test in `frontend/src/components/vehicle-data/__tests__/VehicleHealthPanel.test.tsx` — test fuel trim hint rendering: (1) value 0% → "Normal" badge, (2) value +15% → "Lean Tendency" badge, (3) value -15% → "Rich Tendency" badge, (4) null value → no badge, (5) verify no diagnosis wording, no repair recommendations, no AI language in any badge text.

**Checkpoint**: All frontend tests pass. Run: `cd frontend && npm run test -- --testPathPattern="VehicleHealthPanel"`

---

## Phase 8: Polish & Regression Verification

**Purpose**: Verify no regressions across the full stack and confirm real vehicle readiness.

- [X] T026 Run full desktop-agent test suite: `cd desktop-agent && python -m pytest tests/ -v` — all existing tests (including 018A validation tests: `test_extended_pids.py`, `test_pid_validation.py`, `test_mock_profiles.py`) must pass unchanged.

- [X] T027 Run backend build and tests: `cd backend && npm run build && npm run test` — all backend tests must pass, including new VehicleDataJson validation tests.

- [X] T028 Run frontend build and type check: `cd frontend && npm run type-check && npm run build` — TypeScript compilation must succeed with no errors from the new optional fields.

- [X] T029 Verify no modifications to 018A modules — confirm `extended_pids.py`, `pid_validation.py`, `extended_pid_validation_profile.py`, and `toyota_real_sample.py` have NO changes from the 018A commit. Run: `cd desktop-agent && git diff HEAD -- src/obd/commands/extended_pids.py src/obd/commands/pid_validation.py src/obd/mock_profiles/extended_pid_validation_profile.py src/obd/mock_profiles/toyota_real_sample.py`

- [X] T030 Verify no modifications to `vehicle_data.py` re-exports — confirm `vehicle_data.py` has NO changes to the re-export list. Run: `cd desktop-agent && git diff HEAD -- src/obd/commands/vehicle_data.py`

- [X] T031 Verify `read_vehicle_health()` with `MockObdAdapter(profile_name="extended_pid_validation")` returns all 7 extended PID fields with correct values. Manual verification: run a quick Python script calling `read_vehicle_health()` and confirm the output dict contains `stftBank1`, `ltftBank1`, `stftBank2`, `ltftBank2`, `map`, `maf`, `throttlePosition` with correct values. Confirm NO top-level metadata fields (`supportedExtendedPids`, `unsupportedExtendedPids`, `extendedPidsDiscoveryFailed`) exist in the result.

- [X] T032 Verify `read_vehicle_health()` with `MockObdAdapter(profile_name="default")` still returns correct standard health PID values (RPM, Speed, Coolant, Engine Load, Battery Voltage, Fuel Level) — confirming no regression in standard health PID behavior.

**Checkpoint**: Full regression suite passes across all stacks. No 018A module modifications. Standard health PID behavior is unchanged.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Agent Integration)**: No dependencies — can start immediately. BLOCKS all subsequent phases.
- **Phase 2 (Agent Tests)**: Depends on Phase 1 completion. BLOCKS Phase 6 (Frontend UI needs agent data format confirmed).
- **Phase 3 (Backend DTO)**: Depends on Phase 1 (needs confirmed data format). Can run in parallel with Phase 2.
- **Phase 4 (Backend Tests)**: Depends on Phase 3. Can run in parallel with Phase 5.
- **Phase 5 (Frontend Types)**: Depends on Phase 3 (needs backend types confirmed). Can run in parallel with Phase 4.
- **Phase 6 (Frontend UI)**: Depends on Phase 5 (needs frontend types). Can run in parallel with Phase 7.
- **Phase 7 (Frontend Tests)**: Depends on Phase 6 (needs UI component). Can start after Phase 6.
- **Phase 8 (Regression)**: Depends on ALL previous phases.

### User Story Mapping

- **US1 (View Fuel Trim Data)**: Phases 1-2 (agent reads fuel trims), Phase 6 (frontend displays fuel trims with hints), Phase 7 (frontend tests). MVP deliverable.
- **US2 (View Airflow Data)**: Phases 1-2 (agent reads MAP/MAF/throttle), Phase 6 (frontend displays airflow data), Phase 7 (frontend tests). Same code as US1 — delivered together.
- **US3 (Full Pipeline Integration)**: Phases 3-5 (backend+frontend types), Phase 4 (backend tests). End-to-end data flow verification.

### Parallel Opportunities

- T005-T009: Agent test classes can run in parallel (different scenarios)
- T010-T011: Backend DTO tasks can run in parallel (different files)
- T012-T015: Backend test tasks can run in parallel (different test scenarios)
- T020-T025: Frontend test tasks can run in parallel (different test scenarios)
- Phase 2 (Agent Tests) and Phase 3 (Backend DTO) can run in parallel

---

## Parallel Example: Agent Tests

```bash
# Launch all agent test tasks together (T005-T009):
Task: "Add TestExtendedPidsInVehicleHealth to test_vehicle_health_integration.py"
Task: "Add TestExtendedPidsUnsupported to test_vehicle_health_integration.py"
Task: "Add TestExtendedPidsDiscoveryFailure to test_vehicle_health_integration.py"
Task: "Add TestExtendedPidsNoData to test_vehicle_health_integration.py"
Task: "Add TestStandardHealthRegression to test_vehicle_health_integration.py"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1: Agent Integration — extended PID polling in `vehicle_health.py`
2. Complete Phase 2: Agent Tests — verify agent integration works
3. Complete Phase 6: Frontend UI — Fuel & Air Data section with hints
4. **STOP and VALIDATE**: Run a mock vehicle scan and verify fuel trim values appear in the UI
5. MVP is delivered — technicians can see fuel trim data with hints

### Incremental Delivery

1. Agent Integration → Extended PID data flows from vehicle_health.py
2. Agent Tests → Agent behavior verified for all states
3. Backend DTO → VehicleDataJson accepts extended fields
4. Backend Tests → Persistence and backward compatibility verified
5. Frontend Types → TypeScript types match backend
6. Frontend UI → Fuel & Air Data section renders all states
7. Frontend Tests → Rendering verified for all states
8. Regression → Full stack passes all tests

### Suggested Commit Messages

- Phase 1: `feat(obd): integrate extended PIDs into vehicle health polling`
- Phase 2: `test(obd): add extended PID integration tests for vehicle health`
- Phase 3: `feat(backend): extend VehicleDataJson with optional extended PID fields`
- Phase 4: `test(backend): add VehicleDataJson extended PID validation tests`
- Phase 5: `feat(frontend): add extended PID types to vehicle-data-api`
- Phase 6: `feat(frontend): add Fuel & Air Data section with fuel trim hints`
- Phase 7: `test(frontend): add VehicleHealthPanel extended PID rendering tests`
- Phase 8: `test: verify full regression suite passes with extended PIDs`

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- **Do NOT modify**: `extended_pids.py`, `pid_validation.py`, `extended_pid_validation_profile.py`, `toyota_real_sample.py`
- **Do NOT modify**: `vehicle_data.py` re-exports — no changes required
- **Integration point**: `vehicle_health.py` — all extended PID polling happens here
- **No metadata fields**: `supportedExtendedPids`, `unsupportedExtendedPids`, `extendedPidsDiscoveryFailed` are NOT added. Discovery state lives inside each PID result's `reason` field.
- **Discovery failure**: Extended PIDs are NOT blindly queried when discovery fails. Each PID result gets `reason: "PID_DISCOVERY_FAILED"`. Frontend displays "Not Available" for these.
- **Scan executor read-only**: No code changes to `scan_executor.py` unless a real issue is discovered. No documentation comments required.
- **Pre-018B sessions**: Fuel & Air Data section is not rendered for sessions with no extended PID fields. Do not show "Not Supported" for data that was never collected.
- **Backward compatibility**: All extended PID fields are optional. Pre-018B data is handled gracefully — section simply doesn't appear.
- **Fuel trim hints**: Deterministic rules only. No diagnosis, no repair recommendations, no AI.
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently