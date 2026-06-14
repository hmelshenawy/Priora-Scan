# Tasks: VIN Unsupported Handler Fix

**Input**: Design documents from `/specs/012-vin-unsupported-handler/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/vin-result-contract.md, quickstart.md

**Tests**: Included — the spec requires comprehensive test coverage for all VIN result paths.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project structure needed. The VinResult dataclass will be added to the existing `vin.py` module. This phase confirms the existing codebase is ready.

- [x] T001 Verify existing tests pass on current branch: run `pytest desktop-agent/tests/ -v` to confirm green baseline

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the VinResult type that ALL user stories depend on. No story work can begin until this phase is complete.

- [x] T002 Add `VinResult` frozen dataclass with factory methods `supported()` and `unsupported()` to `desktop-agent/src/obd/commands/vin.py`. Fields: `status: str`, `vin: str | None`, `reason: str | None = None`. Import `dataclass` from `dataclasses`.
- [x] T003 Add unsupported reason constants to `desktop-agent/src/obd/commands/vin.py`: `VIN_UNSUPPORTED_ALL_FF = "ALL_FF"`, `VIN_UNSUPPORTED_NO_DATA = "NO_DATA"`, `VIN_UNSUPPORTED_MALFORMED = "MALFORMED"`, `VIN_UNSUPPORTED_EMPTY = "EMPTY_RESPONSE"`, and status constants `VIN_SUPPORTED = "SUPPORTED"`, `VIN_UNSUPPORTED = "UNSUPPORTED"`. Use these in the factory methods.

**Checkpoint**: `VinResult` type is defined and importable. User story implementation can begin.

---

## Phase 3: User Story 1 — Vehicle Health Scan Completes with Unsupported VIN (Priority: P1) 🎯 MVP

**Goal**: VIN reads that return unsupported responses (all-FF, NO DATA, empty) no longer crash the workflow. Vehicle health scans and scan workflows continue when VIN is unsupported.

**Independent Test**: Run `execute_vehicle_data_read` with `toyota_real_sample` profile → scan completes, VIN reported as `UNSUPPORTED` with reason `ALL_FF`, health PIDs collected normally. Run `execute_scan` with `unsupported_vin` profile → scan completes, VIN_READ event emitted with `vinStatus: "UNSUPPORTED"`, DTC read proceeds.

### Implementation for User Story 1

- [x] T004 [US1] Refactor `_read_vin_mock()` in `desktop-agent/src/obd/commands/vin.py` to return `VinResult` instead of `str`/raising. Detection logic: (1) `b""` empty response → `VinResult.unsupported(VIN_UNSUPPORTED_EMPTY)`, (2) missing `4902` prefix → `VinResult.unsupported(VIN_UNSUPPORTED_MALFORMED)`, (3) all-0xFF data bytes → `VinResult.unsupported(VIN_UNSUPPORTED_ALL_FF)`, (4) decoded VIN length ≠ 17 → `VinResult.unsupported(VIN_UNSUPPORTED_MALFORMED)`, (5) valid VIN → `VinResult.supported(vin)`.
- [x] T005 [US1] Refactor real-adapter path in `read_vin()` in `desktop-agent/src/obd/commands/vin.py` to return `VinResult`. Map `parse_vin()` results: `UNSUPPORTED` dict → `VinResult.unsupported(VIN_UNSUPPORTED_NO_DATA)`, `PARSE_ERROR` dict → `VinResult.unsupported(VIN_UNSUPPORTED_NO_DATA)`, `INCOMPLETE_DATA` dict → `VinResult.unsupported(VIN_UNSUPPORTED_MALFORMED)`, `ADAPTER_STOPPED` dict → still raise `RuntimeError` (genuine failure). Valid VIN → `VinResult.supported(vin)`.
- [x] T006 [US1] Update `execute_vehicle_data_read()` in `desktop-agent/src/main.py` lines 132–137: replace `try/except` around `read_vin()` with direct `VinResult` usage. Set `vehicle_data["vin"] = {"value": result.vin, "supported": result.status == VIN_SUPPORTED}`. Add `"reason": result.reason` when unsupported.
- [x] T007 [US1] Update `execute_scan()` in `desktop-agent/src/main.py` lines 79–85: replace bare `vin = read_vin(adapter)` with `vin_result = read_vin(adapter)`. When `status == VIN_SUPPORTED`: emit `VIN_READ` with `{"vin": vin_result.vin}`. When `status == VIN_UNSUPPORTED`: emit `VIN_READ` with `{"vin": None, "vinStatus": "UNSUPPORTED", "reason": vin_result.reason}`. Remove the `RuntimeError` crash path — DTC read always proceeds.
- [x] T008 [US1] Update `test_mock_profiles.py::TestVinAllFFHandling` in `desktop-agent/tests/test_mock_profiles.py`: change `test_all_ff_vin_raises_not_supported` to assert `_read_vin_mock(all_ff_response).status == "UNSUPPORTED"` and `.reason == "ALL_FF"` instead of `pytest.raises(RuntimeError)`. Update `test_no_faults_vin_decodes_correctly` and `test_default_vin_decodes_correctly` to assert on `VinResult` fields (`.status`, `.vin`).
- [x] T009 [US1] Add new test class `TestVinResultUnsupported` in `desktop-agent/tests/test_mock_profiles.py` with tests for: `toyota_real_sample` profile → `read_vin()` returns `VinResult.unsupported("ALL_FF")`, `toyota_real_faults` profile → `read_vin()` returns `VinResult.unsupported("ALL_FF")`, `unsupported_vin` profile → `read_vin()` returns `VinResult.unsupported("ALL_FF")`, empty response (`b""`) → `VinResult.unsupported("EMPTY_RESPONSE")`.
- [x] T010 [US1] Add workflow test in `desktop-agent/tests/test_scan_events.py`: verify `execute_vehicle_data_read` completes without error when VIN is unsupported. Mock `read_vin` to return `VinResult.unsupported("ALL_FF")` and assert the `VEHICLE_DATA_READ` event payload contains `vin.supported == False` and `vin.reason == "ALL_FF"`.
- [x] T011 [US1] Add workflow test in `desktop-agent/tests/test_scan_events.py`: verify `execute_scan` continues to DTC read when VIN is unsupported. Mock `read_vin` to return `VinResult.unsupported("ALL_FF")` and assert `DTC_READ` event is emitted after `VIN_READ`.

**Checkpoint**: User Story 1 complete. All unsupported VIN paths return `VinResult` without raising. Vehicle health and scan workflows continue when VIN is unsupported. `toyota_real_sample` and `unsupported_vin` profiles work end-to-end.

---

## Phase 4: User Story 2 — Valid VIN Returns Supported Result (Priority: P2)

**Goal**: Supported VIN reads produce `VinResult.supported(vin)` with the decoded 17-char VIN string. Existing callers that need the VIN string access it via `result.vin`. Backward compatibility maintained.

**Independent Test**: Run `read_vin()` with `default` profile → `VinResult.status == "SUPPORTED"`, `VinResult.vin == "W1KAF4GB1RF124321"`. Run with `no_faults` profile → `VinResult.status == "SUPPORTED"`, `VinResult.vin` is 17 chars.

### Implementation for User Story 2

- [x] T012 [US2] Update `test_commands.py::TestVinParser` in `desktop-agent/tests/test_commands.py`: change `test_read_vin_from_valid_response` to assert `result.status == "SUPPORTED"` and `result.vin == "1HGCM82633A123456"`. Change `test_read_vin_rejects_wrong_prefix` to assert `result.status == "UNSUPPORTED"` and `result.reason == "MALFORMED"` instead of `pytest.raises(RuntimeError)`. Change `test_read_vin_rejects_short_vin` to assert `result.status == "UNSUPPORTED"` and `result.reason == "MALFORMED"`.
- [x] T013 [US2] Update `test_vin_real.py` in `desktop-agent/tests/test_vin_real.py`: update `test_multi_frame_vin` to assert on `result.vin` and `result.status == "SUPPORTED"`. Update `test_no_data_response` to assert `result.status == "UNSUPPORTED"` and `result.reason == "NO_DATA"` instead of `pytest.raises(RuntimeError, match="not supported")`. Update `test_unsupported_command` to assert `result.status == "UNSUPPORTED"` instead of `pytest.raises(RuntimeError, match="failed")`. Update `test_truncated_response` to assert `result.status == "UNSUPPORTED"` instead of `pytest.raises(RuntimeError)`. Update `test_mock_adapter_still_works` to assert on `result.vin` and `result.status`. Update `test_searching_stripped` to assert on `result.vin` and `result.status`.
- [x] T014 [US2] Update `test_scan_events.py` in `desktop-agent/tests/test_scan_events.py`: change all `patch("src.main.read_vin", return_value="WDD2130041A123456")` to `patch("src.main.read_vin", return_value=VinResult.supported("WDD2130041A123456"))`. Add `from src.obd.commands.vin import VinResult` to imports. Update event payload assertions that reference the VIN string to remain compatible (VIN_READ payload still has `vin` key).
- [x] T015 [US2] Update `test_mock_obd_adapter.py` in `desktop-agent/tests/test_mock_obd_adapter.py`: update the `read_vin` test to assert on `result.vin` and `result.status == "SUPPORTED"` instead of bare string equality.

**Checkpoint**: User Story 2 complete. All existing tests updated for `VinResult` return type. Supported VIN reads produce `VinResult.supported(vin)` and callers access VIN via `result.vin`.

---

## Phase 5: User Story 3 — Malformed VIN Response Does Not Crash (Priority: P3)

**Goal**: VIN responses with valid prefix but invalid content (non-ASCII, wrong length) produce `VinResult.unsupported("MALFORMED")` instead of raising. This completes the defensive handling matrix.

**Independent Test**: Provide a mock adapter returning `b"4902" + b"FF" * 8` (short VIN) → `VinResult.status == "UNSUPPORTED"`, `reason == "MALFORMED"`. Provide a mock adapter returning VIN with non-printable chars → `VinResult.status == "UNSUPPORTED"`, `reason == "MALFORMED"`.

### Implementation for User Story 3

- [x] T016 [US3] Add non-ASCII VIN detection to `_read_vin_mock()` in `desktop-agent/src/obd/commands/vin.py`: after decoding hex data and before the length check, add a check that all decoded characters are printable ASCII (`0x20 <= ord(c) <= 0x7E`). If any character falls outside this range, return `VinResult.unsupported(VIN_UNSUPPORTED_MALFORMED)`. This check must come after the all-0xFF check (all-0xFF takes priority with reason `ALL_FF`).
- [x] T017 [US3] Add test class `TestVinResultMalformed` in `desktop-agent/tests/test_commands.py` with tests for: (1) VIN response with non-ASCII characters → `VinResult.unsupported("MALFORMED")`, (2) VIN response with valid prefix but decoded length < 17 → `VinResult.unsupported("MALFORMED")`, (3) VIN response with valid prefix but decoded length > 17 → `VinResult.unsupported("MALFORMED")`, (4) VIN response with null bytes in decoded string → `VinResult.unsupported("MALFORMED")`.
- [x] T018 [US3] Add test for NO DATA handling in real adapter path in `desktop-agent/tests/test_vin_real.py`: verify `read_vin()` with a real adapter returning "NO DATA" produces `VinResult.unsupported("NO_DATA")` instead of raising.

**Checkpoint**: User Story 3 complete. All malformed VIN cases produce `VinResult.unsupported("MALFORMED")` without raising. The full detection matrix is: EMPTY_RESPONSE, ALL_FF, MALFORMED, NO_DATA — all return VinResult, none throw.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation updates

- [x] T019 Run full test suite: `pytest desktop-agent/tests/ -v` — all tests must pass, no regressions
- [x] T020 [P] Update `desktop-agent/src/obd/commands/vin.py` module docstring to document `VinResult` return type and the behavior contract (supported → `VinResult.supported(vin)`, unsupported → `VinResult.unsupported(reason)`, only `RuntimeError` for genuine adapter failures)
- [x] T021 Verify quickstart examples in `specs/012-vin-unsupported-handler/quickstart.md` match the implemented API by running them as test assertions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verify green baseline
- **Foundational (Phase 2)**: Depends on Phase 1 — creates `VinResult` type that all stories need
- **User Story 1 (Phase 3)**: Depends on Phase 2 — core unsupported VIN handling + caller updates
- **User Story 2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1 if VinResult exists, but logically follows since US1 changes the return type that US2 tests validate
- **User Story 3 (Phase 5)**: Depends on Phase 2 — adds malformed detection to the already-refactored `_read_vin_mock`
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 (VinResult type). Core functionality — must complete first.
- **US2 (P2)**: Depends on Phase 2 (VinResult type). Test updates for backward compatibility. Can start after T002/T003 but logically follows US1 since US1 changes the callers that US2 tests validate.
- **US3 (P3)**: Depends on Phase 2 (VinResult type). Adds detection logic to `_read_vin_mock`. Can start after T004 but logically follows US1 for full coverage.

### Recommended Execution Order

```
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011
                                                          ↘ T012 → T013 → T014 → T015
                                                                                    ↘ T016 → T017 → T018
                                                                                                              ↘ T019 → T020 → T021
```

### Parallel Opportunities

- T002 and T003 can run in parallel (constants + dataclass in same file but logically separate)
- T008, T009, T010, T011 are independent tests for US1 — can run in parallel after T007
- T012, T013, T014, T015 are independent test updates for US2 — can run in parallel after T005
- T017 and T018 are independent tests for US3 — can run in parallel after T016
- T020 and T021 are independent polish tasks — can run in parallel after T019

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Verify green baseline
2. Complete Phase 2: Add VinResult type (T002, T003)
3. Complete Phase 3: Refactor `_read_vin_mock`, `read_vin` real path, update callers (T004–T011)
4. **STOP and VALIDATE**: Run `pytest` — all tests pass, `toyota_real_sample` profile works end-to-end without crashing on VIN
5. Ship MVP if desired

### Incremental Delivery

1. Phases 1–2 → Foundation ready
2. Phase 3 → US1 complete: Unsupported VIN no longer crashes workflows
3. Phase 4 → US2 complete: Supported VIN returns `VinResult.supported(vin)`, all callers updated
4. Phase 5 → US3 complete: Malformed VIN detection covers all edge cases
5. Phase 6 → Polish: Full test suite green, docs updated

---

## Notes

- The `VinResult` dataclass is the single source of truth for VIN read outcomes. No caller should catch `RuntimeError` for unsupported VIN — only for genuine transport failures.
- `ADAPTER_STOPPED` from `elm_parser.py` is the only case in the real-adapter path that still raises `RuntimeError`. All other `parse_vin()` error results map to `VinResult.unsupported()`.
- The `execute_scan()` VIN_READ event payload adds `vinStatus` and `reason` fields when VIN is unsupported — this is additive and does not break existing backend consumers.
- Test assertions change from `assert read_vin(adapter) == "VIN_STRING"` to `assert result.vin == "VIN_STRING"` and `assert result.status == "SUPPORTED"`. The user explicitly confirmed this is acceptable (FR-012 correction).
- Mock profiles (`unsupported_vin`, `toyota_real_sample`, `toyota_real_faults`) are unchanged — they still return the same raw bytes. The change is in how `read_vin()` interprets them.