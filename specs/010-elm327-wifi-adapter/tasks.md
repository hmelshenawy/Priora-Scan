# Tasks: ELM327 WiFi Adapter Integration

**Input**: Design documents from `/specs/010-elm327-wifi-adapter/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included per feature specification requirements (Desktop Agent unit tests, backend field exposure, frontend display).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. Desktop Agent tasks are first-class tasks embedded in the correct user story phases. Backend and frontend tasks are minimal — this is primarily a Desktop Agent feature.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Desktop Agent**: `desktop-agent/src/`, `desktop-agent/tests/`
- Backend modules: `backend/src/`
- Frontend components: `frontend/src/`
- Agent OBD: `desktop-agent/src/obd/`
- Agent connection: `desktop-agent/src/obd/connection/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Environment variable configuration, adapter factory extension, and `BaseAdapter` interface formalization that all user stories depend on.

- [x] T001 Add WiFi adapter environment variables to `desktop-agent/src/config.py` — `OBD_ADAPTER_TYPE` (mock|usb|wifi), `OBD_WIFI_HOST` (default 192.168.0.10), `OBD_WIFI_PORT` (default 35000), `OBD_WIFI_TIMEOUT_SECONDS` (default 5); maintain backward compatibility with `OBD_MOCK` (OBD_MOCK=true → OBD_ADAPTER_TYPE=mock)
- [x] T002 Extend `BaseAdapter` interface in `desktop-agent/src/obd/adapter.py` — add `connect() -> bool` method, add `adapter_type: str` attribute, add `protocol: str` attribute; update `raise NotImplementedError` stubs
- [x] T003 Update adapter factory `create_obd_adapter()` in `desktop-agent/src/main.py` — support `OBD_ADAPTER_TYPE=mock|usb|wifi`; when `OBD_ADAPTER_TYPE=wifi`, create `WifiElm327Adapter`; when `OBD_ADAPTER_TYPE=usb`, create `Elm327Adapter`; when `OBD_ADAPTER_TYPE=mock`, create `MockObdAdapter`; backward compat: `OBD_MOCK=true` still creates MockObdAdapter
- [x] T004 [P] Add `connectionType` field to `AgentHeartbeatDto` in `backend/src/obd/dtos/agent-heartbeat.dto.ts` — optional string field `connectionType?` with class-validator `@IsOptional() @IsString()`
- [x] T005 [P] Update `AgentHeartbeatService.processHeartbeat()` in `backend/src/obd/services/agent-heartbeat.service.ts` — use explicit `dto.connectionType` when present; fallback: `adapterType === 'MOCK'` → `'MOCK'`, else `dto.connectionType ?? 'USB'`

**Checkpoint**: Config reads WiFi settings, adapter factory can create WiFi adapter, BaseAdapter has `connect()` method, backend heartbeat accepts `connectionType`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: WiFi TCP connection class, ELM327 response parser, and ELM327 initialization sequence that all real-data user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### WiFi Connection

- [x] T006 Implement `WifiConnection` class in `desktop-agent/src/obd/connection/wifi.py` — TCP socket connection with `open()`, `is_open()`, `write(data: bytes)`, `read() -> bytes` (reads until `>` prompt), `close()` methods; enforce 100ms minimum inter-command delay between writes; configurable host, port, timeout from constructor; raise `ConnectionError` on connect failure; raise `TimeoutError` on read timeout
- [x] T007 Write unit tests for `WifiConnection` in `desktop-agent/tests/test_wifi_connection.py` — mock socket to test: connect success, connect timeout (socket.timeout), connection refused (ConnectionRefusedError), write with inter-command delay enforcement, read until `>` prompt, read timeout, close, reconnection after close

### ELM327 Response Parser

