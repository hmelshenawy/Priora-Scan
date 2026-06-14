# Tasks: Vehicle Health Real Adapter Integration

**Input**: Design documents from `/specs/013-vehicle-health-real-adapter/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/health-pid-result-contract.md

**Tests**: Included per spec acceptance criterion #10 — tests for PID discovery, unsupported fuel PID, VIN unsupported continuation, and real/mock parser consistency.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Desktop agent**: `desktop-agent/src/`, `desktop-agent/tests/`
- **Backend (optional)**: `backend/src/`
- **Frontend (optional)**: `frontend/src/`

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Fix Toyota mock profile bitmap consistency, refactor PID discovery for bitmap chain-following, and add the HealthPidResult helper. These MUST be complete before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 Fix Toyota mock profile bitmap consistency in `desktop-agent/src/obd/mock_profiles/toyota_real_sample.py` — bitmap `4100BE1FB813` has bit 32 SET (0x13 LSB bit 0 = 1, meaning PID 0x20 supported), so 0120 must be queried per SAE J1979. Current profile has `0120` in UNSUPPORTED_COMMANDS, which contradicts the bitmap. Fixes: (1) Remove `"0120"` from `UNSUPPORTED_COMMANDS`. (2) Add `"0120": bytes.fromhex("412000000001")` to `PID_RESPONSES` — bitmap `00000001` means no PIDs 21-3F supported (including 0x2F Fuel Level), but bit 32 set means chain continues to 0140. (3) Add `"0140": bytes.fromhex("414040000000")` to `PID_RESPONSES` — bitmap `40000000` means PID 0x42 (Control Module Voltage) is supported, bit 32 clear means no further ranges. (R-001 correction, FR-016)
- [x] T002 Refactor `read_supported_pids()` in `desktop-agent/src/obd/commands/vehicle_data.py` to follow bitmap chain: after querying 0100, check if PID 0x20 is in the discovered list (bit 32 of bitmap); if so, query 0120. After querying 0120, check if PID 0x40 is in the discovered list; if so, query 0140. Continue until the chain bit is clear or response is NO DATA. Preserve existing return shape `{"01": [...], "09": [...]}`. Remove unconditional 0120 query. (FR-001, FR-016, R-001)
- [x] T003 Add `_health_pid_result()` helper in `desktop-agent/src/obd/commands/vehicle_data.py` that builds a HealthPidResult dict with fields: `pid`, `value`, `unit`, `supported`, `available`, `rawResponse`. Add `_unsupported_pid_result(pid, unit)` that returns `{pid, value: null, unit, supported: false, available: false, rawResponse: null}`. Add `_unavailable_pid_result(pid, unit, raw)` that returns `{pid, value: null, unit, supported: true, available: false, rawResponse: raw or null}`. These replace the existing `_unsupported_point()` usage in the health read flow. (R-002, data-model.md HealthPidResult)
- [x] T004 Update existing PID reader functions in `desktop-agent/src/obd/commands/vehicle_data.py` to accept optional `pid` parameter and return HealthPidResult shape: `read_battery_voltage`, `read_engine_load`, `read_fuel_level` should include `pid`, `available`, and `rawResponse` fields in their return dicts. Maintain backward compatibility — existing callers that only check `value`/`supported` still work. (R-002, contract)

**Checkpoint**: Foundation ready — Toyota mock profile bitmap is internally consistent, `read_supported_pids` follows bitmap chain, HealthPidResult helpers exist, existing readers updated. User story implementation can now begin.

---

## Phase 2: User Story 1 — Technician Reads Vehicle Health from a Real Adapter (Priority: P1) 🎯 MVP

**Goal**: A vehicle health read discovers supported PIDs via bitmap chain, reads only supported PIDs, and returns decoded values for RPM, speed, coolant, load, and voltage. Unsupported PIDs and VIN do not fail the read.

**Independent Test**: Run vehicle health read with Toyota real sample mock adapter and verify decoded values: RPM=900, Speed=0, Coolant=86°C, Load=46.3%, Voltage=13.417V, Fuel Level unsupported, VIN unsupported.

### Implementation for User Story 1

- [x] T005 [US1] Add `read_rpm()` function in `desktop-agent/src/obd/commands/vehicle_data.py` — send PID 010C, parse response prefix `410C`, decode `(A * 256 + B) / 4`, return HealthPidResult shape with `pid: "0C"`, `unit: "RPM"`. (FR-014, R-003)
- [x] T006 [US1] Add `read_coolant_temperature()` function in `desktop-agent/src/obd/commands/vehicle_data.py` — send PID 0105, parse prefix `4105`, decode `A - 40`, return HealthPidResult shape with `pid: "05"`, `unit: "°C"`. (FR-014, R-003)
- [x] T007 [US1] Add `read_vehicle_speed()` function in `desktop-agent/src/obd/commands/vehicle_data.py` — send PID 010D, parse prefix `410D`, decode `A` (direct km/h), return HealthPidResult shape with `pid: "0D"`, `unit: "km/h"`. (FR-014, R-003)
- [x] T008 [US1] Add `CONFIGURED_HEALTH_PIDS` constant in `desktop-agent/src/obd/commands/vehicle_data.py` — dict mapping PID hex strings to their reader functions: `{"04": read_engine_load, "05": read_coolant_temperature, "0C": read_rpm, "0D": read_vehicle_speed, "42": read_battery_voltage, "2F": read_fuel_level}`. This is the single source of truth for which PIDs the health read considers. (FR-006, FR-002)
- [x] T009 [US1] Add `read_vehicle_health()` function in `desktop-agent/src/obd/commands/vehicle_data.py` — takes adapter, calls `read_supported_pids(adapter)` first, compares discovered PIDs against `CONFIGURED_HEALTH_PIDS`, calls only supported reader functions, reports unsupported PIDs via `_unsupported_pid_result()`, reports supported-but-unavailable via `_unavailable_pid_result()`, builds and returns full VehicleHealthResult dict with `supportedHealthPids` and `unsupportedHealthPids` lists. When 0100 discovery fails, falls back to calling all reader functions. (FR-001 through FR-007, FR-010, FR-015, R-004)
- [x] T010 [US1] Rewrite `execute_vehicle_data_read()` in `desktop-agent/src/main.py` to call `read_vehicle_health(adapter)` instead of calling individual readers. Import the new function. Preserve `ensure_adapter_connected()` check. Preserve VIN read via `read_vin(adapter)` with VinResult handling from Feature 012. Emit VEHICLE_DATA_READ event with the new VehicleHealthResult shape. (FR-011, FR-008, R-004)
- [x] T011 [US1] Add tests for bitmap chain-following in `desktop-agent/tests/test_pid_discovery.py` — test: 0100 returns bitmap with bit 32 clear → only 0100 queried; test: 0100 bit 32 set → 0120 also queried; test: 0120 bit 32 set → 0140 also queried; test: 0100 returns NO DATA → fallback all PIDs attempted; test: chain stops when intermediate bitmap has bit 32 clear. (FR-016, SC-009, AC #10)
- [x] T012 [US1] Add tests for `read_vehicle_health()` in `desktop-agent/tests/test_vehicle_health_integration.py` — test: Toyota mock profile returns RPM=900, Speed=0, Coolant=86, Load=46.3%, Voltage=13.417V; test: unsupported fuel PID 012F returns `{supported: false, available: false}`; test: VIN unsupported does not fail health read; test: `supportedHealthPids` list contains expected PIDs; test: `unsupportedHealthPids` list contains 2F; test: discovery fallback when 0100 fails. (SC-009, AC #10)

**Checkpoint**: User Story 1 complete. Vehicle health read with real/mock adapter returns decoded values for all supported PIDs. Unsupported PIDs and VIN are non-blocking. Bitmap chain-following works. Run `python -m pytest desktop-agent/tests/test_pid_discovery.py desktop-agent/tests/test_vehicle_health_integration.py -v` to verify.

---

## Phase 3: User Story 2 — Technician Sees Supported and Unsupported PID Lists (Priority: P2)

**Goal**: Health result payload includes explicit supported/unsupported PID lists and each PID result distinguishes capability (`supported`) from per-read availability (`available`).

**Independent Test**: Inspect VehicleHealthResult dict and verify `supportedHealthPids`, `unsupportedHealthPids` lists exist, and that a supported-but-unavailable PID returns `supported: true, available: false`.

### Implementation for User Story 2

- [x] T013 [US2] Add `supportedHealthPids` and `unsupportedHealthPids` list computation in `read_vehicle_health()` in `desktop-agent/src/obd/commands/vehicle_data.py` — after discovery, partition `CONFIGURED_HEALTH_PIDS` keys into supported (present in discovered PIDs) and unsupported (not present) lists, include them in the returned dict. Already implemented as part of T009 — verify and add test coverage. (FR-004, FR-005)
- [x] T014 [US2] Add test for supported-but-unavailable PID in `desktop-agent/tests/test_vehicle_health_integration.py` — create mock adapter where PID 010C is in the 0100 bitmap but returns NO DATA; verify result has `{pid: "0C", supported: true, available: false, value: null}`. Verify `supportedHealthPids` still lists "0C". (FR-007, US2 acceptance scenario 4)
- [x] T015 [US2] Add test for VIN unsupported continuation in `desktop-agent/tests/test_vehicle_health_integration.py` — use `unsupported_vin` mock profile, verify health read completes with all supported PIDs and VIN is `{supported: false, available: false, value: null}`. (FR-008, AC #10, SC-003)

**Checkpoint**: User Story 2 complete. Every health PID result has `supported` and `available` fields. The `supportedHealthPids` and `unsupportedHealthPids` lists are present in the result. VIN unsupported is handled gracefully. Run `python -m pytest desktop-agent/tests/test_vehicle_health_integration.py -v` to verify.

---

## Phase 4: User Story 3 — Mock and Real Adapters Produce Consistent Results (Priority: P3)

**Goal**: Mock and real adapters produce identical decoded output for the same raw OBD data. Toyota real sample profile matches captured real values exactly.

**Independent Test**: Compare decoded output of Toyota mock profile against known captured values and verify zero deviation. Verify the same `_send_pid()` → parse path is used for both mock and real.

### Implementation for User Story 3

- [x] T016 [US3] Add Toyota real vehicle regression test in `desktop-agent/tests/test_toyota_regression.py` — create MockAdapter with exact Toyota capture responses: `0100 → 4100BE1FB813`, `0120 → 412000000001` (bit 32 set, chain continues to 0140; no PIDs 21-3F supported), `0140 → 414040000000` (PID 0x42 supported, chain stops), `0104 → 410476`, `0105 → 41057E`, `010C → 410C0E10`, `010D → 410D00`, `0142 → 41423469`, `012F → b""` (NO DATA), `0902 → all-0xFF VIN`. Call `read_vehicle_health(adapter)` and `read_vin(adapter)`. Assert RPM=900, Speed=0 km/h, Coolant=86°C, Load=46.3%, Voltage=13.417V, Fuel Level={supported: false, available: false}, VIN={status: "UNSUPPORTED"}. Assert no exceptions raised. (SC-009, FR-013, AC #7)
- [x] T017 [US3] Add mock/real parser consistency test in `desktop-agent/tests/test_toyota_regression.py` — create two adapters: (1) MockAdapter with Toyota capture hex strings directly, (2) MockObdAdapter with `toyota_real_sample` profile. Call the same reader functions on both. Assert identical decoded values for all PIDs. This verifies the mock adapter's `.hex().upper().encode("ascii")` conversion produces the same parser input as raw OBD hex. (FR-009, SC-006, AC #10)
- [x] T018 [US3] Verify all existing tests pass — run `python -m pytest desktop-agent/tests/ -v` and confirm zero failures. If any existing test breaks due to the HealthPidResult shape change (T003), update the test expectations to match the new shape while preserving test intent. (SC-007, AC #9)

**Checkpoint**: User Story 3 complete. Toyota regression test passes. Mock/real parser consistency verified. All existing tests pass. Run `python -m pytest desktop-agent/tests/ -v` to verify.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, edge case coverage, and documentation

- [x] T019 Add test for raw OBD response inclusion in `desktop-agent/tests/test_vehicle_health_integration.py` — verify that successfully read PIDs include `rawResponse` field with the hex string (e.g., `"410C0E10"` for RPM), and that unsupported/unavailable PIDs have `rawResponse: null`. (FR-012)
- [x] T020 Verify bitmap chain-following for Toyota profile in `desktop-agent/tests/test_pid_discovery.py` — Toyota 0100 bitmap `4100BE1FB813` has bit 32 SET (0x13 & 0x01 = 1, meaning PID 0x20 is supported), so 0120 MUST be queried per SAE J1979. The 0120 response `412000000001` also has bit 32 SET (last byte 0x01 & 0x01 = 1, meaning PID 0x40 is supported), so 0140 MUST also be queried. The 0140 response `414040000000` has bit 32 CLEAR (last byte 0x00, no further ranges), so the chain stops. Test that `read_supported_pids()` with the Toyota mock profile queries 0100 → 0120 → 0140 and stops. Verify discovered PIDs include 0x42 (from 0140 range) and exclude 0x2F (not in 0120 bitmap). (FR-016, SC-009, edge case)
- [x] T021 Run quickstart.md validation — follow all steps in `specs/013-vehicle-health-real-adapter/quickstart.md` with `OBD_ADAPTER_TYPE=mock OBD_MOCK_PROFILE=toyota_real_sample` and verify the documented output matches actual results. (quickstart.md)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately. BLOCKS all user stories.
- **User Story 1 (Phase 2)**: Depends on Phase 1 completion (T001–T004)
- **User Story 2 (Phase 3)**: Depends on Phase 2 (T009 provides the `read_vehicle_health` function that US2 tests inspect)
- **User Story 3 (Phase 4)**: Depends on Phase 2 (T016–T017 test the full health read flow). Independent of US2.
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational. No dependencies on other stories. 🎯 MVP
- **US2 (P2)**: Depends on US1 (needs `read_vehicle_health` output to test `available` field)
- **US3 (P3)**: Depends on US1 (needs full health read flow). Independent of US2 — can run in parallel with US2 if staffed.

### Within Each User Story

- New PID readers (T005–T007) can run in parallel — different functions, same file but different sections
- `CONFIGURED_HEALTH_PIDS` constant (T008) depends on T005–T007 being complete
- `read_vehicle_health()` (T009) depends on T008 and T001–T002
- `execute_vehicle_data_read()` rewrite (T010) depends on T009
- Tests (T011–T012) depend on T009–T010

### Parallel Opportunities

- T005, T006, T007 can run in parallel (different reader functions)
- T011, T012 can run in parallel (different test files)
- T013, T014, T015 can run in parallel (different test cases, same file but independent)
- T016, T017 can run in parallel (different test cases)
- US2 and US3 can run in parallel after US1 completes

---

## Parallel Example: User Story 1

```text
# Launch all new PID readers together:
T005: "Add read_rpm() in desktop-agent/src/obd/commands/vehicle_data.py"
T006: "Add read_coolant_temperature() in desktop-agent/src/obd/commands/vehicle_data.py"
T007: "Add read_vehicle_speed() in desktop-agent/src/obd/commands/vehicle_data.py"

# Then sequentially (depends on T005-T007):
T008: "Add CONFIGURED_HEALTH_PIDS constant"
T009: "Add read_vehicle_health() function"
T010: "Rewrite execute_vehicle_data_read()"

# Then launch tests in parallel:
T011: "Bitmap chain tests in test_pid_discovery.py"
T012: "Health integration tests in test_vehicle_health_integration.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001–T004)
2. Complete Phase 2: User Story 1 (T005–T012)
3. **STOP and VALIDATE**: Run `python -m pytest desktop-agent/tests/test_pid_discovery.py desktop-agent/tests/test_vehicle_health_integration.py -v`
4. Verify Toyota mock profile produces expected values

### Incremental Delivery

1. Foundational → Toyota profile fix + PID discovery with chain-following + HealthPidResult helpers ready
2. US1 → Real adapter health read works, decoded values returned → MVP!
3. US2 → supported/available distinction in result payload
4. US3 → Toyota regression verified, mock/real consistency confirmed
5. Polish → Edge cases covered, quickstart validated

### Key Constraints

- No Redis, no cache, no external data store (FR-010, SC-008)
- No persistent VehicleCapabilityProfile table (out of scope)
- Same parser path for mock and real (FR-009)
- All existing tests must continue passing (SC-007)
- Backend/frontend updates are optional additive work — not required for feature success

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- SC-009 hex for 0104 is `410476` (corrected from `41045E` — see plan.md Notes)
- Bitmap `4100BE1FB813` has bit 32 SET (0x13 & 1 = 1), meaning 0120 MUST be queried per SAE J1979
- Toyota mock profile must include `0120 → 412000000001` and `0140 → 414040000000` in PID_RESPONSES for consistent bitmap chain
- PID 0x2F (Fuel Level) is in the 0120 range (PIDs 21-40); PID 0x42 (Voltage) is in the 0140 range (PIDs 41-60) — both require proper chain-following from 0100 → 0120 → 0140 to discover
- `read_supported_pids()` currently queries 0120 unconditionally; T002 refactors it to follow bitmap chain per FR-016