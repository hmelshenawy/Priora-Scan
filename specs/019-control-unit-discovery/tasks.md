# Tasks: Control Unit Discovery Foundation

**Input**: Design documents from `/specs/019-control-unit-discovery/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/vehicle-data-api-contract.md, quickstart.md

**Tests**: Included per plan Phase 5 requirements and spec acceptance scenarios.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Architecture**: Control Unit Discovery is a scan-level operation, not a live data command. It runs automatically as part of the diagnostic scan workflow via `scan_executor.py`, before vehicle data/DTC collection. No `LiveDataCommandType` or `live_data/queue.py` changes are needed. The agent emits `CONTROL_UNIT_DISCOVERY_READ` as a session event, and the backend routes it through `AgentWebhookController` → `VehicleDataService.processControlUnitDiscovery()`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Desktop Agent**: `desktop-agent/src/obd/commands/`, `desktop-agent/src/obd/mock_profiles/`, `desktop-agent/src/agent/`, `desktop-agent/tests/`
- **Backend**: `backend/src/obd/`, `backend/src/vehicle-data/`, `backend/tests/unit/`
- **Frontend**: `frontend/src/components/vehicle-data/`, `frontend/src/services/`, `frontend/src/components/vehicle-data/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the shared UDS response parser module and backend event type that all user stories depend on.

- [x] T001 Create `desktop-agent/src/obd/commands/uds_response_parser.py` with `NEGATIVE_RESPONSE_CODES` mapping (7 standard codes + `UNKNOWN_NEGATIVE_RESPONSE` fallback), `parse_raw_header_payload()`, `classify_response()`, and `extract_negative_response()` — this is shared infrastructure consumed by the discovery module and future features (020, 021, 022)
- [x] T002 [P] Add `CONTROL_UNIT_DISCOVERY_READ` to `backend/src/obd/types/scan-event-type.enum.ts`

**Checkpoint**: UDS parser module and backend event type are in place — foundational code is ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Agent discovery engine and scan workflow integration that MUST be complete before any user story can deliver value.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create `desktop-agent/src/obd/commands/control_unit_discovery.py` with `DiscoveryStrategy` ABC, `GenericObdCanDiscoveryStrategy` (two-step functional→physical discovery), `DEFAULT_DISCOVERY_PROBE_SEQUENCE = ["22F190"]`, `build_responders()` pure function, and `read_control_units()` orchestrator — imports from `uds_response_parser`, does NOT own UDS parsing logic. Each probe execution must be isolated in its own try/except; failures produce `ProbeResult` records with `status: "ERROR"`, `responseType: "ERROR"`, and `errorCode` field. Discovery continues with remaining probes.
- [x] T004 [P] Create `desktop-agent/src/obd/mock_profiles/control_unit_discovery_profile.py` with functional response for `7DF` → `7E8` (negative `7F2211`), physical responses for `7E0` → `7E8` (negative), `7E1`-`7E7` → `NO DATA`, at least one positive response scenario, and multiple functional responders scenario (`7DF` → `7E8`, `7EA`, `7EC`)
- [x] T005 Register new discovery profile in `desktop-agent/src/obd/mock_profiles/profile_registry.py`
- [x] T006 Integrate `execute_control_unit_discovery(session_id, adapter)` into `desktop-agent/src/agent/scan_executor.py` as part of the diagnostic scan workflow — calls `read_control_units(adapter)` early in the scan (before vehicle data collection), emits `CONTROL_UNIT_DISCOVERY_READ` event via `emit_session_event()`. This is a scan-level operation, NOT a live data command. Each probe is isolated; on any exception, emit partial result with probes collected so far and set `completedAt` to error timestamp. Adapter disconnect mid-scan produces `errorCode: "ADAPTER_DISCONNECT"` for failed and remaining probes. No changes to `live_data/queue.py` are needed — discovery runs automatically during scan execution.

**Checkpoint**: Foundation ready — agent can discover ECUs as part of the scan workflow and emit events

---

## Phase 3: User Story 1 - Discover Responding ECUs (Priority: P1) 🎯 MVP

**Goal**: Desktop agent discovers ECUs using functional→physical strategy with probe-level isolation, classifies responses, and emits results as part of the diagnostic scan.

**Independent Test**: Connect to a real vehicle or simulated adapter, run a diagnostic scan, verify positive/negative responses classified as DISCOVERED, NO DATA classified as NOT_FOUND, probe errors produce ERROR records with errorCode, and partial results persist after adapter disconnect.

### Tests for User Story 1

- [x] T007 [P] [US1] Create `desktop-agent/tests/test_uds_response_parser.py` — unit tests for `parse_raw_header_payload()` (valid responses, NO DATA, malformed), `classify_response()` (POSITIVE, NEGATIVE, NO_RESPONSE, MALFORMED, multiple responders from single probe), `extract_negative_response()` (NRC extraction), `NEGATIVE_RESPONSE_CODES` (known codes, unknown fallback)
- [x] T008 [P] [US1] Create `desktop-agent/tests/test_control_unit_discovery.py` — unit tests for: functional discovery success, physical discovery success, negative response classified as DISCOVERED, NO_DATA classified as NOT_FOUND, malformed response classified as UNKNOWN/MALFORMED, multiple functional responders (3 ECUs from `7DF`), deterministic confidence rules (LOW for functional-only, HIGH for physical-confirmed), `discoveredBy` array aggregation, `scanMode` field, `DEFAULT DISCOVERY_PROBE_SEQUENCE` configuration (strategy consumes from config, not hardcoded), forbidden service rejection, max probe count enforcement, zero responders found, module imports from `uds_response_parser` not reimplementing, **probe-level isolation** (single probe ERROR does not abort scan, TIMEOUT produces `errorCode: "TIMEOUT"`, COMMUNICATION_ERROR produces `errorCode: "COMMUNICATION_ERROR"`, UNEXPECTED_PAYLOAD produces `errorCode: "UNEXPECTED_PAYLOAD"`, ADAPTER_DISCONNECT produces `errorCode: "ADAPTER_DISCONNECT"` with partial results), `errorCode` is null for non-ERROR statuses
- [x] T009 [US1] Add control unit discovery scan integration test to `desktop-agent/tests/test_scan_events.py` — verify `CONTROL_UNIT_DISCOVERY_READ` event is emitted with correct payload shape when a diagnostic scan runs

### Implementation for User Story 1

*(Implementation tasks T003–T006 were completed in Phase 2 as foundational work. US1 tests T007–T009 validate that implementation.)*

**Checkpoint**: Agent discovers ECUs as part of the scan workflow, classifies responses, handles probe-level errors, and emits events — US1 is fully testable

---

## Phase 4: User Story 3 - Store Discovery for Future Features (Priority: P3)

**Goal**: Backend persists discovery data under `DiagnosticSession.vehicleDataJson.controlUnitDiscovery` with error isolation, and exposes it through the existing vehicle data endpoint.

**Independent Test**: Verify persisted JSON contains `probes`, `responders` with `discoveredBy`, `probeSequence`, `scanMode`, `errorCode` fields; verify existing vehicle health data is unaffected; verify backward compatibility when `controlUnitDiscovery` is missing.

*Note: US3 is implemented before US2 because the frontend (US2) needs the backend persistence and API contract in place first.*

discover_control_units()
must execute after adapter initialization
and protocol setup,
but before VIN / DTC / vehicle health collection.

### Tests for User Story 3

- [x] T010 [P] [US3] Add `ControlUnitDiscovery` validation tests to `backend/tests/unit/vehicle-data/vehicle-data-response.dto.unit.test.ts` — validate valid shape, missing field (backward compatible), malformed data, `scanMode` field, `errorCode` field (known codes accepted, null for non-ERROR statuses)
- [x] T011 [P] [US3] Add `processControlUnitDiscovery()` tests to `backend/tests/unit/vehicle-data/vehicle-data.service.unit.test.ts` — persistence, merge behavior (additive only), backward compatibility, **error isolation** (malformed discovery data does not crash session)
- [x] T012 [P] [US3] Add `CONTROL_UNIT_DISCOVERY_READ` routing test to `backend/tests/unit/obd/agent-webhook.controller.unit.test.ts` — event routing (session event, not live data command), **error isolation** (processing errors do not crash webhook handler)

### Implementation for User Story 3

