# Tasks: Real Vehicle Extended PID Validation

**Input**: Design documents from `/specs/018-extended-live-data-pids/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md

**Tests**: Included — the spec explicitly requires unit tests and integration tests (FR-014, FR-017).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Scope**: 7 required PIDs only (06, 07, 08, 09, 0B, 10, 11). No optional PIDs. No normalization of reader results — validation output must expose reality exactly as observed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Desktop agent**: `desktop-agent/src/obd/` (source), `desktop-agent/tests/` (tests)
- All new source files go under `desktop-agent/src/obd/commands/`
- All new test files go under `desktop-agent/tests/`
- Mock profiles go under `desktop-agent/src/obd/mock_profiles/`

---

## Phase 1: Setup

**Purpose**: Create the new source files with module structure and imports

- [X] T001 Create `desktop-agent/src/obd/commands/extended_pids.py` with module docstring, imports from `health_pids` (`_send_pid`, `_parse_bytes`, `_health_pid_result`, `_unavailable_pid_result`, `_unsupported_pid_result`), and type hints for `BaseAdapter`

- [X] T002 Create `desktop-agent/src/obd/commands/pid_validation.py` with module docstring, imports from `extended_pids` (`CONFIGURED_EXTENDED_PIDS`, `EXTENDED_PID_NAMES`, `EXTENDED_PID_UNITS`), `supported_pids` (`read_supported_pids`), and `health_pids` (`_unsupported_pid_result`, `_unavailable_pid_result`, `_get_unit_for_pid`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the extended PID reader functions that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [US1] Implement `read_stft_bank1(adapter)` in `desktop-agent/src/obd/commands/extended_pids.py` — PID 06, prefix `4106`, formula `(A - 128) * 100 / 128`, unit `%`, follows same pattern as `read_engine_load` in `health_pids.py`

- [X] T004 [P] [US1] Implement `read_ltft_bank1(adapter)` in `desktop-agent/src/obd/commands/extended_pids.py` — PID 07, prefix `4107`, formula `(A - 128) * 100 / 128`, unit `%`

- [X] T005 [P] [US1] Implement `read_stft_bank2(adapter)` in `desktop-agent/src/obd/commands/extended_pids.py` — PID 08, prefix `4108`, formula `(A - 128) * 100 / 128`, unit `%`

- [X] T006 [P] [US1] Implement `read_ltft_bank2(adapter)` in `desktop-agent/src/obd/commands/extended_pids.py` — PID 09, prefix `4109`, formula `(A - 128) * 100 / 128`, unit `%`

- [X] T007 [P] [US1] Implement `read_map(adapter)` in `desktop-agent/src/obd/commands/extended_pids.py` — PID 0B, prefix `410B`, formula `A` (single byte), unit `kPa`

- [X] T008 [P] [US1] Implement `read_maf(adapter)` in `desktop-agent/src/obd/commands/extended_pids.py` — PID 10, prefix `4110`, formula `(A * 256 + B) / 100`, unit `g/s` (two-byte decode, same pattern as `read_battery_voltage`)

- [X] T009 [P] [US1] Implement `read_throttle_position(adapter)` in `desktop-agent/src/obd/commands/extended_pids.py` — PID 11, prefix `4111`, formula `A * 100 / 255`, unit `%`

- [X] T010 [US1] Add `CONFIGURED_EXTENDED_PIDS` dict (PIDs 06, 07, 08, 09, 0B, 10, 11 only), `EXTENDED_PID_NAMES` dict, and `EXTENDED_PID_UNITS` dict in `desktop-agent/src/obd/commands/extended_pids.py` — no optional PIDs 0F or 33

**Checkpoint**: All 7 reader functions exist and can be imported. Each follows the three-state result pattern (`_health_pid_result`, `_unavailable_pid_result`, `_unsupported_pid_result`). CONFIGURED_EXTENDED_PIDS contains exactly 7 entries.

---

## Phase 3: User Story 1 — Validate Extended PIDs on a Real Vehicle (Priority: P1) 🎯 MVP

**Goal**: Implement `read_extended_pid_validation()` that discovers supported PIDs, reads them safely, handles all error cases, and returns structured results with failure reasons exposed.

**Independent Test**: Run the validation function against a mock adapter with various PID support scenarios and verify correct three-state results with reason field for each PID.

**Key principle**: This is a validation feature. Do NOT normalize or hide discrepancies. Preserve actual reader results and surface failure reasons.

### Implementation for User Story 1

- [X] T011 [US1] Implement `read_extended_pid_validation(adapter)` in `desktop-agent/src/obd/commands/pid_validation.py` — calls `read_supported_pids(adapter)`, raises `RuntimeError("Extended PID validation aborted. Supported PID discovery failed.")` if no Mode 01 PIDs discovered, classifies extended PIDs into supported/unsupported, reads supported PIDs via `CONFIGURED_EXTENDED_PIDS`, **preserves actual reader results without normalization** (does NOT override `supported: False` to `unavailable` — instead surfaces discrepancies as-is with a `reason` field), marks unsupported PIDs via `_unsupported_pid_result`. Each result dict includes an optional `reason` field: `"NO_DATA"` when adapter returns empty/error, `"INVALID_RESPONSE"` when hex parse fails, `"PREFIX_MISMATCH"` when response prefix doesn't match expected PID.

- [X] T012 [US1] Create `desktop-agent/src/obd/mock_profiles/extended_pid_validation_profile.py` — new dedicated mock profile with `PROFILE_NAME = "extended_pid_validation"`, PID bitmap (`0100`, `0120`, `0140`) including exactly 7 required PIDs (06, 07, 08, 09, 0B, 10, 11) — no optional PIDs 0F or 33, deterministic `PID_RESPONSES` with known decode values, `VIN_RESPONSE`, `DTC_RESPONSES` (no faults), `CLEAR_DTC_RESPONSE`, empty `FAULT_METADATA`, and empty `UNSUPPORTED_COMMANDS`

- [X] T013 [US1] Register `extended_pid_validation` profile in `desktop-agent/src/obd/mock_profiles/profile_registry.py` — add `"extended_pid_validation": lambda: import_module(...)` entry to `_PROFILES` dict, following the exact same pattern as existing profile registrations

**Checkpoint**: `read_extended_pid_validation()` can be called with `MockObdAdapter(profile_name="extended_pid_validation")` and returns structured results with three-state PIDs plus `reason` field, `report`, and `support_matrix` keys. Discovery failure raises `RuntimeError`. Reader results are preserved as-is without normalization.

---

## Phase 4: User Story 2 — Unit Test Coverage for Extended PID Decoders (Priority: P2)

**Goal**: Verify decode formulas with known hex inputs, and verify error handling for unsupported/NO DATA/malformed responses.

**Independent Test**: Run `python -m pytest desktop-agent/tests/test_extended_pids.py -v` and verify all decoder tests pass.

### Tests for User Story 2

- [X] T014 [P] [US2] Create `desktop-agent/tests/test_extended_pids.py` with `TestFuelTrimDecoding` class — test `41067F` ≈ -0.78%, `410680` = 0%, `4106FF` ≈ 99.22% for PIDs 06, 07, 08, 09 (STFT/LTFT Bank 1 & 2) using mock adapter with hex responses

- [X] T015 [P] [US2] Add `TestMafDecoding` class to `desktop-agent/tests/test_extended_pids.py` — test `41100064` = 1.00 g/s for PID 10

- [X] T016 [P] [US2] Add `TestThrottleDecoding` class to `desktop-agent/tests/test_extended_pids.py` — test `411105` ≈ 1.96%, `411100` = 0%, `4111FF` ≈ 100% for PID 11

- [X] T017 [P] [US2] Add `TestMapDecoding` class to `desktop-agent/tests/test_extended_pids.py` — test `410B2A` = 42 kPa, `410B00` = 0 kPa for PID 0B

- [X] T018 [US2] Add `TestExtendedPidErrorHandling` class to `desktop-agent/tests/test_extended_pids.py` — test unsupported PID (adapter returns empty → `supported: False`), wrong prefix response (`available: False, reason: "PREFIX_MISMATCH"`), insufficient bytes (`available: False, reason: "INVALID_RESPONSE"`), adapter error response (`available: False, reason: "NO_DATA"`), and result shape matches three-state model plus `reason` field

**Checkpoint**: All decoder tests pass. `python -m pytest desktop-agent/tests/test_extended_pids.py -v` shows green.

---

## Phase 5: User Story 3 — Validation Report Generation (Priority: P3)

**Goal**: Implement formatted console report and support matrix with failure reasons exposed, and add integration tests for the full validation flow.

**Independent Test**: Run `python -m pytest desktop-agent/tests/test_pid_validation.py -v` and verify report format, support matrix format, raw response visibility, reason field, and discovery failure abort.

### Implementation for User Story 3

- [X] T019 [US3] Implement `format_validation_report(results, pid_names, pid_units)` in `desktop-agent/src/obd/commands/pid_validation.py` — generates detailed report with `===== EXTENDED PID VALIDATION =====` header, per-PID sections showing `Supported: YES/NO`, `Available: YES/NO` (if supported), `Raw Response: <hex>` (if available), `Value: <number> <unit>` (if available), **`Reason: <reason>` (if available=false, showing NO_DATA/INVALID_RESPONSE/PREFIX_MISMATCH)**, and `===== END VALIDATION =====` footer

- [X] T020 [US3] Implement `format_support_matrix(results, pid_names, pid_units)` in `desktop-agent/src/obd/commands/pid_validation.py` — generates tabular `PID | Name | Supported | Available | Value | Reason` summary, with `YES/NO` for Supported/Available, numeric value with unit for available PIDs, `-` for unsupported PIDs, and reason text for unavailable PIDs

### Tests for User Story 3

- [X] T021 [US3] Create `desktop-agent/tests/test_pid_validation.py` with `TestFullValidation` — test against `MockObdAdapter(profile_name="extended_pid_validation")`, verify all 7 required PIDs decoded correctly, Bank 2 fuel trims present and decoded, MAP/MAF/throttle values correct

- [X] T022 [US3] Add `TestDiscoveryAbort` class to `desktop-agent/tests/test_pid_validation.py` — test that `read_extended_pid_validation()` raises `RuntimeError` with message containing "Supported PID discovery failed" when adapter returns no Mode 01 PIDs

- [X] T023 [US3] Add `TestPartialSupport` class to `desktop-agent/tests/test_pid_validation.py` — test with a custom mock that only supports some PIDs in the bitmap, verify unsupported PIDs return `supported: False` and no OBD command is sent for them

- [X] T024 [US3] Add `TestSupportedButUnavailable` class to `desktop-agent/tests/test_pid_validation.py` — test PID in bitmap but returning NO DATA, verify `supported: True, available: False, value: None, reason: "NO_DATA"`. Also test wrong prefix → `reason: "PREFIX_MISMATCH"`, and malformed response → `reason: "INVALID_RESPONSE"`. Verify that reader results are preserved as-is without normalization.

- [X] T025 [US3] Add `TestReportFormat` class to `desktop-agent/tests/test_pid_validation.py` — verify report contains header `===== EXTENDED PID VALIDATION =====`, per-PID sections with `Supported:`, `Available:`, `Raw Response:`, `Value:`, `Reason:` (when applicable) lines, and footer `===== END VALIDATION =====`

- [X] T026 [US3] Add `TestSupportMatrixFormat` class to `desktop-agent/tests/test_pid_validation.py` — verify support matrix contains `PID | Name | Supported | Available | Value | Reason` header and one row per PID with correct YES/NO values and reason text for failed reads

- [X] T027 [US3] Add `TestRawResponseInReport` class to `desktop-agent/tests/test_pid_validation.py` — verify each successfully queried PID shows its raw hex response in the report (e.g., `Raw Response: 41100064`)

**Checkpoint**: Full validation flow works end-to-end. Report and support matrix include failure reasons. Discovery failure aborts with RuntimeError. Reader results are preserved without normalization.

---

## Phase 6: Polish & Regression Verification

**Purpose**: Verify no regressions and clean up

- [X] T028 Run full desktop-agent test suite: `cd desktop-agent && python -m pytest tests/ -v` — all existing tests must pass unchanged, especially `test_vehicle_health_integration.py` and `test_toyota_regression.py`

- [X] T029 Verify no modifications to existing files except `profile_registry.py` — confirm `health_pids.py`, `vehicle_health.py`, `vehicle_data.py`, `toyota_real_sample.py`, and all other existing source files are unchanged

- [X] T030 Verify `read_extended_pid_validation()` works with `MockObdAdapter(profile_name="extended_pid_validation")` — manually call the function and confirm report and support matrix output matches expected format, including `Reason:` lines for unavailable PIDs

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion — needs reader functions to exist
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion — tests the reader functions
- **User Story 3 (Phase 5)**: Depends on Phase 3 completion — needs orchestrator and mock profile for integration tests
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Validate Extended PIDs)**: Depends on Phase 2 (reader functions). Core MVP.
- **US2 (Unit Test Coverage)**: Depends on Phase 2 (reader functions). Can start after Phase 2, parallel with US1 implementation.
- **US3 (Validation Report)**: Depends on US1 (needs orchestrator + mock profile). Can start after Phase 3.

### Within Each User Story

- Reader functions (T003-T009) can be written in parallel — they're independent
- CONFIGURED_EXTENDED_PIDS (T010) depends on all readers existing
- Orchestrator (T011) depends on CONFIGURED_EXTENDED_PIDS (T010)
- Mock profile (T012) can be written in parallel with orchestrator
- Integration tests (T021-T027) depend on orchestrator + mock profile

### Parallel Opportunities

- T003-T009: All 7 reader functions can be written in parallel (different PIDs, no shared state)
- T012-T013: Mock profile and registry can be written in parallel with T011 (orchestrator)
- T014-T017: Decoder test classes can be written in parallel (different PIDs)
- T021-T027: Integration test classes can be written in parallel (different test scenarios)

---

## Parallel Example: Phase 2 (Reader Functions)

```bash
# Launch all reader functions together (T003-T009):
Task: "Implement read_stft_bank1 in extended_pids.py"
Task: "Implement read_ltft_bank1 in extended_pids.py"
Task: "Implement read_stft_bank2 in extended_pids.py"
Task: "Implement read_ltft_bank2 in extended_pids.py"
Task: "Implement read_map in extended_pids.py"
Task: "Implement read_maf in extended_pids.py"
Task: "Implement read_throttle_position in extended_pids.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (create files)
2. Complete Phase 2: Foundational (7 reader functions + dicts)
3. Complete Phase 3: User Story 1 (orchestrator + mock profile)
4. **STOP and VALIDATE**: Run `python -m pytest desktop-agent/tests/test_extended_pids.py -v` and manually test `read_extended_pid_validation()`
5. The validation function works end-to-end at this point

