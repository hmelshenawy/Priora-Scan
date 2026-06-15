# Tasks: Freeze Frame Data

**Input**: Design documents from `/specs/017-freeze-frame-data/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks are included per the project's established testing pattern (parser-first, test-before-implement).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Desktop agent source: `desktop-agent/src/obd/commands/vehicle_data.py`, `desktop-agent/src/main.py`
- Mock profiles: `desktop-agent/src/obd/mock_profiles/`
- Tests: `desktop-agent/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extract shared DTC decoding helper and establish SAE J1979 test data constants for the parser.

- [x] T001 Extract `_decode_dtc_byte_pair(byte1_hex, byte2_hex)` helper from `parse_dtcs()` in `desktop-agent/src/obd/commands/elm_parser.py` — refactor the existing DTC decoding logic into a reusable function while keeping `parse_dtcs()` working identically. Add unit test for the helper in `desktop-agent/tests/test_elm_parser.py`.

- [x] T002 [P] Define SAE J1979 Mode 02 freeze frame test constants in `desktop-agent/tests/test_freeze_frame.py` — create the test file with hex string constants for known OBD-II freeze frame responses:
  - Valid response with DTC P0103 and all 4 MVP PIDs (RPM=2450, speed=72, load=58%, coolant=91°C)
  - Valid response with partial PIDs (DTC + RPM only)
  - DTC 0000 with no PID pairs (unavailable state)
  - DTC 0000 with PID pairs (available with zero-DTC)
  - Prefix mismatch (Mode 01 header instead of Mode 02)
  - Unknown PIDs mixed with known PIDs
  - Too-short response (header only, no PID data)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the pure parser function — the single source of truth for freeze frame decoding. This phase MUST complete before any mock profile updates or workflow integration.

**⚠️ CRITICAL**: No mock profile updates or `read_freeze_frame()` implementation until parser tests pass.

- [x] T003 Write `parse_freeze_frame()` parser tests in `desktop-agent/tests/test_freeze_frame.py` — test all cases from T002 constants:
  - Valid freeze frame with all 4 MVP PIDs → correct DTC, rpm, speed, coolantTemperature, engineLoad
  - Valid freeze frame with partial PIDs → decoded PIDs present, missing PIDs as `null`
  - DTC 0000 with no PID pairs → returns result with dtc="P0000", all MVP PIDs null
  - DTC 0000 with PID pairs → returns result with dtc="P0000" and decoded PIDs
  - NO DATA string → returns `None`
  - Empty string → returns `None`
  - Invalid hex → returns `None`
  - Prefix mismatch (41xx instead of 42xx) → returns `None`
  - Unknown PIDs mixed with known PIDs → MVP PIDs decoded, unknown PIDs in `additionalPids`
  - Too-short response → returns `None`
  - Response with only header and DTC bytes → returns result with DTC decoded, all MVP PIDs null
  All tests must FAIL initially (parser does not exist yet).

- [x] T004 Implement `parse_freeze_frame(hex_str)` in `desktop-agent/src/obd/commands/freeze_frame.py` — pure function that:
  - Validates `4201` prefix
  - Decodes 2-byte DTC using `_decode_dtc_byte_pair()`
  - MVP parser supports only the following known PIDs with fixed byte lengths:
    - PID 04 (Engine Load): 1 byte, formula `value * 100 / 255`
    - PID 05 (Coolant Temperature): 1 byte, formula `value - 40`
    - PID 0C (RPM): 2 bytes, formula `(A * 256 + B) / 4`
    - PID 0D (Vehicle Speed): 1 byte, formula `value`
  - Parsing logic decodes only these four known MVP PIDs. Unknown PIDs are preserved in `additionalPids` as raw hex values — the parser does NOT attempt generic variable-length PID decoding and does NOT infer PID lengths for unknown PIDs.
  - Returns dict with `dtc`, `rpm`, `speed`, `coolantTemperature`, `engineLoad`, `additionalPids`, `rawResponse`; or `None` on parse failure
  All T003 tests must PASS after this task.

- [x] T005 Implement `read_freeze_frame(adapter)` in `desktop-agent/src/obd/commands/freeze_frame.py` — I/O function that:
  - Calls `_send_pid(adapter, "02", "01")`
  - Returns `{supported: False, available: False, value: {}}` if `_send_pid` returns `None`
  - Calls `parse_freeze_frame(hex_str)` with the cleaned response
  - Returns `{supported: False, available: False, value: {}}` if parser returns `None`
  - Returns `{supported: True, available: True, value: result}` for valid results
  - Implements the desired-state handling for DTC P0000 with no PID data. The mapping of DTC P0000 to `{supported: True, available: False, value: {}}` follows current research assumptions (research.md R8) and may be refined after real Toyota 0201 validation. Document the mapping decision in code comments. Do not encode Toyota-specific or ECU-specific assumptions into the parser — the parser should remain generic and research-driven.
  - Preserves `rawResponse` in the result

- [x] T006 Write tests for `read_freeze_frame()` in `desktop-agent/tests/test_freeze_frame.py` — test with `MockObdAdapter` using various profiles:
  - Profile with valid freeze frame data → `{supported: True, available: True, value: {dtc, rpm, ...}}`
  - Profile with `0201` in `UNSUPPORTED_COMMANDS` → `{supported: False, available: False, value: {}}`
  - Profile with no `0201` entry in `PID_RESPONSES` (falls through to empty bytes) → `{supported: False, available: False, value: {}}`
  - Adapter returning NO DATA → `{supported: False, available: False, value: {}}`
  All tests must PASS.

**Checkpoint**: Parser and read function are complete and tested. Mock profiles and workflow integration can now begin.

---

## Phase 3: User Story 1 — Freeze Frame Available (Priority: P1) 🎯 MVP

**Goal**: A technician can request freeze frame data from a vehicle with stored DTCs and receive decoded DTC code, RPM, speed, engine load, and coolant temperature.

**Independent Test**: Send PID 0201 to a mock adapter with stored DTCs and verify the response correctly decodes DTC, RPM, speed, engine load, coolant temperature, and additionalPids.

- [x] T007 [US1] Add `PID_RESPONSES["0201"]` to `desktop-agent/src/obd/mock_profiles/default.py` — add a valid freeze frame response with DTC P0103 and all 4 MVP PIDs. Construct hex bytes that decode to RPM=2450, speed=72, load=58%, coolant=91°C per the SAE J1979 encoding in research.md R1.

- [x] T008 [P] [US1] Add `PID_RESPONSES["0201"]` to `desktop-agent/src/obd/mock_profiles/with_faults.py` — add a valid freeze frame response with DTC P0301 and all 4 MVP PIDs. Use different PID values from the default profile to exercise different decode paths.

- [x] T009 [US1] Write profile decoding tests for freeze frame in `desktop-agent/tests/test_freeze_frame.py` — verify that `default` and `with_faults` profiles produce correct `FreezeFrameResult` structures when their `PID_RESPONSES["0201"]` bytes are decoded through `parse_freeze_frame()`.

- [x] T010 [US1] Add `vehicle_health["freezeFrame"] = read_freeze_frame(adapter)` to `desktop-agent/src/agent/scan_executor.py` in `execute_vehicle_data_read()` — place after the `readinessMonitors` line, following the existing pattern. Verify the result shape in the `VEHICLE_DATA_READ` event payload.

- [x] T011 [US1] Write integration test for `freezeFrame` in `VEHICLE_DATA_READ` payload in `desktop-agent/tests/test_vehicle_health_integration.py` — verify the payload includes a `freezeFrame` key with the correct structure when using the default mock profile.

**Checkpoint**: Freeze frame data is available in the `VEHICLE_DATA_READ` event payload. User Story 1 is complete and independently testable.

---

## Phase 4: User Story 2 — No Freeze Frame Available (Priority: P1)

**Goal**: The system gracefully indicates when no freeze frame exists, without crashing the scan workflow.

**Independent Test**: Request freeze frame from a vehicle or mock profile with no stored DTCs, and verify the result correctly represents the ECU behavior without any exception.

- [x] T012 [US2] Add `PID_RESPONSES["0201"]` to `desktop-agent/src/obd/mock_profiles/no_faults.py` — add a response representing a vehicle with no stored DTCs. Use DTC bytes `00 00` with no PID pairs to represent the "supported but unavailable" state per the desired state model in research.md R8.

- [x] T013 [US2] Write parser tests for the "no freeze frame" case in `desktop-agent/tests/test_freeze_frame.py` — test that `parse_freeze_frame()` correctly handles:
  - DTC 0000 with no PID data after header → parser returns result with `dtc="P0000"`, all MVP PIDs null
  - `read_freeze_frame()` maps DTC P0000 with no PID data to `{supported: True, available: False, value: {}}`
  - Mock profile `no_faults` returns `{supported: True, available: False, value: {}}` when `0201` response has DTC 0000

- [x] T014 [US2] Verify that `read_freeze_frame()` never raises exceptions for any no-data case — add tests in `desktop-agent/tests/test_freeze_frame.py` for:
  - Adapter returning `None` from `_send_pid()` (NO DATA / empty / error)
  - `parse_freeze_frame()` returning `None` (invalid response)
  - DTC P0000 with no PID pairs
  All paths must produce a dict result, never an exception.

**Checkpoint**: The system gracefully handles all "no freeze frame available" scenarios. User Story 2 is complete.

---

## Phase 5: User Story 3 — Freeze Frame Unsupported (Priority: P1)

**Goal**: Unsupported Mode 02 requests are handled gracefully without crashing diagnostics.

**Independent Test**: Request freeze frame from a vehicle or mock profile that returns NO DATA or an unsupported PID response, and verify the result contains `supported: false, available: false` without any exception.

- [x] T015 [US3] Add `"0201"` to `UNSUPPORTED_COMMANDS` in `desktop-agent/src/obd/mock_profiles/unsupported_vin.py` — this makes the mock adapter return empty bytes for the freeze frame command, simulating an ECU that does not support Mode 02.

- [x] T016 [US3] Write tests for the unsupported freeze frame case in `desktop-agent/tests/test_freeze_frame.py` — test that:
  - `unsupported_vin` profile returns `{supported: False, available: False, value: {}}` for freeze frame
  - Mock adapter with `0201` in `UNSUPPORTED_COMMANDS` returns `{supported: False, available: False, value: {}}`
  - Mock adapter with no `0201` in `PID_RESPONSES` (falls through to empty bytes) returns `{supported: False, available: False, value: {}}`
  - NO DATA response from `_send_pid()` produces `{supported: False, available: False, value: {}}`
  - Empty response produces `{supported: False, available: False, value: {}}`
  - Invalid hex response produces `{supported: False, available: False, value: {}}`
  All results must be dicts, never exceptions.

- [x] T017 [US3] Add placeholder `PID_RESPONSES["0201"]` entries to `desktop-agent/src/obd/mock_profiles/toyota_real_sample.py` and `desktop-agent/src/obd/mock_profiles/toyota_real_faults.py` — use SAE J1979 standard example data as placeholders. Add a TODO comment noting that these will be replaced with real Toyota 0201 data when the vehicle probe is completed. The `toyota_real_faults` profile should have a valid freeze frame response; `toyota_real_sample` may use a DTC-0000 response or `UNSUPPORTED_COMMANDS` depending on expected Toyota behavior (placeholder for now).

**Checkpoint**: Unsupported freeze frame is handled gracefully. All three user stories (US1, US2, US3) are complete and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Regression testing, Toyota probe documentation, and final validation.

- [x] T018 Verify no existing tests regress — run `pytest` across the entire `desktop-agent/tests/` directory. All pre-existing tests for vehicle health, DTC, VIN, readiness monitors, and clear codes must pass without modification.

- [x] T019 Add a TODO entry in `specs/017-freeze-frame-data/research.md` for the Toyota 0201 real vehicle probe — document that this is a required pre-closure activity. When the Toyota vehicle is available:
  1. Send command `0201`
  2. Capture raw adapter response
  3. Capture cleaned response after `compact_raw_response()`
  4. Document whether freeze frame exists
  5. Document whether ECU reports NO DATA or unsupported
  6. Add captured response as a regression test in `desktop-agent/tests/test_toyota_regression.py`
  7. Update `toyota_real_sample.py` and `toyota_real_faults.py` with real data

- [x] T020 [P] Run quickstart.md validation — follow the quickstart guide to verify the complete implementation flow:
  1. Known OBD-II examples are in test constants
  2. Parser tests pass
  3. Parser implementation passes all tests
  4. Read function works with mock adapter
  5. Mock profiles return correct data
  6. Workflow integration produces correct event payload

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001 (DTC helper extraction) and T002 (test constants) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion (parser must pass tests)
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion (parser must pass tests). Can run in parallel with US1 if desired.
- **User Story 3 (Phase 5)**: Depends on Phase 2 completion (parser must pass tests). Can run in parallel with US1/US2 if desired.
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Freeze Frame Available)**: Depends on Phase 2 (parser + read function). Independent of US2 and US3.
- **US2 (No Freeze Frame Available)**: Depends on Phase 2 (parser + read function). Independent of US1 and US3.
- **US3 (Freeze Frame Unsupported)**: Depends on Phase 2 (parser + read function). Independent of US1 and US2.

### Critical Path

```
T001 (DTC helper) ──→ T003 (parser tests) ──→ T004 (parser impl) ──→ T005 (read func) ──→ T006 (read tests)
T002 (test constants) ──↗
                                                                                  ↓
                                                              T007-T011 (US1) ──→ T012-T014 (US2) ──→ T015-T017 (US3) ──→ T018-T020 (Polish)
```

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- T007 and T008 can run in parallel (different mock profiles)
- US1, US2, US3 mock profile updates can run in parallel after Phase 2 completes
- T019 (Toyota probe TODO) can run in parallel with T018 (regression tests)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch DTC helper extraction and test constants in parallel:
Task: "Extract _decode_dtc_byte_pair from elm_parser.py"
Task: "Define SAE J1979 test constants in test_freeze_frame.py"
```

## Parallel Example: Phase 3 (US1) + Phase 4 (US2) + Phase 5 (US3)

```bash
# After Phase 2 completes, all mock profile updates can run in parallel:
Task: "Add PID_RESPONSES['0201'] to default.py"
Task: "Add PID_RESPONSES['0201'] to with_faults.py"
Task: "Add PID_RESPONSES['0201'] to no_faults.py"
Task: "Add '0201' to UNSUPPORTED_COMMANDS in unsupported_vin.py"
Task: "Add placeholder PID_RESPONSES['0201'] to toyota profiles"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 2: Foundational — parser tests, parser, read function (T003-T006)
3. Complete Phase 3: US1 — mock profiles and integration (T007-T011)
4. **STOP and VALIDATE**: Test that freeze frame data appears in `VEHICLE_DATA_READ` payload
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Parser and read function ready
2. Add US1 → Freeze frame data available in event payload → Test independently (MVP!)
3. Add US2 → No freeze frame handled gracefully → Test independently
4. Add US3 → Unsupported Mode 02 handled gracefully → Test independently
5. Polish → Full regression, Toyota probe TODO, quickstart validation

### Not Blocked by Toyota Access

Implementation proceeds using SAE J1979 standard examples and mock profile data. The Toyota 0201 probe (T019) is a required pre-closure activity but does not block any implementation task. Toyota mock profile data uses placeholder values that will be replaced with real captured responses when the vehicle is available.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Mock profile `0201` data is NOT added until parser tests pass (parser-first constraint)
- The `no_faults` profile uses DTC 0000 with no PID pairs to represent the "supported but unavailable" desired state model
- Toyota mock profile data uses SAE J1979 placeholder values — real data replaces these after the Toyota 0201 probe
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence