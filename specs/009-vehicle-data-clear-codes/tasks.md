# Tasks: Vehicle Health & DTC Clear

**Input**: Design documents from `/specs/009-vehicle-data-clear-codes/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included per feature specification requirements (backend unit, integration, security; frontend component tests).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. Phase A (Vehicle Health) stories are implemented first, then Phase B (DTC Clear) stories. Desktop Agent tasks are first-class tasks embedded in the correct user story phases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Backend modules: `backend/src/{module}/`
- Frontend components: `frontend/src/components/{feature}/`
- Desktop Agent: `desktop-agent/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prisma migration, new NestJS modules, enum extensions, and agent command type definitions that all user stories depend on.

- [x] T001 Add `vehicleDataJson` (Json, nullable) and `vehicleDataReadAt` (DateTime, nullable) columns to `DiagnosticSession` model in `backend/prisma/schema.prisma`
- [x] T002 Run Prisma migration `20260613_add_vehicle_data_json` and verify it applies cleanly
- [x] T003 [P] Add `VEHICLE_DATA_READ`, `DTC_CLEARED`, `DTC_CLEAR_FAILED` to `ScanEventType` enum in `backend/src/obd/types/scan-event-type.enum.ts`
- [x] T004 [P] Create `vehicle-data` NestJS module structure: `backend/src/vehicle-data/vehicle-data.module.ts` with empty module, controller, service, repository, and DTOs directories
- [x] T005 [P] Create `dtc-clear` NestJS module structure: `backend/src/dtc-clear/dtc-clear.module.ts` with empty module, controller, service, and DTOs directories
- [x] T006 Register `VehicleDataModule` and `DtcClearModule` in `backend/src/app.module.ts` imports
- [x] T007 [P] Add `READ_VEHICLE_DATA` and `CLEAR_DTC` command types to `desktop-agent/src/live_data/queue.py` command type dispatch — extend the existing command queue polling to recognize and route the new command types alongside `LIVE_DATA_POLL` and `LIVE_DATA_STOP`

**Checkpoint**: Schema migrated, new modules registered, event types extended, agent command routing ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared backend services, agent event handling, and agent OBD command implementations that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Backend Foundation

- [x] T008 Implement `VehicleDataRepository` in `backend/src/vehicle-data/repositories/vehicle-data.repository.ts` — read/write `vehicleDataJson` and `vehicleDataReadAt` on `DiagnosticSession`, tenant-scoped
- [x] T009 Implement `VehicleDataResponseDto` and `VehicleDataPointDto` with Zod validation in `backend/src/vehicle-data/dtos/vehicle-data-response.dto.ts` — matches contract shape with supported/value/unit fields
- [x] T010 [P] Implement `DtcClearResponseDto` with Zod validation in `backend/src/dtc-clear/dtos/dtc-clear-response.dto.ts` — matches contract shape with sessionId/status/previousFaultCodeCount
- [x] T011 Extend `AgentWebhookController.scanEvents` in `backend/src/obd/controllers/agent-webhook.controller.ts` — add switch cases for `VEHICLE_DATA_READ`, `DTC_CLEARED`, `DTC_CLEAR_FAILED` events delegating to VehicleDataService and DtcClearService
- [x] T012 [P] Add `READ_VEHICLE_DATA` and `CLEAR_DTC` command types to agent command polling in `backend/src/obd/controllers/agent-webhook.controller.ts` scan-queue endpoint — extend LiveDataCommand queue with new command types
- [x] T013 [P] Create frontend API client for vehicle data in `frontend/src/services/vehicle-data-api.ts` — `readVehicleData(sessionId)` POST and `getVehicleData(sessionId)` GET with TanStack Query hooks
- [x] T014 [P] Create frontend API client for DTC clear in `frontend/src/services/dtc-clear-api.ts` — `clearFaultCodes(sessionId)` POST and `getClearStatus(sessionId)` GET with TanStack Query hooks

### Desktop Agent OBD Commands