### Incremental Delivery

1. Setup + Foundational → Reader functions ready
2. Add US1 → Orchestrator works → Can validate PIDs on real vehicle
3. Add US2 → Unit tests pass → Decoder correctness verified
4. Add US3 → Report generation works → Full validation output with support matrix and failure reasons
5. Polish → Regression suite passes → Ready for Feature 018B planning

### Suggested Commit Messages

- Phase 1-2: `feat(obd): add extended PID reader functions for validation`
- Phase 3: `feat(obd): add validation orchestrator and mock profile`
- Phase 4: `test(obd): add extended PID decoder unit tests`
- Phase 5: `feat(obd): add validation report and integration tests`
- Phase 6: `test(obd): verify regression suite passes`

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- **Scope: 7 required PIDs only (06, 07, 08, 09, 0B, 10, 11). No optional PIDs 0F or 33.**
- **No normalization: Reader results are preserved as-is. Failure reasons (NO_DATA, INVALID_RESPONSE, PREFIX_MISMATCH) are surfaced in the `reason` field, report, and support matrix.**
- `toyota_real_sample.py` is NEVER modified — it's a frozen reference profile
- `vehicle_data.py` is NEVER modified — no re-exports are added
- Discovery failure raises `RuntimeError` (not a custom exception) per agent convention
- `profile_registry.py` is the only existing file modified (one additive line)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently