# Feature Specification: Real ELM327 WiFi Adapter Integration

**Feature Branch**: `010-elm327-wifi-adapter`

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Upgrade the Desktop Agent to connect to a real ELM327 WiFi adapter and read real vehicle data. Implement WiFi ELM327 only. Bluetooth is out of scope."

## User Scenarios & Testing

### User Story 1 — Connect to Real Vehicle via WiFi Adapter (Priority: P1) 🎯 MVP

A technician configures the Desktop Agent to connect to a WiFi ELM327 adapter plugged into a vehicle's OBD-II port. After starting the agent, it establishes a TCP connection to the adapter, initializes the ELM327 chip, and confirms the connection is live. The adapter status changes from "Mock Adapter" or "Disconnected" to "WiFi Adapter Connected."

**Why this priority**: Without a live connection to a real adapter, all other real-data user stories are impossible. This is the foundational milestone — if the agent cannot connect to the ELM327 over WiFi, nothing else works.

**Independent Test**: Start the Desktop Agent with WiFi adapter environment variables set. Verify the agent reports "WiFi Adapter Connected" in the frontend. Disconnect the adapter WiFi and verify the status changes to "WiFi Adapter Disconnected." Reconnect and verify status returns to connected.

**Acceptance Scenarios**:

1. **Given** a WiFi ELM327 adapter is powered and connected to the vehicle, **When** the Desktop Agent starts with WiFi adapter settings, **Then** the agent connects via TCP, completes the ELM327 initialization sequence, and reports adapter status as connected.
2. **Given** the adapter WiFi network is unavailable, **When** the Desktop Agent attempts to connect, **Then** the agent retries with backoff, reports "WiFi Adapter Disconnected," and does not crash.
3. **Given** the adapter is connected and the connection drops mid-session, **When** the agent detects the disconnection, **Then** it reports "Adapter Error," attempts reconnection, and logs the event.
4. **Given** the agent is running with mock mode, **When** the user checks adapter status, **Then** the UI clearly shows "Mock Adapter" instead of "WiFi Adapter Connected."

---

### User Story 2 — Read Real Vehicle Identification (VIN) (Priority: P1)

After establishing a WiFi connection to the ELM327, the technician triggers a VIN read. The agent sends the `0902` command to the real ECU, receives the raw hex response, parses it, and returns the 17-character VIN. The VIN is displayed in the session UI.

**Why this priority**: Reading a real VIN from a real vehicle is the defining milestone of this feature — it proves the entire stack (TCP connection → ELM327 → ECU → response → parse → display) works end-to-end.

**Independent Test**: Connect to a real vehicle. Trigger a VIN read from the OBD Dashboard. Verify the 17-character VIN appears in the session. Compare against the physical VIN plate on the vehicle.

**Acceptance Scenarios**:

1. **Given** the WiFi adapter is connected to a vehicle, **When** a VIN read is triggered, **Then** the agent sends `0902`, receives the ECU response, parses it, and returns a valid 17-character VIN.
2. **Given** the vehicle does not support Mode 09, **When** a VIN read is triggered, **Then** the agent returns "NO DATA" gracefully without crashing, and the UI shows "Not supported by vehicle / adapter."
3. **Given** the adapter disconnects during the VIN read, **When** the command times out, **Then** the agent logs the failure and returns an error result rather than hanging.

---

### User Story 3 — Read Real Vehicle Health Data (Priority: P1)

After connecting, the technician triggers a vehicle data read from the session detail page. The agent reads real PID values (RPM, vehicle speed, coolant temperature, battery voltage, engine load, fuel level, readiness monitors) from the vehicle ECU. Values that are not supported by the vehicle show "Not supported by vehicle / adapter."

**Why this priority**: Vehicle health reads are the primary diagnostic use case for technicians. This story demonstrates that the real-adapter path works for the Feature 009 vehicle data flow, not just VIN.

**Independent Test**: Connect to a running vehicle. Trigger a vehicle data read. Verify at least RPM and battery voltage show real values. Verify unsupported PIDs show the "Not supported" fallback.

**Acceptance Scenarios**:

1. **Given** the WiFi adapter is connected and the engine is running, **When** a vehicle data read is triggered, **Then** the agent reads real PID values and returns them with correct units (RPM, V, °C, %, km/h).
2. **Given** the vehicle does not support a particular PID (e.g., fuel level), **When** the agent queries that PID, **Then** it returns `{ supported: false }` rather than an error.
3. **Given** the vehicle supports supported-PID bitmask queries, **When** the agent queries PIDs 0100/0120/0140, **Then** it returns an accurate list of supported PIDs.

---

### User Story 4 — Read and Clear Real Fault Codes (Priority: P2)

After connecting, the technician scans for fault codes. Real DTCs are retrieved from the ECU and displayed. After repair, the technician clears the codes via the existing confirmation modal. The clear command is sent through the real ELM327, and the result (success/failure) is reported.

**Why this priority**: DTC operations are the core diagnostic workflow. Clearing real codes through the real adapter proves the full command-response loop works for Mode 03 and Mode 04.

**Independent Test**: Connect to a vehicle with known fault codes. Scan for codes and verify they match what a handheld scanner shows. Clear the codes after repair and verify success.

**Acceptance Scenarios**:

1. **Given** the WiFi adapter is connected and the vehicle has stored DTCs, **When** a DTC scan is triggered, **Then** the agent sends Mode 03, parses the hex response into fault codes (e.g., P0301, P0420), and returns them.
2. **Given** the vehicle has no stored DTCs, **When** a DTC scan is triggered, **Then** the agent returns an empty list.
3. **Given** the vehicle has DTCs and the technician confirms the clear action, **When** the clear command is sent, **Then** the agent sends Mode 04, receives the ECU response, and reports success or failure with reason.
4. **Given** the ECU rejects the clear command, **When** the response is `7F 04 31`, **Then** the agent reports failure with reason "ECU rejected clear command."

---

### User Story 5 — Stream Real Live Data (Priority: P2)

After connecting, the technician starts a live data session. The agent polls real PIDs from the vehicle at a configurable interval and streams the decoded values back to the frontend, replacing the mock live data generator with real ECU reads.

**Why this priority**: Live data is essential for monitoring engine parameters in real time. However, it depends on a stable connection and PID support, making it P2 after one-shot reads are proven.

**Independent Test**: Connect to a running vehicle. Start a live data session for RPM and vehicle speed. Verify the values update in near-real-time and match dashboard readings.

**Acceptance Scenarios**:

1. **Given** the WiFi adapter is connected and the engine is running, **When** a live data session is started for RPM (010C) and speed (010D), **Then** the agent polls these PIDs every interval and returns decoded values.
2. **Given** the live data session is running, **When** the adapter disconnects, **Then** the agent stops polling, reports the disconnection, and does not continue sending stale data.
3. **Given** the live data session is stopped, **When** the stop command is received, **Then** the agent ceases polling immediately.

---

### User Story 6 — View Adapter Type in UI (Priority: P2)

The technician can see which adapter type is active: "Mock Adapter," "WiFi Adapter Connected," "WiFi Adapter Disconnected," or "Adapter Error." This replaces the current binary connected/disconnected indicator with more informative status.

**Why this priority**: Adapter type visibility helps technicians and developers quickly verify they are using the correct adapter mode (mock for development, WiFi for production).

**Independent Test**: Start the agent in mock mode and verify "Mock Adapter" appears. Switch to WiFi mode with a connected adapter and verify "WiFi Adapter Connected" appears. Disconnect the adapter and verify "WiFi Adapter Disconnected" appears.

**Acceptance Scenarios**:

1. **Given** the agent is running in mock mode, **When** the OBD Dashboard loads, **Then** the adapter status area shows "Mock Adapter" with a distinct visual indicator.
2. **Given** the agent is running with WiFi mode and the adapter is connected, **When** the OBD Dashboard loads, **Then** the adapter status area shows "WiFi Adapter Connected" with a green indicator.
3. **Given** the agent is running with WiFi mode and the adapter is disconnected, **When** the OBD Dashboard loads, **Then** the adapter status area shows "WiFi Adapter Disconnected" with a red indicator.

---

### Edge Cases

- Adapter WiFi network disappears mid-connection — agent must detect disconnection, report error, and attempt reconnection
- ELM327 returns "SEARCHING..." for a slow ECU response — agent must wait with a longer timeout rather than treating it as NO DATA
- ELM327 returns "?" for an unsupported AT command — agent must log and skip that initialization step
- ELM327 returns "NO DATA" for a PID the vehicle doesn't support — agent must return `{ supported: false }` rather than an error
- Multiple rapid VIN/DTC/PID requests overwhelm the ELM327 — agent must enforce minimum inter-command delay (100ms)
- ECU returns multi-frame response for Mode 09 VIN — parser must handle multi-line ELM327 output
- Vehicle ignition is off — adapter may connect but commands return NO DATA; agent must handle gracefully
- TCP connection refused (wrong IP/port) — agent must report "Adapter Error" without crashing
- Partial hex response (truncated) — parser must detect and reject incomplete data
- WiFi adapter changes IP after reconnection — agent must use configured host, not cached IP

## Requirements

### Functional Requirements

- **FR-001**: System MUST support a WiFi ELM327 adapter that connects over TCP to a configurable host and port.
- **FR-002**: System MUST perform the ELM327 initialization sequence (ATZ, ATE0, ATL0, ATS0, ATH0, ATSP0) on connection, validating each response.
- **FR-003**: System MUST handle all standard ELM327 response types: OK, SEARCHING..., NO DATA, ?, STOPPED, and timeout.
- **FR-004**: System MUST read a real VIN from the vehicle using Mode 09 PID 02 and parse the 17-character result.
- **FR-005**: System MUST read real DTCs from the vehicle using Mode 03 and parse the hex response into standard DTC codes (P0xxx, B0xxx, C0xxx, U0xxx).
- **FR-006**: System MUST send Mode 04 clear DTC commands to the real ECU and report success or failure based on the response.
- **FR-007**: System MUST read real PID values for the following: RPM (010C), Vehicle Speed (010D), Coolant Temperature (0105), Control Module Voltage (0142), Engine Load (0104), Fuel Level (012F), Readiness Monitors (0101), and Supported PID masks (0100/0120/0140/0160/0180/01A0).
- **FR-008**: System MUST parse ELM327 raw hex responses into structured data (VIN string, DTC code list, PID value with unit, supported PID bitmask).
- **FR-009**: System MUST return `{ supported: false }` for PIDs where the ECU returns NO DATA, rather than raising an error.
- **FR-010**: System MUST detect TCP disconnection and report "Adapter Error" without crashing the agent process.
- **FR-011**: System MUST attempt automatic reconnection after a disconnection with exponential backoff.
- **FR-012**: System MUST enforce a minimum inter-command delay of 100ms between ELM327 commands to avoid overwhelming the adapter.
- **FR-013**: System MUST keep the existing MockObdAdapter fully functional — all existing mock tests must continue passing.
- **FR-014**: System MUST display adapter type (Mock/WiFi) and connection status in the OBD Dashboard UI.
- **FR-015**: System MUST NOT send Mode 04 (clear DTC) unless the backend explicitly sends the CLEAR_DTC command — no automatic or accidental clearing.
- **FR-016**: System MUST log all ELM327 commands and responses for debugging.
- **FR-017**: System MUST support configuration via environment variables: OBD_ADAPTER_TYPE (mock|wifi), OBD_WIFI_HOST, OBD_WIFI_PORT, OBD_WIFI_TIMEOUT_SECONDS.
- **FR-018**: System MUST preserve existing backend API contracts — no new database tables or schema changes are required.

### Key Entities

- **ObdAdapter**: Interface defining the adapter contract (connect, disconnect, is_connected, send_command, read_vin, read_dtcs, clear_dtcs, read_pid, get_supported_pids). Both MockObdAdapter and WifiElm327Adapter implement this interface.
- **WifiConnection**: TCP connection to a WiFi ELM327 adapter, with configurable host, port, and timeout. Manages the socket lifecycle (open, read, write, close).
- **ElmResponse**: Parsed ELM327 response with status (OK, DATA, NO_DATA, ERROR, SEARCHING) and raw bytes payload.
- **AdapterConfig**: Configuration for the adapter type and WiFi connection settings, derived from environment variables.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A technician can connect to a real WiFi ELM327 adapter and see "WiFi Adapter Connected" in the UI within 10 seconds of agent startup.
- **SC-002**: A technician can read a real VIN from a real vehicle through the WiFi adapter, and the displayed VIN matches the physical VIN plate exactly.
- **SC-003**: A technician can read real RPM from a running vehicle, and the displayed value is within 5% of a handheld OBD scanner reading.
- **SC-004**: A technician can scan for real DTCs and clear them, with the clear result (success/failure) appearing within 60 seconds of the confirmation.
- **SC-005**: When the adapter disconnects, the status updates in the UI within 30 seconds and the agent does not crash.
- **SC-006**: All existing mock-adapter tests continue to pass without modification.
- **SC-007**: The agent can stream at least 2 live PIDs (RPM, vehicle speed) with updates at least every 2 seconds for 60 continuous seconds without disconnection.
- **SC-008**: A manual smoke test procedure documents how to verify all of the above against a real vehicle.

## Assumptions

- The WiFi ELM327 adapter uses the standard OBD-II WiFi protocol (TCP on port 35000 by default, IP 192.168.0.10). This is the de facto standard for consumer WiFi OBD adapters.
- The existing USB ELM327 adapter support (`Elm327Adapter` with `UsbConnection`) will remain but is not the focus of this feature. The WiFi adapter is a new connection type, not a replacement.
- The ELM327 chip follows the standard AT command set documented in the ELM327 datasheet. Manufacturer-specific extensions are out of scope.
- The Desktop Agent runs on a laptop connected to the ELM327's WiFi access point. Network routing and WiFi configuration are the user's responsibility.
- The existing `LiveDataPoller` bypasses the adapter (uses `MockLiveDataGenerator`). This feature must add a real-data poller path for live data, but the mock generator remains as fallback.
- The backend does not need schema changes — adapter type information is already available from the DesktopAgent model. Frontend changes are limited to surfacing the existing `adapterType` and `adapterProtocol` fields.
- Bluetooth adapter support is explicitly out of scope for this feature.
- The minimum inter-command delay (100ms) is based on standard ELM327 timing requirements per the datasheet.