- [x] T008 Implement `elm_parser.py` in `desktop-agent/src/obd/commands/elm_parser.py` — pure functions: `clean_raw_response(raw: bytes) -> str` (strip `>` prompt, `\r`, `SEARCHING...`, whitespace), `parse_vin(response: str) -> str` (decode Mode 09 multi-frame hex ASCII to 17-char VIN), `parse_dtcs(response: str) -> list[str]` (parse Mode 03 hex into P/B/C/U codes), `parse_clear_result(response: str) -> dict` (44 = success, 7F = failure with reason), `parse_pid_bytes(response: str) -> bytes` (extract raw PID hex data), `parse_supported_pids(response: str) -> list[str]` (bitmask to hex PID list); all functions return `{supported: false}` dict on "NO DATA"
- [x] T009 Write unit tests for ELM327 parser in `desktop-agent/tests/test_elm_parser.py` — test: clean_raw_response with prompt/whitespace/SEARCHING, parse_vin with multi-frame response, parse_vin with NO DATA, parse_dtcs with P/B/C/U codes, parse_dtcs with no DTCs (0133 0000 0000), parse_clear_result success (44), parse_clear_result failure (7F 04 31), parse_pid_bytes with standard response, parse_pid_bytes with NO DATA, parse_supported_pids bitmask, partial/truncated data handling, `?` unsupported command handling

### WiFi ELM327 Adapter

- [x] T010 Implement `WifiElm327Adapter` in `desktop-agent/src/obd/wifi_elm327.py` — extends BaseAdapter; `connect()` opens WifiConnection + runs ELM327 init sequence (ATZ, ATE0, ATL0, ATS0, ATH0, ATSP0) with response validation; `is_connected()` checks TCP + ELM327 responsiveness; `send(command)` enforces inter-command delay, returns raw bytes; `close()` closes TCP connection; `adapter_type = "ELM327_WIFI"`; `protocol` set after ATSP0 auto-detect; retry connect 3x with 2s backoff
- [x] T011 Write unit tests for `WifiElm327Adapter` in `desktop-agent/tests/test_wifi_elm327_adapter.py` — mock WifiConnection to test: connect success with full init sequence, connect timeout with retry, ELM init step failure (ATS0 returns "?"), ATSP0 failure returns False, send command returns response, send when not connected raises RuntimeError, close, reconnection after disconnect

### Dynamic Heartbeat

- [x] T012 Update `heartbeat_loop` in `desktop-agent/src/heartbeat.py` — accept adapter instance instead of static boolean values; call `adapter.is_connected()` dynamically each beat; read `adapter.adapter_type` and `adapter.protocol` via `getattr`; send `connectionType` in heartbeat payload (derived from `adapter_type`: "MOCK" for MockObdAdapter, "WIFI" for WifiElm327Adapter, "USB" for Elm327Adapter)
- [x] T013 Update heartbeat startup in `desktop-agent/src/main.py` — pass adapter instance to `heartbeat_loop` instead of static `adapter.is_connected()`, `adapter.adapter_type`, `adapter.protocol` values

**Checkpoint**: WiFi TCP connection works, ELM327 responses are parseable, WiFi adapter can connect and initialize, heartbeat reports dynamic status with connection type.

---

## Phase 3: User Story 1 — Connect to Real Vehicle via WiFi Adapter (Priority: P1) 🎯 MVP

**Goal**: Technician configures WiFi adapter and sees "WiFi Adapter Connected" in the UI.

**Independent Test**: Start Desktop Agent with `OBD_ADAPTER_TYPE=wifi`. Verify agent reports "WiFi Adapter Connected" in the frontend. Disconnect adapter WiFi and verify status changes to "Disconnected."

### Implementation for User Story 1

- [x] T014 [US1] Update `MockObdAdapter` in `desktop-agent/src/obd/mock_adapter.py` — add `connect() -> bool` method (always returns True), add `adapter_type = "MOCK"` class attribute, add `protocol = "MOCK"` class attribute; ensure all existing mock tests continue passing
- [x] T015 [US1] Update `Elm327Adapter` in `desktop-agent/src/obd/elm327.py` — add `connect() -> bool` method (delegates to existing lazy-connect logic in `is_connected`), add `adapter_type = "ELM327"` class attribute, keep `protocol = "ISO_15765_4_CAN"`; ensure backward compatibility
- [x] T016 [US1] Update `AgentStatusResponseDto` in `backend/src/obd/dtos/agent-status-response.dto.ts` — add `adapterType?: string` and `connectionType?: string` fields from the latest `AdapterConnection` for the agent
- [x] T017 [US1] Update agent list endpoint in `backend/src/obd/controllers/agent-pairing.controller.ts` — include `adapterType` and `connectionType` from the active `AdapterConnection` in the `AgentStatusResponseDto` mapping
- [x] T018 [P] [US1] Update `AgentStatus` interface in `frontend/src/hooks/useAgentStatus.ts` — add `adapterType?: string` and `connectionType?: string` optional fields
- [x] T019 [P] [US1] Update `AgentStatusCard` in `frontend/src/components/obd/AgentStatusCard.tsx` — display adapter type label alongside existing "Adapter: Connected/Disconnected" text; show "Mock Adapter" when connectionType is MOCK, "WiFi Adapter" when WIFI, "USB Adapter" when USB; use distinct visual indicators (color or icon)
- [x] T020 [US1] Update `ScanControlPanel` in `frontend/src/components/obd/ScanControlPanel.tsx` — add adapter type to the adapter status area; show "Mock Adapter · Connected" or "WiFi Adapter · Connected" instead of just "Adapter connected"; show "WiFi Adapter · Disconnected" when adapter is offline

**Checkpoint**: Agent connects to real WiFi ELM327, heartbeat reports dynamic status, frontend shows "WiFi Adapter Connected" with type label. MVP milestone: adapter connects and status is visible.

---

## Phase 4: User Story 2 — Read Real Vehicle Identification (VIN) (Priority: P1)

**Goal**: Technician reads a real VIN from a real vehicle through the WiFi adapter.

**Independent Test**: Connect to a real vehicle. Trigger a VIN read. Verify the 17-character VIN matches the physical VIN plate.

### Implementation for User Story 2

- [x] T021 [US2] Update `read_vin` in `desktop-agent/src/obd/commands/vin.py` — use `elm_parser.clean_raw_response` and `elm_parser.parse_vin` for parsing when adapter is not mock; keep existing mock logic for MockObdAdapter; detect adapter type via `getattr(adapter, 'adapter_type', 'ELM327')`; handle NO DATA by returning `{"value": None, "supported": False}`
- [x] T022 [US2] Write test for real VIN parsing in `desktop-agent/tests/test_vin_real.py` — test `read_vin` with mock WifiElm327Adapter returning realistic ELM327 multi-frame VIN response (0902 command → "49 02 04 00 00 00 31 44 42..." hex); test NO DATA response; test truncated response handling

**Checkpoint**: Real VIN reads from a real vehicle through WiFi ELM327. This is the defining milestone of Feature 010.

---

## Phase 5: User Story 3 — Read Real Vehicle Health Data (Priority: P1)

**Goal**: Technician reads real PID values (RPM, voltage, engine load, etc.) from the vehicle ECU.

**Independent Test**: Connect to a running vehicle. Trigger vehicle data read. Verify at least RPM and battery voltage show real values.

### Implementation for User Story 3

- [ ] T023 [US3] Update `read_battery_voltage` in `desktop-agent/src/obd/commands/vehicle_data.py` — use `elm_parser.clean_raw_response` and `elm_parser.parse_pid_bytes` for real adapter responses; keep mock logic for MockObdAdapter; handle NO DATA → `{"value": None, "unit": "V", "supported": False}`
- [ ] T024 [P] [US3] Update `read_fuel_system_status` in `desktop-agent/src/obd/commands/vehicle_data.py` — use elm_parser for real responses; handle NO DATA → `{"value": None, "supported": False}`
- [ ] T025 [P] [US3] Update `read_engine_load` in `desktop-agent/src/obd/commands/vehicle_data.py` — use elm_parser for real responses; handle NO DATA
- [ ] T026 [P] [US3] Update `read_fuel_level` in `desktop-agent/src/obd/commands/vehicle_data.py` — use elm_parser for real responses; handle NO DATA
- [ ] T027 [US3] Update `read_readiness_monitors` in `desktop-agent/src/obd/commands/vehicle_data.py` — use elm_parser for real responses; decode bitmask for 11 standard monitors from real hex data
- [ ] T028 [US3] Update `read_supported_pids` in `desktop-agent/src/obd/commands/vehicle_data.py` — use `elm_parser.parse_supported_pids` for real adapter bitmask responses; query PIDs 0100/0120/0140/0160/0180/01A0 sequentially with 100ms delay; handle NO DATA for each mask query
- [ ] T029 [P] [US3] Update `read_mileage` in `desktop-agent/src/obd/commands/vehicle_data.py` — use elm_parser for real responses; handle NO DATA gracefully (mileage commonly unsupported)
- [ ] T030 [US3] Write test for real PID parsing in `desktop-agent/tests/test_vehicle_data_real.py` — test each PID reader with mock WifiElm327Adapter returning realistic ELM327 hex responses; test NO DATA handling for each PID; test inter-command delay enforcement

**Checkpoint**: Real vehicle health data reads through WiFi adapter. RPM, battery voltage, and other PIDs show real values. Unsupported PIDs show "Not supported by vehicle / adapter."

---

## Phase 6: User Story 4 — Read and Clear Real Fault Codes (Priority: P2)

**Goal**: Technician scans for real DTCs and clears them through the WiFi adapter.

**Independent Test**: Connect to a vehicle with known DTCs. Scan and verify codes. Clear codes and verify success/failure.

### Implementation for User Story 4

- [ ] T031 [US4] Update `read_fault_codes` in `desktop-agent/src/obd/commands/dtc.py` — use `elm_parser.parse_dtcs` for real adapter Mode 03 responses; handle multi-ECU responses (multiple "43" lines); keep mock logic for MockObdAdapter; handle NO DATA → empty DTC list
- [ ] T032 [US4] Update `clear_dtc` in `desktop-agent/src/obd/commands/clear_dtc.py` — use `elm_parser.parse_clear_result` for real adapter Mode 04 responses; handle 44 success, 7F failure, NO DATA, timeout; keep mock logic for MockObdAdapter
- [ ] T033 [US4] Write test for real DTC parsing in `desktop-agent/tests/test_dtc_real.py` — test Mode 03 response with multiple DTC codes, test empty DTC response, test Mode 04 success (44), test Mode 04 failure (7F 04 31), test NO DATA for both modes

**Checkpoint**: Real DTC scan and clear work through WiFi adapter. Fault codes match what a handheld scanner shows.

---

## Phase 7: User Story 5 — Stream Real Live Data (Priority: P2)

**Goal**: Technician sees real PID values streaming in near-real-time on the live data panel.

**Independent Test**: Connect to a running vehicle. Start live data for RPM and speed. Verify values update in real-time.

### Implementation for User Story 5

- [ ] T034 [US5] Update `LiveDataPoller` in `desktop-agent/src/live_data/poller.py` — add real-data polling path: when `adapter.adapter_type != "MOCK"`, send real PID commands via `adapter.send()` for each subscribed PID at the configured interval; use `elm_parser` to decode responses; keep `MockLiveDataGenerator` as fallback for mock adapter; inject adapter instance into poller constructor
- [ ] T035 [US5] Update `LiveDataPoller` creation in `desktop-agent/src/main.py` — pass adapter instance to `LiveDataPoller` constructor so it can use real-data path
- [ ] T036 [US5] Write test for real live data polling in `desktop-agent/tests/test_live_data_real.py` — test poller sends real PID commands when adapter_type is not MOCK; test poller uses MockLiveDataGenerator when adapter_type is MOCK; test adapter disconnect stops polling; test inter-command delay between PID reads

**Checkpoint**: Live data streams real PID values from the vehicle through WiFi adapter.

---

## Phase 8: User Story 6 — View Adapter Type in UI (Priority: P2)

**Goal**: Frontend clearly shows adapter type (Mock/WiFi/USB) and connection status.

**Independent Test**: Switch between mock and WiFi modes. Verify UI shows correct adapter type labels.

### Implementation for User Story 6

- [ ] T037 [US6] Update `useAdapterStatus` hook in `frontend/src/hooks/useAdapterStatus.ts` — expose `adapterType` and `connectionType` from the agent status response; add `adapterLabel` computed property ("Mock Adapter", "WiFi Adapter", "USB Adapter") derived from `connectionType`
- [ ] T038 [US6] Update `ObdReadinessPanel` in `frontend/src/components/obd/ObdReadinessPanel.tsx` — show adapter type in step 3 of the readiness checklist; change "Adapter connected" to "WiFi Adapter connected" or "Mock Adapter" as appropriate
- [ ] T039 [US6] Verify adapter type display across all adapter-status components — `VehicleHealthPanel`, `ScanControlPanel`, `AgentStatusCard`, `ObdReadinessPanel`; ensure consistent labeling

**Checkpoint**: All frontend components consistently show adapter type (Mock/WiFi/USB) alongside connection status.

---

## Phase 9: Tests (Cross-Cutting)

**Purpose**: Comprehensive test coverage for WiFi adapter connection, ELM327 parsing, and real-data flows.

### Desktop Agent Tests

- [ ] T040 [P] Write integration test for WiFi adapter connect/reconnect in `desktop-agent/tests/test_wifi_adapter_connect.py` — test full connect cycle (TCP open → ELM init → connected), test reconnection after TCP drop, test 3x retry on connect failure, test adapter disconnected after close
- [ ] T041 [P] Write test for ELM327 NO DATA and error handling in `desktop-agent/tests/test_elm_error_handling.py` — test NO DATA returns `{supported: false}`, test "?" returns error dict, test STOPPED triggers reconnect, test timeout raises TimeoutError, test partial hex returns error dict
- [ ] T042 [P] Write test for inter-command delay enforcement in `desktop-agent/tests/test_inter_command_delay.py` — verify 100ms minimum delay between consecutive `WifiConnection.write()` calls, verify delay is enforced even when commands are sent rapidly

### Regression Tests

- [ ] T043 Verify all existing mock adapter tests pass — run full `desktop-agent/tests/` suite with `OBD_ADAPTER_TYPE=mock` to confirm no regressions from BaseAdapter interface changes or parser refactoring

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Manual smoke test validation, edge case handling, and documentation.

- [ ] T044 [P] Run quickstart.md validation — follow the 10-step manual smoke test procedure in `specs/010-elm327-wifi-adapter/quickstart.md` against a real WiFi ELM327 adapter and vehicle
- [ ] T045 [P] Verify mock-mode backward compatibility — set `OBD_ADAPTER_TYPE=mock`, run full scan + vehicle health + live data + DTC clear flows, confirm all existing functionality works unchanged
- [ ] T046 Verify WiFi adapter disconnection detection and reconnection — with a real adapter: disconnect WiFi mid-session, verify agent detects disconnection, verify reconnection succeeds when WiFi is restored, verify heartbeat reports correct status throughout
- [ ] T047 [P] Add ELM327 command/response logging in `desktop-agent/src/obd/wifi_elm327.py` — log all AT commands and OBD commands with timestamps to assist field debugging; use Python `logging` module at DEBUG level; include command hex, response hex, and elapsed time

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001–T005) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — adapter connection + UI status display
- **US2 (Phase 4)**: Depends on Foundational + US1 (needs connected adapter) — VIN read
- **US3 (Phase 5)**: Depends on Foundational + US1 — vehicle health PIDs
- **US4 (Phase 6)**: Depends on Foundational + US1 — DTC scan/clear
- **US5 (Phase 7)**: Depends on Foundational + US1 + US3 (needs real PID reads) — live data streaming
- **US6 (Phase 8)**: Depends on US1 (T016–T020) — adapter type UI display
- **Tests (Phase 9)**: Depends on US1–US6 completion
- **Polish (Phase 10)**: Depends on all stories complete

### User Story Dependencies

```
Phase 1: Setup (config + BaseAdapter + factory + heartbeat DTO)
    ↓
Phase 2: Foundational (WifiConnection + elm_parser + WifiElm327Adapter + dynamic heartbeat)
    ↓
    ├── Phase 3: US1 (Connect + UI status display) ← MVP milestone
    ├── Phase 4: US2 (VIN read) ← depends on US1 (connected adapter)
    ├── Phase 5: US3 (Vehicle health PIDs) ← depends on US1
    ├── Phase 6: US4 (DTC scan/clear) ← depends on US1
    ├── Phase 7: US5 (Live data streaming) ← depends on US1 + US3
    └── Phase 8: US6 (Adapter type UI) ← depends on US1
    ↓
Phase 9: Tests (WiFi connection + parser + delay + regression)
    ↓
Phase 10: Polish (smoke test + backward compat + disconnect + logging)
```

### Within Each User Story

- Connection/transport before adapter
- Parser before command modules
- Backend DTO changes before frontend hook changes
- Frontend hooks before components
- Core implementation before edge cases

### Parallel Opportunities

- T004, T005 (backend heartbeat DTO + service) can run in parallel
- T006, T008 (WifiConnection + elm_parser) can run in parallel (different files)
- T007, T009 (connection tests + parser tests) can run in parallel
- T018, T019 (frontend hook + component updates) can run in parallel
- T023–T029 (vehicle_data.py PID updates) can run sequentially in the same file
- T040, T041, T042 (Phase 9 tests) can run in parallel (different test files)
- T044, T045, T047 (Phase 10 polish) can run in parallel

---

## Parallel Example: Phase 2 Foundational

```text
# WiFi connection + parser can launch together:
T006: "Implement WifiConnection in desktop-agent/src/obd/connection/wifi.py"
T008: "Implement elm_parser in desktop-agent/src/obd/commands/elm_parser.py"

# Tests for each can also run in parallel:
T007: "Write WifiConnection tests in desktop-agent/tests/test_wifi_connection.py"
T009: "Write elm_parser tests in desktop-agent/tests/test_elm_parser.py"

# WiFi adapter depends on both connection + parser:
T010: "Implement WifiElm327Adapter in desktop-agent/src/obd/wifi_elm327.py"
```

## Parallel Example: Phase 3 (US1)

```text
# Backend + frontend updates can run together:
T016: "Update AgentStatusResponseDto in backend/src/obd/dtos/"
T017: "Update agent list endpoint in backend/src/obd/controllers/"
T018: "Update AgentStatus interface in frontend/src/hooks/"
T019: "Update AgentStatusCard in frontend/src/components/obd/"
```

---

## Implementation Strategy

### MVP First (US1 — WiFi Connect + Status)

1. Complete Phase 1: Setup (config, BaseAdapter, factory, heartbeat DTO)
2. Complete Phase 2: Foundational (WifiConnection, parser, WifiElm327Adapter, dynamic heartbeat)
3. Complete Phase 3: US1 (Connect to real adapter + see status in UI)
4. **STOP and VALIDATE**: Test with real WiFi ELM327 — verify "WiFi Adapter Connected" appears
5. Deploy/demo if ready — adapter connectivity is a useful standalone increment

### Key Milestone (US2 — Real VIN)

1. Complete Phase 4: US2 (Read real VIN through WiFi adapter)
2. **STOP and VALIDATE**: Compare VIN from PrioraScan against physical VIN plate
3. This proves the entire stack works end-to-end

### Incremental Delivery (US3–US6)

1. Complete Phase 5: US3 (Real vehicle health PIDs)
2. Complete Phase 6: US4 (Real DTC scan/clear)
3. Complete Phase 7: US5 (Real live data streaming)
4. Complete Phase 8: US6 (Adapter type UI polish)
5. Deploy/demo — full feature complete

### Full Feature Delivery

1. Complete Phase 9: Tests (WiFi connection, parser, delay, regression)
2. Complete Phase 10: Polish (smoke test, backward compat, disconnect, logging)
3. Final validation and merge

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 (connect) + US2 (VIN) + US3 (health data) are P1 and form the MVP milestone
- US4 (DTC), US5 (live data), US6 (UI) are P2 incremental improvements
- **Desktop Agent tasks are first-class** — WifiConnection and elm_parser are foundational because the real-data user stories cannot work without them
- No database schema changes — AdapterConnection.connectionType is VarChar(20), 'WIFI' stores natively
- Mock adapter must remain fully functional at every checkpoint — regression tests at T043
- The key milestone: read real RPM or VIN from a real vehicle through WiFi ELM327 (US2)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently