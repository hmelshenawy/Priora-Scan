# Tasks: Realistic OBD Mock Profiles

**Input**: Design documents from `/specs/011-obd-mock-profiles/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Desktop Agent source**: `desktop-agent/src/obd/`
- **Desktop Agent tests**: `desktop-agent/tests/`
- **Mock profiles**: `desktop-agent/src/obd/mock_profiles/`
- **Config**: `desktop-agent/src/config.py`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create package structure and configuration entry point

- [x] T001 Create mock_profiles package directory with `__init__.py` at `desktop-agent/src/obd/mock_profiles/__init__.py`
- [x] T002 Add `OBD_MOCK_PROFILE` configuration variable to `desktop-agent/src/config.py`, defaulting to `"default"` and reading from `os.getenv("OBD_MOCK_PROFILE", "default")`
- [x] T003 Add `OBD_MOCK_PROFILE=default` entry to `desktop-agent/.env`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create ProfileRegistry module at `desktop-agent/src/obd/mock_profiles/profile_registry.py` implementing `get_active_profile()`, `get_profile(name)`, `list_profiles()`, and `_load_profile(name)` per the contract in `contracts/mock-profile-contract.md`. Use static `PROFILES` dict mapping profile names to import functions. Fall back to `"default"` with logged warning on invalid names
- [x] T005 Create the default profile module at `desktop-agent/src/obd/mock_profiles/default.py` that reproduces the exact behavior of the current `MockObdAdapter.send()` per research Task 9. Include all PID_RESPONSES, VIN_RESPONSE, DTC_RESPONSES, CLEAR_DTC_RESPONSE, FAULT_METADATA, and UNSUPPORTED_COMMANDS as raw bytes
- [x] T006 Refactor `MockObdAdapter` in `desktop-agent/src/obd/mock_adapter.py` to delegate response generation to the active profile loaded via `ProfileRegistry`. Preserve `_dtcs_cleared` state behavior for Mode 04. Add `__init__(self, profile_name=None)` parameter that auto-detects from config. Delegate `fault_metadata` property to the active profile
- [x] T007 Update `desktop-agent/src/obd/mock_profiles/__init__.py` to export `ProfileRegistry`, `get_active_profile`, and `list_profiles`
- [x] T008 Add graceful handling in `desktop-agent/src/obd/commands/vin.py` for the all-FF VIN payload case. When `_read_vin_mock()` detects that all data bytes after the `4902` prefix are `0xFF`, raise `RuntimeError("VIN not supported by vehicle")` with a descriptive message that the caller can display

**Checkpoint**: Foundation ready — ProfileRegistry loads profiles, MockObdAdapter delegates to them, default profile reproduces current behavior, all existing tests still pass ✅

---

## Phase 3: User Story 1 — Developer selects a mock vehicle profile (Priority: P1) 🎯 MVP

**Goal**: A developer can set `OBD_MOCK_PROFILE=toyota_real_sample` and receive raw OBD responses matching real captured vehicle data. Invalid profile names fall back to default with a warning.

**Independent Test**: Start Desktop Agent with a specific profile and verify OBD command responses match the profile's defined raw ECU responses

### Implementation for User Story 1

- [x] T009 [P] [US1] Create the `toyota_real_sample` profile module at `desktop-agent/src/obd/mock_profiles/toyota_real_sample.py` with all raw OBD response bytes matching captured vehicle data per spec FR-004 and FR-005: PID_RESPONSES (0100=4100BE1FB813, 0104=410476, 0105=41057E, 010C=410C0E10, 010D=410D00, 0142=41423469), VIN_RESPONSE=all-FF bytes, DTC_RESPONSES (all "NO DATA"), FAULT_METADATA={}, UNSUPPORTED_COMMANDS={"012F", "0902"}, READINESS_MONITORS=None
- [x] T010 [US1] Register `toyota_real_sample` profile in the `PROFILES` dict inside `desktop-agent/src/obd/mock_profiles/profile_registry.py`
- [x] T011 [P] [US1] Create `no_faults` profile module at `desktop-agent/src/obd/mock_profiles/no_faults.py` with valid vehicle health PIDs, valid VIN (JTDBR32E720123456), and DTC_RESPONSES returning zero-code responses per spec FR-006
- [x] T012 [US1] Register `no_faults` profile in the `PROFILES` dict inside `desktop-agent/src/obd/mock_profiles/profile_registry.py`
- [x] T013 [US1] Write tests in `desktop-agent/tests/test_mock_profiles.py` for: (1) profile selection with existing profile name returns correct profile, (2) profile selection with nonexistent name falls back to default with warning, (3) profile selection with no OBD_MOCK_PROFILE uses default, (4) all 6 profile names are listed by `list_profiles()`, (5) switching profiles by restarting agent with different OBD_MOCK_PROFILE value

**Checkpoint**: User Story 1 fully functional — developers can select profiles and get realistic vehicle data ✅

---

## Phase 4: User Story 2 — Developer tests DTC fault code workflows offline (Priority: P2)

**Goal**: A developer can test DTC workflows with fault codes using `with_faults` and `toyota_real_faults` profiles, and verify no-fault scenarios with `no_faults`

**Independent Test**: Switch profiles and trigger diagnostic scans, verify DTC responses decode to expected fault codes with enriched descriptions

### Implementation for User Story 2

- [x] T014 [P] [US2] Create the `with_faults` profile module at `desktop-agent/src/obd/mock_profiles/with_faults.py` with raw DTC response bytes that decode to P0301, P0171, U0100 per spec FR-007. Include valid vehicle health PIDs, valid VIN, and FAULT_METADATA matching the enrichment engine expectations
- [x] T015 [P] [US2] Create the `toyota_real_faults` profile module at `desktop-agent/src/obd/mock_profiles/toyota_real_faults.py` combining `toyota_real_sample` vehicle health PIDs with DTC fault codes P0301, P0171, U0100 per spec FR-014. PID_RESPONSES for 0100, 0104, 0105, 010C, 010D, 0142 must be identical to `toyota_real_sample`
- [x] T016 [US2] Register `with_faults` and `toyota_real_faults` profiles in the `PROFILES` dict inside `desktop-agent/src/obd/mock_profiles/profile_registry.py`
- [x] T017 [US2] Write tests in `desktop-agent/tests/test_mock_profiles.py` for: (1) `with_faults` profile returns DTC responses that decode to P0301, P0171, U0100, (2) `toyota_real_faults` DTC responses decode to same fault codes, (3) `toyota_real_faults` vehicle health PIDs match `toyota_real_sample`, (4) `no_faults` DTC scans return zero-code responses, (5) `toyota_real_faults` fault_metadata matches enrichment expectations

**Checkpoint**: User Story 2 fully functional — DTC workflows can be tested with fault codes offline ✅

---

## Phase 5: User Story 3 — Developer tests unsupported VIN scenario (Priority: P3)

**Goal**: A developer can test the unsupported VIN scenario with `unsupported_vin` profile, and the UI displays "Not supported by vehicle" without crashing

**Independent Test**: Set `unsupported_vin` profile, request VIN, verify "Not supported by vehicle" display and no workflow failure

### Implementation for User Story 3

- [x] T018 [US3] Create the `unsupported_vin` profile module at `desktop-agent/src/obd/mock_profiles/unsupported_vin.py` with the all-FF VIN payload (`4902` + 17 bytes of `0xFF` as raw bytes), valid vehicle health PIDs, and DTC_RESPONSES returning zero-code responses per spec FR-008
- [x] T019 [US3] Register `unsupported_vin` profile in the `PROFILES` dict inside `desktop-agent/src/obd/mock_profiles/profile_registry.py`
- [x] T020 [US3] Write tests in `desktop-agent/tests/test_mock_profiles.py` for: (1) `unsupported_vin` profile VIN response is all-FF payload, (2) `read_vin()` with `unsupported_vin` profile raises `RuntimeError("VIN not supported by vehicle")`, (3) `no_faults` profile returns a valid 17-char VIN, (4) `unsupported_vin` vehicle health PIDs return valid decoded values

**Checkpoint**: User Story 3 fully functional — unsupported VIN scenario can be tested without vehicle access ✅

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Regression testing, documentation, and final validation

- [x] T021 Run full test suite (`pytest desktop-agent/tests/`) and verify all existing tests pass without modification, confirming FR-012 backward compatibility (SC-007)
- [x] T022 Verify that each profile module is self-contained and adding a new profile requires only creating a module file and adding one line to `PROFILES` dict (SC-008 extensibility)
- [x] T023 Verify that MockObdAdapter `send()` returns raw bytes for all commands and that the same parser code path executes for both mock and real vehicle data (SC-010)
- [x] T024 Update `desktop-agent/.env` with a comment documenting all 6 supported `OBD_MOCK_PROFILE` values and their descriptions per quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion (can run in parallel with Phase 3)
- **User Story 3 (Phase 5)**: Depends on Phase 2 completion (can run in parallel with Phase 3 and Phase 4)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **User Story 2 (P2)**: Can start after Phase 2 — independently testable (profile modules are self-contained)
- **User Story 3 (P3)**: Can start after Phase 2 — depends on T008 (vin.py all-FF handling) from Phase 2

### Within Each User Story

- Profile modules (marked [P]) can be created in parallel
- Registry registration must follow profile creation
- Tests can be written in parallel with implementation but should validate after all files are in place

### Parallel Opportunities

- T001, T002, T003 can run in parallel (different files)
- T004, T005 can run in parallel (different files)
- T009, T011, T014, T015, T018 can all run in parallel (different profile files, no dependencies between them)
- After Phase 2: Phase 3, Phase 4, Phase 5 can proceed in parallel if team capacity allows

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch foundational tasks together:
Task T004: "Create ProfileRegistry at desktop-agent/src/obd/mock_profiles/profile_registry.py"
Task T005: "Create default profile at desktop-agent/src/obd/mock_profiles/default.py"
# Then sequentially:
Task T006: "Refactor MockObdAdapter to delegate to profile"
Task T007: "Update __init__.py exports"
Task T008: "Add all-FF VIN handling to vin.py"
```

## Parallel Example: Phase 3-5 (User Stories)

```bash
# After Phase 2, all profile modules can be created in parallel:
Task T009: "Create toyota_real_sample profile"
Task T011: "Create no_faults profile"
Task T014: "Create with_faults profile"
Task T015: "Create toyota_real_faults profile"
Task T018: "Create unsupported_vin profile"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test that `OBD_MOCK=true OBD_MOCK_PROFILE=toyota_real_sample` works
5. Validate SC-001 through SC-003

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test profile selection → Deploy/Demo (MVP!)
3. Add User Story 2 → Test DTC workflows → Deploy/Demo
4. Add User Story 3 → Test unsupported VIN → Deploy/Demo
5. Polish → Full regression → Release

### Parallel Team Strategy

With multiple developers:

1. Team completes Phase 1 + Phase 2 together (foundational)
2. Once Phase 2 is done:
   - Developer A: User Story 1 (T009-T013)
   - Developer B: User Story 2 (T014-T017)
   - Developer C: User Story 3 (T018-T020)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies between them
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Profile modules store raw OBD response bytes — same parser code runs for both mock and real paths (FR-015, SC-010)
- The `default` profile must reproduce current `MockObdAdapter` behavior exactly (FR-013, SC-007)
- vin.py T008 is in Phase 2 (foundational) because US3 depends on it and it affects shared code
- READINESS_MONITORS field is architectural preparation only — PID 0101 implementation is NOT required (FR-016)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently

## Implementation Notes

### Key Architecture Decision: Raw Bytes Storage with ASCII Hex Conversion

Profile modules store raw OBD response bytes (e.g., `bytes.fromhex("410476")`) per FR-015.
The `MockObdAdapter.send()` method converts raw bytes to ASCII hex strings (e.g., `b"410476"`)
before returning, ensuring parser compatibility with both mock and real adapters.

This means:
- **Profiles**: Store `bytes.fromhex("410476")` — authentic raw ECU data
- **Adapter `send()`**: Returns `raw.hex().upper().encode("ascii")` — ASCII hex for parsers
- **Parser functions** (`_send_pid`, `_parse_mode_response`, `_read_vin_mock`): Receive ASCII hex strings — same format as real ELM327 adapter
- **Backward compatibility**: Default profile reproduces exact `MockObdAdapter` behavior (verified by tests)