- [x] T015 [P] Implement `read_battery_voltage` in `desktop-agent/src/obd/commands/vehicle_data.py` — send PID 42 (`0142`), decode response using formula `A * 256 + B / 1000` (Volts), return `{ value, unit, supported }` shape
- [x] T016 [P] Implement `read_fuel_system_status` in `desktop-agent/src/obd/commands/vehicle_data.py` — send PID 03 (`0103`), decode bitmask to Open Loop Temperature / Closed Loop / Open Loop Load / Open Loop Fault / Closed Loop Fault, return `{ value, supported, details: { system1, system2 } }` shape
- [x] T017 [P] Implement `read_engine_load` in `desktop-agent/src/obd/commands/vehicle_data.py` — send PID 04 (`0104`), decode using formula `A * 100 / 255` (%), return `{ value, unit, supported }` shape
- [x] T018 [P] Implement `read_fuel_level` in `desktop-agent/src/obd/commands/vehicle_data.py` — send PID 2F (`012F`), decode using formula `A * 100 / 255` (%), return `{ value, unit, supported }` shape
- [x] T019 Implement `read_readiness_monitors` in `desktop-agent/src/obd/commands/vehicle_data.py` — send PID 01 (`0101`), decode bitmask for 11 standard monitors (misfire, fuelSystem, components, catalyst, heatedCatalyst, evap, secondaryAir, acRefrigerant, oxygenSensor, oxygenSensorHeater, egrVvt), each with `supported` and `complete` flags, return `{ supported, value: { ...monitors } }` shape
- [x] T020 Implement `read_supported_pids` in `desktop-agent/src/obd/commands/vehicle_data.py` — send PIDs 00/20/40/60/80/A0 (`0100`, `0120`, `0140`, etc.) to discover which Mode 01 and Mode 09 PIDs the vehicle supports, return `{ "01": [...hex], "09": [...hex] }` shape
- [x] T021 Implement `read_mileage` in `desktop-agent/src/obd/commands/vehicle_data.py` — attempt PID 31 (`0131`) for Distance Since DTC Clear (km); if unsupported, return `{ value: null, unit: "km", supported: false }`; this PID is commonly unavailable on many vehicles
- [x] T022 [P] Implement `clear_dtc` in `desktop-agent/src/obd/commands/clear_dtc.py` — send Mode 04 command (`04`), parse adapter response (positive = `44` prefix, negative = `7F 04` NRC), return success or `{ success: false, reason: "ECU rejected clear command (7F 04 31)" }` on failure; handle adapter disconnect during clear with try/except and return failure event
- [x] T023 Implement `execute_vehicle_data_read` in `desktop-agent/src/main.py` — dispatch handler for `READ_VEHICLE_DATA` command type: call read_battery_voltage, read_fuel_system_status, read_engine_load, read_fuel_level, read_readiness_monitors, read_supported_pids, read_mileage, and reuse existing `read_vin` from `desktop-agent/src/obd/commands/vin.py`; assemble full Vehicle Health payload per contract shape; push `VEHICLE_DATA_READ` event via `POST /obd/agents/:id/scan-events`
- [x] T024 Implement `execute_clear_dtc` in `desktop-agent/src/main.py` — dispatch handler for `CLEAR_DTC` command type: call `clear_dtc`; on success push `DTC_CLEARED` event; on failure push `DTC_CLEAR_FAILED` event with `reason` in payload; on adapter disconnect push `DTC_CLEAR_FAILED` event with reason "Adapter disconnected during clear"
- [x] T025 Extend main loop command dispatch in `desktop-agent/src/main.py` — add `READ_VEHICLE_DATA` → `execute_vehicle_data_read` and `CLEAR_DTC` → `execute_clear_dtc` to the `poll_live_data_command_queue` dispatch alongside existing `LIVE_DATA_POLL` and `LIVE_DATA_STOP`

### Mock Agent Responses

- [x] T026 [P] Add mock vehicle health responses to `desktop-agent/src/obd/mock_adapter.py` — extend `MockObdAdapter.send()` to handle PID 42 (battery voltage 12.4V), PID 03 (fuel system status Closed Loop), PID 04 (engine load 32.5%), PID 2F (fuel level 75%), PID 01 (readiness monitors with realistic mix of complete/incomplete), PID 00/20 (supported PID masks including 01/03/04/05/0C/0D/0F/10/11/14/2F/31/42 for Mode 01 and 02 for Mode 09)
- [x] T027 [P] Add mock mileage unsupported response to `desktop-agent/src/obd/mock_adapter.py` — when `send("0131")` is called, return `NO DATA` or empty response to simulate vehicle not supporting mileage PID
- [x] T028 [P] Add mock clear DTC responses to `desktop-agent/src/obd/mock_adapter.py` — extend `MockObdAdapter.send()` to handle `04` (Mode 04 clear): return `44` (success) by default; add `mock_clear_fails: bool` flag (default False) that when True returns `7F 04 31` (ECU rejected) to simulate clear failure scenario

**Checkpoint**: Foundation ready — backend repositories/DTOs, agent event handling, frontend API clients, agent OBD command implementations, and mock responses all exist. User story implementation can begin.

---

## Phase 3: User Story 1 — Read Vehicle Data During a Session (Priority: P1, Phase A) 🎯 MVP

**Goal**: Technician can trigger a one-shot vehicle data read from a Diagnostic Session and see the results persisted and displayed.

**Independent Test**: With a connected adapter and open Diagnostic Session, press "Read Vehicle Data," verify Vehicle Health panel populates within 30 seconds. Unsupported PIDs show "Not supported by vehicle / adapter." Data persists after page reload.

### Implementation for User Story 1

- [x] T029 [US1] Implement `VehicleDataService.queueRead` in `backend/src/vehicle-data/services/vehicle-data.service.ts` — validate session exists, belongs to tenant, is open, has connected adapter; write `VEHICLE_DATA_READ_REQUESTED` audit record; queue `READ_VEHICLE_DATA` command via LiveDataCommand; set in-memory "read pending" flag
- [x] T030 [US1] Implement `VehicleDataService.processVehicleDataRead` in `backend/src/vehicle-data/services/vehicle-data.service.ts` — receive agent VEHICLE_DATA_READ event payload, validate JSONB shape, write `vehicleDataJson` and `vehicleDataReadAt` to DiagnosticSession, write `VEHICLE_DATA_READ_COMPLETED` audit record, clear "read pending" flag
- [x] T031 [US1] Implement `VehicleDataService.getVehicleData` in `backend/src/vehicle-data/services/vehicle-data.service.ts` — return vehicleDataJson and vehicleDataReadAt for a session, tenant-scoped
- [x] T032 [US1] Implement `VehicleDataController` in `backend/src/vehicle-data/controllers/vehicle-data.controller.ts` — POST `/api/v1/diagnostic-sessions/:sessionId/vehicle-data/read` (calls queueRead) and GET `/api/v1/diagnostic-sessions/:sessionId/vehicle-data` (calls getVehicleData)
- [x] T033 [US1] Wire VehicleDataController routes in `backend/src/vehicle-data/vehicle-data.module.ts` and register VehicleDataService/Repository providers

**Checkpoint**: Backend vehicle data read API is functional. Agent can receive READ_VEHICLE_DATA commands and push VEHICLE_DATA_READ events.

---

## Phase 4: User Story 2 — View Vehicle Health Panel (Priority: P1, Phase A)

**Goal**: Vehicle Health panel on Diagnostic Session detail page shows all read data points with values, units, and supported/unsupported status.

**Independent Test**: Open a session with previously read vehicle data. Verify the Vehicle Health panel shows all data points. Open a session without data. Verify "Read Vehicle Data" button appears.

### Implementation for User Story 2

- [x] T034 [P] [US2] Create `VehicleDataPointRow` component in `frontend/src/components/vehicle-data/VehicleDataPointRow.tsx` — renders a single data point row with label, value/unit, and "Not supported by vehicle / adapter" fallback when `supported: false`
- [x] T035 [P] [US2] Create `SupportedPidList` component in `frontend/src/components/vehicle-data/SupportedPidList.tsx` — expandable section listing supported PIDs grouped by mode, each showing hex code and human-readable name from PIDDefinition
- [x] T036 [US2] Create `VehicleHealthPanel` component in `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` — main panel composing VehicleDataPointRow for each data point (battery voltage, VIN, readiness monitors, fuel system status, engine load, fuel level, mileage) and SupportedPidList. Shows "Read Vehicle Data" button when `vehicleDataJson` is null and adapter is connected, or "No adapter connected" when no adapter
- [x] T037 [US2] Add `VehicleHealthPanel` to Diagnostic Session detail page in `frontend/src/app/diagnostic-sessions/[sessionId]/page.tsx` — mount component with sessionId prop, wire to vehicle-data-api TanStack Query hooks for read and get operations

**Checkpoint**: Vehicle Health panel renders on session detail page. Can trigger reads and see results. Unsupported PIDs display correctly.

---

## Phase 5: User Story 5 — View Supported PID List (Priority: P2, Phase A)

**Goal**: Supported PID list is visible in the Vehicle Health panel after a successful read.

**Independent Test**: Complete a vehicle data read. Verify the Supported PIDs section shows hex codes and names grouped by mode.

### Implementation for User Story 5

- [x] T038 [US5] Enhance `SupportedPidList` in `frontend/src/components/vehicle-data/SupportedPidList.tsx` — resolve hex PID codes to human-readable names by calling `GET /api/v1/pids` (existing PIDDefinition endpoint from Feature 006) or using a local PID name map. Group by mode (Mode 01, Mode 09). Show count summary

**Checkpoint**: Supported PID list shows resolved names. Phase A is complete — all vehicle health stories are done.

---

## Phase 6: User Story 3 — Clear Fault Codes After Repair (Priority: P1, Phase B) 🎯

**Goal**: Technician can clear fault codes from a Diagnostic Session with a mandatory confirmation modal and see success/failure result.

**Independent Test**: Open a session with fault codes. Press "Clear Fault Codes." Verify confirmation modal appears. Acknowledge and confirm. Verify clear command is queued and result is displayed. Session with no codes does not show the button.

### Implementation for User Story 3

- [x] T039 [US3] Implement `DtcClearService.queueClear` in `backend/src/dtc-clear/services/dtc-clear.service.ts` — validate session exists, belongs to tenant, is open, has fault codes, has connected adapter; check "clear pending" in-memory flag (reject if already pending); write `DTC_CLEAR_REQUESTED` audit record with `previousFaultCodeCount` and `userId` metadata; queue `CLEAR_DTC` command via LiveDataCommand; set "clear pending" flag
- [x] T040 [US3] Implement `DtcClearService.processClearResult` in `backend/src/dtc-clear/services/dtc-clear.service.ts` — handle DTC_CLEARED event (write `DTC_CLEAR_COMPLETED` audit, clear pending flag) and DTC_CLEAR_FAILED event (write `DTC_CLEAR_FAILED` audit with `failureReason` metadata, clear pending flag). Existing fault codes are NOT deleted
- [x] T041 [US3] Implement `DtcClearService.getClearStatus` in `backend/src/dtc-clear/services/dtc-clear.service.ts` — check in-memory pending flag and most recent audit record for session to return NONE/PENDING/SUCCESS/FAILED status
- [x] T042 [US3] Implement `DtcClearController` in `backend/src/dtc-clear/controllers/dtc-clear.controller.ts` — POST `/api/v1/diagnostic-sessions/:sessionId/fault-codes/clear` (calls queueClear) and GET `/api/v1/diagnostic-sessions/:sessionId/fault-codes/clear-status` (calls getClearStatus)
- [x] T043 [US3] Wire DtcClearController routes in `backend/src/dtc-clear/dtc-clear.module.ts` and register DtcClearService providers
- [x] T044 [P] [US3] Create `ClearConfirmationModal` component in `frontend/src/components/dtc-clear/ClearConfirmationModal.tsx` — warning text "Clearing fault codes may erase diagnostic evidence and reset readiness monitors", checkbox acknowledgment, disabled Confirm button until acknowledged, Cancel button, open/close state
- [x] T045 [P] [US3] Create `ClearResultBanner` component in `frontend/src/components/dtc-clear/ClearResultBanner.tsx` — success banner (green) with message and "Run scan again" action, failure banner (red) with failure reason, auto-dismiss optional
- [x] T046 [US3] Create `ClearFaultCodesButton` component in `frontend/src/components/dtc-clear/ClearFaultCodesButton.tsx` — button visible only when session has fault codes and is open; on click opens ClearConfirmationModal; on confirm calls dtc-clear-api POST; shows "Clearing in progress..." state; polls clear-status or listens for result; renders ClearResultBanner on completion
- [x] T047 [US3] Add `ClearFaultCodesButton` to Control Unit area in `frontend/src/components/obd/ControlUnitOverview.tsx` — pass sessionId and fault code count props; only render when session has fault codes and is open

**Checkpoint**: DTC clear flow works end-to-end. Confirmation modal blocks accidental clears. Success/failure banners render. Audit records are written.

---

## Phase 7: User Story 4 — Re-Scan After Clearing Fault Codes (Priority: P2, Phase B)

**Goal**: After successful clear, "Run scan again" action initiates a new scan and previous results are preserved as historical evidence.

**Independent Test**: After successful clear, press "Run scan again." Verify new scan starts. After completion, session shows new results and previous results remain in audit trail.

### Implementation for User Story 4

- [x] T048 [US4] Add "Run scan again" action handler in `ClearFaultCodesButton` component in `frontend/src/components/dtc-clear/ClearFaultCodesButton.tsx` — on success, render "Run scan again" button alongside success banner; button calls existing scan initiation flow from Feature 004 (same as "Rescan" in ScanResultActions)
- [x] T049 [US4] Verify previous `SessionFaultCode` records are NOT deleted by clear operation — add explicit check in `DtcClearService.processClearResult` in `backend/src/dtc-clear/services/dtc-clear.service.ts` that the clear event handler does NOT delete any SessionFaultCode rows; new scan after clearing creates new SessionFaultCode records via existing import flow

**Checkpoint**: Re-scan works after clear. Previous fault codes remain in history.

---

## Phase 8: User Story 6 — Clear Fault Codes Audit Trail (Priority: P2, Phase B)

**Goal**: DTC clear operations generate immutable, tenant-scoped audit events visible in the session audit trail.

**Independent Test**: Perform a successful clear — verify DTC_CLEAR_REQUESTED + DTC_CLEAR_COMPLETED audit events exist. Perform a failed clear — verify DTC_CLEAR_REQUESTED + DTC_CLEAR_FAILED audit events exist. Verify tenant isolation on audit records.

### Tests for User Story 6

- [x] T050 [P] [US6] Write unit test for `DtcClearService` audit record generation in `backend/tests/unit/dtc-clear/dtc-clear.service.unit.test.ts` — test that queueClear writes DTC_CLEAR_REQUESTED with correct metadata, processClearResult writes COMPLETED/FAILED, verify metadata shape
- [x] T051 [P] [US6] Write integration test for DTC clear tenant isolation in `backend/tests/security/vehicle-data-dtc-clear.tenant-isolation.test.ts` — verify user in tenant A cannot clear fault codes in tenant B session, verify audit records are tenant-scoped

### Implementation for User Story 6

- [x] T052 [US6] Verify audit record rendering in session detail — the existing session audit trail (from Feature 004) should already display DTC_CLEAR_REQUESTED/COMPLETED/FAILED actions since it renders all `DiagnosticSessionAuditRecord` entries; if not, add rendering support in session detail page audit section

**Checkpoint**: Audit trail is complete and tenant-isolated. Phase B is complete.

---

## Phase 9: Tests (Cross-Cutting)

**Purpose**: Backend unit tests, integration tests, security tests, agent tests, and frontend component tests across all stories.

### Backend Tests

- [ ] T053 [P] Write unit test for `VehicleDataService` in `backend/tests/unit/vehicle-data/vehicle-data.service.unit.test.ts` — test queueRead validation (no adapter, closed session, tenant mismatch), processVehicleDataRead JSONB write, getVehicleData tenant scoping, concurrent read prevention
- [ ] T054 [P] Write integration test for `VehicleDataController` in `backend/tests/integration/vehicle-data/vehicle-data.controller.integration.test.ts` — test POST /vehicle-data/read returns 202, GET /vehicle-data returns data, 409 for no adapter, 404 for wrong tenant
- [ ] T055 [P] Write unit test for `DtcClearService` in `backend/tests/unit/dtc-clear/dtc-clear.service.unit.test.ts` — test queueClear validation (no fault codes, closed session, no adapter, concurrent clear), processClearResult success/failure, audit record generation
- [ ] T056 [P] Write integration test for `DtcClearController` in `backend/tests/integration/dtc-clear/dtc-clear.controller.integration.test.ts` — test POST /fault-codes/clear returns 202, 409 for no fault codes, 409 for concurrent clear, tenant isolation

### Desktop Agent Tests

- [ ] T057 [P] Write unit test for vehicle data OBD commands in `desktop-agent/tests/test_vehicle_data_commands.py` — test `read_battery_voltage` decoding (PID 42 formula), `read_fuel_system_status` bitmask decode, `read_engine_load` decoding (PID 04 formula), `read_fuel_level` decoding (PID 2F formula), `read_readiness_monitors` bitmask decode (11 monitors), `read_supported_pids` mask parsing, `read_mileage` unsupported vehicle handling (returns `supported: false`)
- [ ] T058 [P] Write unit test for clear DTC command in `desktop-agent/tests/test_clear_dtc.py` — test `clear_dtc` success response (prefix `44`), failure response (`7F 04 31` parsing), adapter disconnect during clear (exception → failure event), timeout handling
- [ ] T059 [P] Write integration test for `execute_vehicle_data_read` in `desktop-agent/tests/test_vehicle_data_read_flow.py` — test that `READ_VEHICLE_DATA` command dispatch calls all PID readers and assembles correct VEHICLE_DATA_READ event payload shape matching API contract; test with MockObdAdapter returning realistic data
- [ ] T060 [P] Write integration test for `execute_clear_dtc` flow in `desktop-agent/tests/test_clear_dtc_flow.py` — test `CLEAR_DTC` command dispatch: success path pushes DTC_CLEARED event, failure path pushes DTC_CLEAR_FAILED with reason, adapter disconnect pushes DTC_CLEAR_FAILED with "Adapter disconnected" reason
- [ ] T061 [P] Write mock adapter test for vehicle health in `desktop-agent/tests/test_mock_vehicle_health.py` — test MockObdAdapter returns correct hex bytes for PID 42/03/04/2F/01/00, test mileage PID returns NO DATA, test all mock values decode to expected results
- [ ] T062 [P] Write mock adapter test for clear DTC scenarios in `desktop-agent/tests/test_mock_clear_dtc.py` — test default mock returns success (`44`), test `mock_clear_fails=True` returns failure (`7F 04 31`)

### Frontend Tests

- [ ] T063 [P] Write frontend test for `VehicleHealthPanel` in `frontend/src/components/vehicle-data/__tests__/VehicleHealthPanel.test.tsx` — test rendering with data, rendering without data, unsupported PID display, "Read Vehicle Data" button
- [ ] T064 [P] Write frontend test for `ClearConfirmationModal` in `frontend/src/components/dtc-clear/__tests__/ClearConfirmationModal.test.tsx` — test modal blocks confirm until checkbox acknowledged, warning text renders, cancel works

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all user stories.

- [ ] T065 [P] Run quickstart.md validation — verify all endpoints respond, all frontend components render, read/clear flows work end-to-end with mock agent
- [ ] T066 [P] Verify `PERMANENT_CODES_ONLY` warning handling in `DtcClearService.queueClear` in `backend/src/dtc-clear/services/dtc-clear.service.ts` — when session has only PERMANENT status codes, still allow clear but include warning in response
- [ ] T067 Verify battery voltage (PID 42) and engine load (PID 04) one-shot reads do NOT conflict with active LiveData polling session — test that vehicle data read and live data polling can coexist in same session without errors
- [ ] T068 [P] Add unsupported-value edge case handling in `VehicleHealthPanel` in `frontend/src/components/vehicle-data/VehicleHealthPanel.tsx` — verify that when ALL PIDs are unsupported, panel still renders gracefully with "Not supported" for each data point

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — backend vehicle data API + agent vehicle data commands
- **US2 (Phase 4)**: Depends on Foundational — frontend panel; can proceed in parallel with US1 backend
- **US5 (Phase 5)**: Depends on US2 — extends the panel component
- **US3 (Phase 6)**: Depends on Foundational — backend DTC clear API + agent clear DTC command; can proceed after Phase 2
- **US4 (Phase 7)**: Depends on US3 — re-scan after clear
- **US6 (Phase 8)**: Depends on US3 — audit trail tests
- **Tests (Phase 9)**: Depends on US1 + US3 completion
- **Polish (Phase 10)**: Depends on all stories complete

### User Story Dependencies

```
Phase 1: Setup (incl. agent command type routing)
    ↓
Phase 2: Foundational (backend DTOs/repos + agent OBD commands + mock responses)
    ↓
    ├── Phase 3: US1 (Backend: Vehicle Data API) ← agent vehicle data read is already done in Phase 2
    ├── Phase 4: US2 (Frontend: Vehicle Health Panel) ──→ Phase 5: US5 (PID List)
    └── Phase 6: US3 (Backend+Frontend: DTC Clear) ← agent clear DTC is already done in Phase 2
        ──→ Phase 7: US4 (Re-Scan)
        └──→ Phase 8: US6 (Audit Trail)
    ↓
Phase 9: Tests (backend + agent + frontend)
    ↓
Phase 10: Polish
```

### Within Each User Story

- Agent OBD commands before backend services (agent must produce events for backend to process)
- Models/DTOs before services
- Services before controllers
- Controllers before frontend components
- Backend before frontend for each story

### Parallel Opportunities

- T003, T004, T005, T007 (Setup — different files) can run in parallel
- T009, T010 (Foundational DTOs — different modules) can run in parallel
- T012, T013, T014 (Frontend API clients — different files) can run in parallel
- T015, T016, T017, T018 (Agent PID commands — same file but distinct functions; can be parallel if split into separate PRs or done sequentially in one pass) — **NOTE**: T015–T018 all live in `vehicle_data.py`; implement sequentially within the file, but test in parallel
- T026, T027, T028 (Mock responses — different PID handlers in same file) can be developed in parallel if split
- T034, T035 (US2 — different component files) can run in parallel
- T044, T045 (US3 — different component files) can run in parallel
- T050, T051 (US6 tests — different test files) can run in parallel
- T053–T064 (Phase 9 tests — all different files) can run in parallel
- T065, T066, T068 (Polish — different files) can run in parallel
- US1 backend and US2 frontend can be developed in parallel
- US3 backend and US5 can be developed in parallel

---

## Parallel Example: Phase 2 Foundational

```text
# Backend + Agent foundation can launch together:
T008: "Implement VehicleDataRepository in backend/src/vehicle-data/repositories/"
T009: "Implement VehicleDataResponseDto in backend/src/vehicle-data/dtos/"
T010: "Implement DtcClearResponseDto in backend/src/dtc-clear/dtos/"
T013: "Create vehicle-data-api client in frontend/src/services/"
T014: "Create dtc-clear-api client in frontend/src/services/"

# Agent OBD commands (same repo, different functions):
T015–T021: "Implement all vehicle data PID readers in desktop-agent/src/obd/commands/vehicle_data.py"
T022: "Implement clear_dtc in desktop-agent/src/obd/commands/clear_dtc.py"
T023–T025: "Wire agent dispatch and main loop in desktop-agent/src/main.py"

# Mock agent responses:
T026–T028: "Extend MockObdAdapter in desktop-agent/src/obd/mock_adapter.py"
```

## Parallel Example: Phase 6 (US3 Components)

```text
# Launch all US3 frontend components together:
T044: "Create ClearConfirmationModal in frontend/src/components/dtc-clear/"
T045: "Create ClearResultBanner in frontend/src/components/dtc-clear/"
```

---

## Implementation Strategy

### MVP First (Phase A — Vehicle Health)

1. Complete Phase 1: Setup (migration + module structure + agent command routing)
2. Complete Phase 2: Foundational (repository, DTOs, agent events, API clients, **agent OBD commands**, **mock responses**)
3. Complete Phase 3: US1 (backend vehicle data read API — agent already handles READ_VEHICLE_DATA from Phase 2)
4. Complete Phase 4: US2 (frontend Vehicle Health panel)
5. **STOP and VALIDATE**: Test vehicle data read end-to-end with mock agent
6. Deploy/demo if ready — Vehicle Health is a useful standalone increment

### Incremental Delivery (Phase B — DTC Clear)

1. Complete Phase 5: US5 (PID list display — quick polish)
2. Complete Phase 6: US3 (DTC clear with confirmation modal — agent already handles CLEAR_DTC from Phase 2)
3. **STOP and VALIDATE**: Test DTC clear end-to-end — this is the critical Phase B deliverable
4. Complete Phase 7: US4 (re-scan after clear)
5. Complete Phase 8: US6 (audit trail tests)
6. Deploy/demo — full feature complete

### Full Feature Delivery

1. Complete Phase 9: Tests (all backend, **agent**, and frontend tests)
2. Complete Phase 10: Polish (quickstart validation, edge cases)
3. Final validation and merge

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Phase A (US1, US2, US5) can be delivered as a standalone "Vehicle Health" increment
- Phase B (US3, US4, US6) requires Phase A foundation (agent command queue, session context)
- **Desktop Agent tasks are first-class tasks** — agent OBD commands (T015–T025) and mock responses (T026–T028) are in Phase 2 because the backend cannot process VEHICLE_DATA_READ / DTC_CLEARED events until the agent can produce them
- No new database tables — only 2 nullable columns on DiagnosticSession
- Concurrent clear prevention uses in-memory flag (Redis-ready for future)
- Mock agent must support READ_VEHICLE_DATA and CLEAR_DTC command types for development
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently