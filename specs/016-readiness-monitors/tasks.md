# Tasks: Readiness Monitors

**Input**: Design documents from `/specs/016-readiness-monitors/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Key Design Decisions

- **Parser is the source of truth**: Write tests with known SAE J1979 examples first. Verify byte ordering and byte count against the parser. Only then update profile PID 0101 responses.
- **Preserve outer compatibility**: The `readinessMonitors` key wraps the new `ReadinessResult` in `{ supported: bool, value: ReadinessResult | {} }`.
- **Fix byte mapping**: Availability from data[4]/data[5], completion from data[2]/data[3]. Current code swaps these.
- **Add MIL/DTC count**: Byte 0 (MIL bit 7 + DTC count bits 0-6) is currently ignored.
- **Raw bytes only**: Mock profiles store PID 0101 raw bytes in `PID_RESPONSES`. No decoded `READINESS_MONITORS` attribute.
- **Real Toyota probe deferred**: TODO only. Do not block on real vehicle access.

---

## Phase 1: Setup

**Purpose**: Remove deprecated attribute only — do NOT change any PID 0101 response bytes yet

- [x] T001 Remove `READINESS_MONITORS = None` from all 6 mock profile files: `desktop-agent/src/obd/mock_profiles/default.py`, `desktop-agent/src/obd/mock_profiles/no_faults.py`, `desktop-agent/src/obd/mock_profiles/with_faults.py`, `desktop-agent/src/obd/mock_profiles/unsupported_vin.py`, `desktop-agent/src/obd/mock_profiles/toyota_real_sample.py`, `desktop-agent/src/obd/mock_profiles/toyota_real_faults.py`
- [x] T002 Verify no code references `READINESS_MONITORS` attribute on mock profiles — search `desktop-agent/src/` and `desktop-agent/tests/` for `READINESS_MONITORS` and remove any assertions that access it

---

## Phase 2: Foundational — Parser + Tests (Source of Truth)

**Purpose**: Create the shared parser and verify it against known SAE J1979 examples BEFORE touching any profile data. The parser drives what the correct byte format is.

**⚠️ CRITICAL**: Parser tests must pass before any mock profile PID 0101 data is changed.

- [x] T003 Create `desktop-agent/tests/test_readiness_monitors.py` with parameterized tests for `parse_readiness_monitors()` using known SAE J1979 examples. Test cases MUST use hex strings with asserted expected outputs — do NOT derive expected values from mock profiles. Test cases:
  1. **MIL OFF, 0 DTCs, all continuous monitors supported+ready, all non-continuous supported, mix of ready/not-ready**: Input `4101000007EF07FF` → `milStatus: "OFF"`, `storedDtcCount: 0`, verify each of 11 monitors by name with expected `supported`/`ready` values decoded from the known byte mapping (data[2]=0x07 continuous completion, data[3]=0xEF non-continuous completion, data[4]=0x07 continuous availability, data[5]=0xFF non-continuous availability)
  2. **MIL ON, 3 DTCs, no monitors supported**: Input `4101830000000000` → `milStatus: "ON"`, `storedDtcCount: 3`, all monitors `supported: false, ready: null`
  3. **MIL ON, 1 DTC, some monitors supported and ready**: Input `410181000700FF00` → `milStatus: "ON"`, `storedDtcCount: 1`, continuous monitors all supported+ready, non-continuous monitors all not supported (availability byte 0x00)
  4. **All monitors supported and ready**: Input `41010007FF07FFFF` → `milStatus: "OFF"`, `storedDtcCount: 0`, all 11 monitors `supported: true, ready: true`
  5. **NO DATA / None response** (from `_send_pid` returning None) → `None` from parser, `read_readiness_monitors` returns `{ "supported": False, "value": {} }`
  6. **Empty response** → `None` from parser
  7. **Response without 4101 prefix** → `None` from parser
  8. **Truncated response (fewer than 4 data bytes)** → partial decode: MIL and DTC count from byte 0, monitors with missing availability/completion bytes marked as unsupported
  9. **5-byte data (current mock format)** `41010007FF07EF` → verify parser handles 5 data bytes gracefully (byte 5 defaults to 0, making non-continuous availability all unsupported)
  10. **Verify each monitor name** appears exactly once in the `monitors` list in SAE J1979 order

- [x] T004 Implement `parse_readiness_monitors(hex_str: str) -> dict | None` in `desktop-agent/src/obd/commands/vehicle_data.py` — the shared parser function that takes a cleaned hex string and returns a `ReadinessResult` dict or `None`. Implementation MUST: (1) validate `4101` prefix, (2) extract `milStatus` from data[0] bit 7 (`"ON"` if set, `"OFF"` if clear), (3) extract `storedDtcCount` from data[0] bits 0-6, (4) decode 11 monitors using corrected SAE J1979 byte mapping — availability from data[4] (continuous bits 0-2) and data[5] (non-continuous bits 0-7), completion from data[2] (continuous bits 0-2) and data[3] (non-continuous bits 0-7), (5) handle partial responses (5 or fewer data bytes) by defaulting missing bytes to 0, (6) return `ReadinessResult` shape: `{ milStatus, storedDtcCount, monitors: [...], rawResponse }` or `None` on parse failure, (7) each monitor entry uses field name `ready` (not `complete`)

- [x] T005 Refactor `read_readiness_monitors(adapter: BaseAdapter) -> dict` in `desktop-agent/src/obd/commands/vehicle_data.py` to: (1) call `_send_pid(adapter, "01", "01")` and preserve the raw hex string, (2) if `_send_pid` returns `None`, return `{ "supported": False, "value": {} }`, (3) if a hex string is returned, call `parse_readiness_monitors(hex_str)`, (4) if parser returns a result, wrap it in `{ "supported": True, "value": <ReadinessResult> }`, (5) if parser returns `None`, return `{ "supported": False, "value": {} }`, (6) preserve `rawResponse` inside the `ReadinessResult`

- [x] T006 Run parser tests: `pytest desktop-agent/tests/test_readiness_monitors.py -v` — ALL test cases from T003 must pass. This verifies the byte mapping is correct BEFORE touching any profile data. If any test fails, fix the parser — do NOT adjust test expectations to match the parser.

**Checkpoint**: Parser is verified against known SAE J1979 examples. Byte ordering is confirmed. The parser is the source of truth.

---

## Phase 3: User Story 1 — Read Emissions Readiness Status (Priority: P1) 🎯 MVP

**Goal**: Technician sees MIL status, DTC count, and monitor supported/ready states from a decoded PID 0101 response.

**Independent Test**: Send PID 0101 to a mock adapter and verify the decoded result contains correct `milStatus`, `storedDtcCount`, and all 11 monitor states. Parser tests already pass; this phase validates integration.

### Implementation for User Story 1

- [x] T007 [US1] Add integration test in `desktop-agent/tests/test_readiness_monitors.py` for `read_readiness_monitors(MockObdAdapter(profile_name="default"))` — verify it returns `{ "supported": True, "value": { "milStatus": ..., "storedDtcCount": ..., "monitors": [...], "rawResponse": ... } }` with the outer `{ "supported", "value" }` compatibility wrapper
- [x] T008 [US1] Add test in `desktop-agent/tests/test_readiness_monitors.py` that all 6 mock profiles have PID `0101` in their `PID_RESPONSES` dict and that calling `read_readiness_monitors()` with each profile produces a valid `ReadinessResult` (does NOT assert specific monitor values — those depend on the profile's PID 0101 bytes which may change in Phase 5)
- [x] T009 [US1] Update `desktop-agent/tests/test_mock_profiles.py` to remove any `READINESS_MONITORS` assertions and verify the `default` profile still has PID `0101` in `PID_RESPONSES`
- [x] T010 [US1] Run full desktop-agent test suite: `pytest desktop-agent/tests/ -v` — verify no regressions in vehicle health, DTC, VIN, or clear-code tests

**Checkpoint**: US1 complete — readiness monitors decode correctly, outer compatibility wrapper works, no regressions.

---

## Phase 4: User Story 2 — Real Vehicle Readiness Read (Priority: P1)

**Goal**: Mock and real adapters produce identical parser output for the same raw bytes. Edge cases are handled gracefully.

**Independent Test**: For identical hex input strings, mock adapter path and direct parser call produce structurally identical `ReadinessResult` values. Unsupported/error responses produce graceful results.

### Implementation for User Story 2

- [x] T011 [US2] Add parser equivalence test in `desktop-agent/tests/test_readiness_monitors.py` — for a known hex input string (e.g., `"4101000007EF07FF"`), verify that both `parse_readiness_monitors(hex_str)` and `read_readiness_monitors(MockObdAdapter(...))` produce identical `ReadinessResult` content (same `milStatus`, `storedDtcCount`, `monitors` list content)
- [x] T012 [US2] Add edge-case tests in `desktop-agent/tests/test_readiness_monitors.py` for: (1) PID 0101 in `UNSUPPORTED_COMMANDS` → `read_readiness_monitors` returns `{ "supported": False, "value": {} }`, (2) mock adapter returns empty bytes for 0101 → `{ "supported": False, "value": {} }`, (3) all monitor bits zero → all monitors `supported: false, ready: null`, (4) MIL OFF with completed monitors → `milStatus: "OFF"` with `ready: true` monitors
- [x] T013 [US2] Capture real Toyota `0101` readiness response and document it in `specs/016-readiness-monitors/research.md`.
- [x] T014 [US2] Update `toyota_real_sample` PID `0101` with the real 2026-06-14 capture `bytes.fromhex("410100044000")`; keep `toyota_real_faults` on synthetic MIL ON readiness data for fault workflow testing.
- [x] T015 [US2] Verify `desktop-agent/src/main.py` `execute_vehicle_data_read()` emits readiness result under `readinessMonitors` key with the `{ "supported": bool, "value": ReadinessResult }` shape — inspect the integration point, confirm `readinessMonitors` key uses the new inner shape

**Checkpoint**: US2 complete — parser equivalence verified, edge cases handled, real Toyota probe TODO in place.

---

## Phase 5: User Story 3 — Mock Profile Support (Priority: P2)

**Goal**: All mock profiles have correct PID 0101 data that decodes to expected values through the verified parser.

**Independent Test**: Each profile's PID 0101 bytes decode to specific, known monitor states via the shared parser.

**⚠️ IMPORTANT**: Profile PID 0101 data is only updated AFTER the parser is verified correct (Phase 2). The parser is the source of truth.

### Implementation for User Story 3

- [x] T016 [US3] Using the verified parser from Phase 2 as the source of truth, determine the correct 6-byte PID 0101 response for each profile. For `default`, `no_faults`, `with_faults`, and `unsupported_vin`: the current `41010007FF07EF` has only 5 data bytes after the header. Determine the correct 6-data-byte format by running `parse_readiness_monitors("41010007FF07EF")` through the parser — if the 5-byte response produces incorrect/incomplete results (byte 5 defaults to 0, making all non-continuous monitors unsupported), construct the correct 6-byte response that represents: MIL OFF, 0 DTCs, all continuous monitors supported+complete, all non-continuous monitors supported+complete (for default/no_faults/unsupported_vin) or MIL ON with appropriate DTC count (for with_faults)
- [x] T017 [P] [US3] Update `desktop-agent/src/obd/mock_profiles/default.py` PID 0101 entry with the correct 6-data-byte response determined in T016 — ensure the decoded result from `parse_readiness_monitors()` matches the intended readiness state for this profile
- [x] T018 [P] [US3] Update `desktop-agent/src/obd/mock_profiles/no_faults.py` PID 0101 entry with the correct 6-data-byte response — MIL OFF, 0 DTCs, all monitors supported and complete
- [x] T019 [P] [US3] Update `desktop-agent/src/obd/mock_profiles/with_faults.py` PID 0101 entry with the correct 6-data-byte response — MIL ON, 3 DTCs (matching this profile's fault codes), all monitors supported but not necessarily complete
- [x] T020 [P] [US3] Update `desktop-agent/src/obd/mock_profiles/unsupported_vin.py` PID 0101 entry with the correct 6-data-byte response — MIL OFF, 0 DTCs, same readiness state as default
- [x] T021 [US3] Add profile-specific readiness tests in `desktop-agent/tests/test_readiness_monitors.py` for each mock profile: (1) `default` → MIL OFF, 0 DTCs, verify specific monitor states match the profile's intended state, (2) `with_faults` → MIL ON, 3 DTCs, (3) `no_faults` → MIL OFF, 0 DTCs, (4) `unsupported_vin` → MIL OFF, 0 DTCs, (5) `toyota_real_sample` → real 2026-06-14 MIL OFF capture, (6) `toyota_real_faults` → synthetic MIL ON fault workflow readiness, (7) profile with 0101 in `UNSUPPORTED_COMMANDS` → `{ "supported": False, "value": {} }`
- [x] T022 [US3] Update the backward compatibility assertion in `desktop-agent/tests/test_mock_profiles.py` — `test_default_profile_matches_original_mock_adapter` currently asserts `adapter.send("0101") == b"41010007FF07EF"`. Update to match the new correct 6-data-byte format from T017

**Checkpoint**: US3 complete — all mock profiles have correct PID 0101 data verified against the parser. Parser is source of truth.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, regression, and documentation

- [x] T023 Run full regression suite: `pytest desktop-agent/tests/ -v` — verify all existing tests pass including vehicle health integration, mock profiles, DTC, VIN, and scan events
- [x] T024 [P] Replace the skipped Toyota readiness placeholder with an active regression test for the real 2026-06-14 `0101` capture.
- [x] T025 [P] Update `specs/016-readiness-monitors/research.md` with `## Real Toyota 0101 Probe — Captured`, including raw `b"410100044000\r\r>"`, cleaned `410100044000`, MIL OFF, stored DTC count 0, and variable-length response handling.
- [x] T026 Verify the `readinessMonitors` field in `VEHICLE_DATA_READ` event payload matches the new `{ "supported": bool, "value": ReadinessResult }` shape — confirm no other code paths depend on the old `{"monitor_name": {"supported": bool, "complete": bool}}` shape

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — remove deprecated attribute only
- **Foundational (Phase 2)**: No dependency on Phase 1 — parser and tests are the source of truth
- **US1 (Phase 3)**: Depends on Phase 2 — parser must be verified first
- **US2 (Phase 4)**: Depends on Phase 3 — integration tests need working parser
- **US3 (Phase 5)**: Depends on Phase 2 — profile data updates use the verified parser as source of truth
- **Polish (Phase 6)**: Depends on all user stories

### Critical Path

```
T003 (parser tests) → T004 (parser impl) → T006 (parser verified)
                                                    ↓
T007-T010 (US1 integration) → T011-T015 (US2 equivalence)
                                                    ↓
T016-T022 (US3 profile updates using verified parser)
                                                    ↓
T023-T026 (Polish)
```

### Parallel Opportunities

- T001 and T002 can run in parallel (T001 modifies profiles, T002 verifies no references)
- T017, T018, T019, T020 can run in parallel (different profile files)
- T024, T025 can run in parallel (different files)

### Important Ordering Constraint

**Profile PID 0101 updates (T017-T020) MUST NOT start until T006 passes** — the parser is the source of truth. Only after the parser is verified against known SAE J1979 examples should profile bytes be updated to match.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup — remove `READINESS_MONITORS` attribute
2. Complete Phase 2: Foundational — write parser tests with known examples, implement parser, verify
3. Complete Phase 3: US1 — integration tests, no regressions
4. **STOP and VALIDATE**: Parser produces correct results for known SAE J1979 examples

### Test-Driven Approach

1. **Write tests first** (T003) with known SAE J1979 examples and asserted expected values
2. **Implement parser** (T004) to pass the tests
3. **Verify** (T006) — if tests fail, fix the parser, not the tests
4. **Only then** update mock profile data (T016-T020) using the verified parser as source of truth

### Deferred Work

- **Real Toyota 0101 probe**: TODO only (T013, T014, T024, T025). Not blocking.
- **Backend readiness data API**: Optional additive work per spec
- **Frontend readiness display**: Optional additive work per spec

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Parser tests (T003) use known SAE J1979 examples — NOT mock profile data
- Profile PID 0101 bytes (T016-T020) are updated ONLY after parser is verified
- The outer `{ "supported": bool, "value": ReadinessResult | {} }` wrapper preserves backward compatibility
- `complete` is renamed to `ready` per the spec entity definition
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