- [x] T013 [US3] Extend `backend/src/vehicle-data/dtos/vehicle-data-response.dto.ts` — add `ControlUnitDiscovery` (with `scanMode`), `DiscoverySummary`, `ProbeResult` (with `errorCode` field), `DiscoverySource`, `Responder`, `ResponderCapabilities` interfaces; extend `VehicleDataJson` with optional `controlUnitDiscovery`; update `isValidVehicleDataJson()` to accept sessions without `controlUnitDiscovery` and validate structure when present (including `scanMode` and `errorCode` validation)
- [x] T014 [US3] Add `processControlUnitDiscovery(sessionId, discovery)` to `backend/src/vehicle-data/services/vehicle-data.service.ts` — fetch the diagnostic session, replace the current session's existing `controlUnitDiscovery` snapshot with the latest discovery result, and preserve all other `vehicleDataJson` fields unchanged. Do not append discovery history and do not merge historical discovery results. Apply error isolation: catch and log processing errors without crashing the session or webhook flow. Validate `errorCode` values (`TIMEOUT`, `COMMUNICATION_ERROR`, `UNEXPECTED_PAYLOAD`, `ADAPTER_DISCONNECT`), while preserving unknown codes for forward compatibility, then save via repository.
- [x] T015 [US3] Update `backend/src/obd/controllers/agent-webhook.controller.ts` — add `CONTROL_UNIT_DISCOVERY_READ` case to event routing, delegate to `vehicleDataService.processControlUnitDiscovery()`, **error isolation**: catch and log errors, do not propagate to crash the webhook handler. This routes a scan/session event — not a live data command.

**Checkpoint**: Backend persists discovery data with error isolation — US3 is fully testable

---

## Phase 5: User Story 2 - View Discovered Control Units (Priority: P2)

**Goal**: Frontend displays responders by default with confidence badges, scan mode, optional probe details (including `errorCode`), and empty state handling.

**Independent Test**: Provide pre-existing discovery data (mock or stored) and verify the UI displays responders with response ID, confidence, and status; error probes show `errorCode`; empty state renders; no ECU names are inferred.

### Tests for User Story 2

- [x] T016 [P] [US2] Create `frontend/src/components/vehicle-data/__tests__/ControlUnitsPanel.test.tsx` — renders responders from mock discovery data, shows empty state when no discovery data, shows empty state when zero responders found, displays confidence badges (LOW/HIGH), does not display ECU names, displays `scanMode` in discovery metadata, probe details section is collapsible and not shown by default, expanding probe details shows all probes, negative response codes visible in tooltip/detail, **error probes display `errorCode`** (e.g., TIMEOUT, ADAPTER_DISCONNECT) with error indicator style
- [x] T017 [P] [US2] Add discovery rendering tests to `frontend/src/components/vehicle-data/__tests__/VehicleHealthPanel.test.tsx` — ControlUnitsPanel integration, conditional rendering (shows only when `controlUnitDiscovery` exists)

### Implementation for User Story 2

- [x] T018 [US2] Extend `frontend/src/services/vehicle-data-api.ts` — add `ControlUnitDiscovery`, `DiscoverySummary`, `ProbeResult` (with `errorCode`), `DiscoverySource`, `Responder`, `ResponderCapabilities` interfaces (including `scanMode` on `ControlUnitDiscovery`); add optional `controlUnitDiscovery?: ControlUnitDiscovery` to `VehicleDataJson`
- [x] T019 [US2] Create `frontend/src/components/vehicle-data/ControlUnitsPanel.tsx` — default view renders `responders` array with columns: Response ID, Confidence, Status, Protocol; no ECU names (display as "—"); empty state when zero responders; confidence badges (LOW → yellow/amber, HIGH → green); `scanMode` in discovery metadata section; collapsible `<details>` showing `probes` with columns: Method, Request ID, Probe, Response ID, Status, Response Type, Error Code, Raw Response; **error probes** display `errorCode` with error indicator style; negative response details in tooltip/expandable row
- [x] T020 [US2] Update `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` — add `ControlUnitsPanel` section after vehicle health data; conditionally render only if `vehicleData.controlUnitDiscovery` exists; pass `controlUnitDiscovery` data as prop

**Checkpoint**: Frontend displays responders with confidence, scan mode, error codes, and probe details — US2 is fully testable

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation, regression testing, and documentation

- [ ] T021 [P] Run all agent tests: `cd desktop-agent && python -m pytest tests/test_uds_response_parser.py tests/test_control_unit_discovery.py tests/test_scan_events.py -v`
- [ ] T022 [P] Run all backend tests: `cd backend && npx jest --testPathPattern="vehicle-data|agent-webhook" --verbose`
- [ ] T023 [P] Run all frontend tests: `cd frontend && npx jest --testPathPattern="ControlUnitsPanel|VehicleHealthPanel" --verbose`
- [ ] T024 Run full regression: `cd backend && npx jest --verbose && cd ../frontend && npx jest --verbose && cd ../desktop-agent && python -m pytest tests/ -v`
- [ ] T025 Validate quickstart examples: verify agent usage, backend processing, and frontend rendering snippets compile and match actual implementation
- [ ] T026 Verify existing vehicle health PID reads, DTC, readiness, freeze frame, VIN, and live data streaming are unaffected by discovery feature changes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001 (UDS parser) completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — tests validate foundational implementation
- **US3 (Phase 4)**: Depends on Phase 2 for agent event shape — can start after T001
- **US2 (Phase 5)**: Depends on US3 (T013–T015) for backend persistence — frontend needs API contract
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Agent discovery — independent after foundational phase. Can be tested with mock adapter. Discovery runs as part of the scan workflow, not as a live data command.
- **US3 (P3)**: Backend persistence — depends on US1 event shape but not on US1 being fully complete (uses the event contract). Can proceed in parallel with US1 testing.
- **US2 (P2)**: Frontend display — depends on US3 backend being in place for real data, but can be developed with mock data.

### Within Each User Story

- Tests MUST be written and FAIL before implementation (for foundational phase, tests validate already-written code)
- Parser before discovery engine
- Discovery engine before scan executor integration
- Backend DTOs before service before controller
- Frontend types before components before integration

### Parallel Opportunities

- T001, T002 can run in parallel (different files, different codebases)
- T007, T008 can run in parallel (different test files)
- T010, T011, T012 can run in parallel (different test files)
- T016, T017 can run in parallel (different test files)
- T021, T022, T023 can run in parallel (different codebases)

---

## Parallel Example: Foundational Phase

```bash
# Phase 1 — Setup (both in parallel):
Task T001: "Create uds_response_parser.py"
Task T002: "Add CONTROL_UNIT_DISCOVERY_READ enum"

# Phase 2 — Foundational (after T001):
Task T003: "Create control_unit_discovery.py"           # depends on T001
Task T004: "Create mock profile"                        # parallel with T003
Task T005: "Register profile"                            # depends on T004
Task T006: "Integrate into scan_executor.py"             # depends on T003
```

## Parallel Example: User Story 1 Tests

```bash
# All US1 tests in parallel:
Task T007: "test_uds_response_parser.py"
Task T008: "test_control_unit_discovery.py"
Task T009: "test_scan_events.py (discovery)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T006)
3. Complete Phase 3: US1 Tests (T007–T009)
4. **STOP and VALIDATE**: Run agent tests, verify discovery runs during scan
5. At this point, the agent discovers ECUs as part of the diagnostic scan workflow

### Incremental Delivery

1. Setup + Foundational → Agent discovers ECUs as part of scan and emits events
2. Add US1 Tests → Validate agent discovery end-to-end
3. Add US3 → Backend persists and exposes discovery data → Deploy/Demo (MVP+)
4. Add US2 → Frontend displays responders → Deploy/Demo (Full feature)
5. Polish → Regression and real vehicle validation

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 tests (T007–T009)
   - Developer B: US3 implementation (T013–T015) + tests (T010–T012)
3. After US3 backend is in place:
   - Developer C: US2 frontend (T018–T020) + tests (T016–T017)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Probe-level isolation is a core invariant: a single probe failure never aborts the discovery scan
- `errorCode` field on `ProbeResult` is `null` for all non-ERROR statuses; one of `TIMEOUT`, `COMMUNICATION_ERROR`, `UNEXPECTED_PAYLOAD`, `ADAPTER_DISCONNECT` when `status` is `ERROR`
- **Discovery is a scan-level operation, NOT a live data command.** It runs automatically as part of the diagnostic scan via `scan_executor.py`. No `LiveDataCommandType` or `live_data/queue.py` changes are needed.
- The agent emits `CONTROL_UNIT_DISCOVERY_READ` as a session event, routed through `AgentWebhookController` → `VehicleDataService.processControlUnitDiscovery()`.
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence