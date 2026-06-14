# Feature Specification: Readiness Monitors

**Feature Branch**: `016-readiness-monitors`

**Created**: 2026-06-14

**Status**: Draft

**Input**: PrioraScan currently supports real WiFi ELM327 communication, Vehicle Health live data, VIN handling, DTC reading, and DTC clearing. The next diagnostic capability is OBD-II Readiness Monitors. The system must read and display vehicle emissions readiness status using Mode 01 PID 01, working with mock adapter profiles, real ELM327 adapters, and real vehicle communication. The implementation must follow the existing desktop-agent architecture and maintain mock/real parser consistency.

## Pre-Implementation Probe

Before implementation or during Phase 0 research, run a real adapter probe:

**Command**: `0101`

Capture the raw response from the Toyota vehicle. Expected response types:

- Valid response, e.g. `41010007FF07EF`
- `NO DATA`
- Empty response
- Malformed response

The captured Toyota response must be documented in `research.md` and used as a regression test where possible.

## User Scenarios & Testing

### User Story 1 — Read Emissions Readiness Status (Priority: P1)

A technician connects to a vehicle and requests readiness monitor status. The system sends Mode 01 PID 01 to the ECU, decodes the response, and displays: whether the Malfunction Indicator Lamp (MIL) is on or off, the number of stored Diagnostic Trouble Codes, which emissions readiness monitors the vehicle supports, and which of those monitors have completed their self-tests. The technician uses this information to determine if the vehicle is ready for an emissions inspection.

**Why this priority**: Readiness monitors are the primary indicator of whether a vehicle will pass an emissions test. Without this, technicians cannot advise customers on inspection readiness. This is the fundamental diagnostic capability the feature delivers.

**Independent Test**: Can be fully tested by sending PID 0101 to a vehicle (or mock adapter) and verifying that the response correctly decodes MIL status, DTC count, and all monitor supported/complete states.

**Acceptance Scenarios**:

1. **Given** a vehicle supports Mode 01 PID 01 and returns response `41 01 00 07 FF 07 EF`, **When** readiness status is requested, **Then** the system displays: MIL OFF, zero stored DTCs, and monitors with their supported/complete states (e.g., catalyst supported and complete, oxygen sensor supported and not complete).
2. **Given** a vehicle supports Mode 01 PID 01 and returns response `41 01 81 07 FF 07 EF`, **When** readiness status is requested, **Then** the system displays: MIL ON, one stored DTC, and the monitor states decoded from bytes 3–6.
3. **Given** a vehicle supports Mode 01 PID 01 and returns a response with all monitor bits cleared, **When** readiness status is requested, **Then** the system displays each monitor as unsupported (supported: false, ready: null) or not ready (supported: true, ready: false) as appropriate.

---

### User Story 2 — Real Vehicle Readiness Read (Priority: P1)

A technician connects a real WiFi ELM327 adapter to a vehicle and triggers a readiness monitor read. The system communicates with the vehicle's ECU, receives the raw Mode 01 PID 01 response, and decodes it through the same parser used for mock responses. The decoded result includes MIL status, stored DTC count, and the full readiness monitor state.

**Why this priority**: Real vehicle communication is the production use case. Mock-only implementation is insufficient for a diagnostic tool — technicians must be able to read readiness from actual vehicles.

**Independent Test**: Can be fully tested by connecting a real WiFi ELM327 adapter to a vehicle, triggering a readiness read, and verifying the decoded result matches the vehicle's actual MIL state and monitor completion status.

**Acceptance Scenarios**:

1. **Given** a real WiFi ELM327 adapter connected to a vehicle, **When** readiness data is requested, **Then** PrioraScan reads Mode 01 PID 01 from the ECU and decodes the response into structured readiness data.
2. **Given** a real adapter and a vehicle that returns MIL ON with 2 stored DTCs, **When** readiness is read, **Then** the result includes `milStatus: "ON"`, `storedDtcCount: 2`, and decoded monitor states.
3. **Given** a real adapter and a vehicle that does not support PID 0101, **When** readiness is requested, **Then** the result indicates readiness monitors are unsupported and the read completes without crashing.

---

### User Story 3 — Mock Profile Support (Priority: P2)

A developer or QA tester uses mock adapter profiles to simulate readiness monitor reads without a physical vehicle. Mock profiles provide PID 0101 raw response bytes in `PID_RESPONSES`, and the shared readiness parser decodes them identically to real ECU responses. The same raw bytes produce the same decoded result regardless of adapter type.

**Why this priority**: Mock profiles are essential for automated testing and development without hardware. However, they follow the same parser path as real adapters, so the parser correctness is the higher priority.

**Independent Test**: Can be tested by loading each mock profile, requesting readiness, and verifying the decoded output matches expected values for that profile's 0101 response bytes.

**Acceptance Scenarios**:

1. **Given** a mock adapter with the `default` profile, **When** readiness is requested, **Then** the profile's PID 0101 raw response bytes (`PID_RESPONSES["0101"]`) are decoded through the shared readiness parser, producing the same result as a real ECU would for the same bytes.
2. **Given** a mock profile that does not include PID 0101 in `PID_RESPONSES` or lists it in `UNSUPPORTED_COMMANDS`, **When** readiness is requested, **Then** the readiness result indicates unsupported (`milStatus: "UNKNOWN"`, `storedDtcCount: null`, `monitors: []`).
3. **Given** the same raw PID 0101 response bytes, **When** decoded through the mock path and the real adapter path, **Then** the results are structurally identical (same keys, same value types, same interpretation).

---

### Edge Cases

- What happens when PID 0101 returns NO DATA? → The readiness result indicates unsupported (`milStatus: "UNKNOWN"`, `storedDtcCount: null`, `monitors: []`, `rawResponse: "NO DATA"`). The scan does not crash.
- What happens when the response is empty (zero bytes)? → Same as NO DATA — graceful degradation to unsupported result.
- What happens when the response has fewer than 6 bytes (invalid length)? → Parse as much as possible. MIL status and DTC count can be decoded from byte 0. Monitor availability and completion are decoded from whatever bytes are present. Missing bytes result in monitors being marked as unsupported (conservative default).
- What happens when the adapter is disconnected? → A transport error is raised, distinct from an unsupported PID. The readiness result reflects a connection error, not unsupported monitors.
- What happens when a vehicle reports zero readiness monitors? → All monitor bits are zero (unsupported). The result lists monitors with `supported: false`. This is valid — some vehicles may not support any continuous or non-continuous monitors.
- What happens when MIL is OFF but stored monitor history exists? → MIL OFF with completed monitors is a normal state (vehicle recently cleared codes and monitors are still running). The system displays MIL OFF with the actual monitor completion states as decoded.

## Requirements

### Functional Requirements

- **FR-001**: The desktop agent MUST support reading Mode 01 PID 01 (OBD-II Readiness Monitors) through the existing adapter interface (`adapter.send("0101")`). The existing `read_readiness_monitors()` function in `vehicle_data.py` MUST be refactored and strengthened — this feature does not create it from scratch.

- **FR-002**: The system MUST decode the first byte of the PID 0101 response to extract: MIL status (ON if bit 7 is set, OFF otherwise) and stored DTC count (bits 0–6 of the first byte). The current implementation does not extract MIL status or DTC count — this must be added.

- **FR-003**: The system MUST decode monitor availability and completion states from bytes 3–6 of the PID 0101 response (availability from bytes 5–6, completion from bytes 3–4 per SAE J1979 encoding, where each bit corresponds to one of the 11 standard readiness monitors).

- **FR-004**: The system MUST distinguish four monitor states: (1) supported and ready (`supported: true, ready: true`), (2) supported and not ready (`supported: true, ready: false`), (3) unsupported (`supported: false, ready: null`), and (4) the reserved/deprecated monitor status (represented as `supported: false, ready: null`).

- **FR-005**: Readiness results MUST be returned as structured data conforming to the `ReadinessResult` entity shape: `milStatus`, `storedDtcCount`, `monitors[]`, and `rawResponse`.

- **FR-006**: Unsupported readiness responses (NO DATA, empty response, invalid response length, or adapter errors) MUST NOT crash the scan. The system MUST return a graceful unsupported result with `milStatus: "UNKNOWN"`, `storedDtcCount: null`, `monitors: []`, and the raw response preserved for debugging.

- **FR-007**: Mock profiles MUST provide PID 0101 raw response bytes in `PID_RESPONSES` (e.g., `PID_RESPONSES["0101"] = bytes.fromhex("41010007FF07EF")`). The readiness parser MUST decode these raw bytes through the same shared parser path used for real ECU responses. Raw OBD bytes are the single source of truth — no duplicated decoded readiness state is stored in mock profiles.

- **FR-008**: The same readiness parser function MUST be used for both mock adapter responses and real ECU responses. Mock adapter responses go through `compact_raw_response()` and the shared parser, identical to real responses. The parser is the single point of decoding for both paths.

- **FR-009**: Readiness monitor reading MUST NOT require Redis, caching, or external persistence. Each read is a live query to the ECU (or mock adapter).

- **FR-010**: The system MUST preserve raw ECU response data in the `rawResponse` field of the `ReadinessResult` for debugging and verification purposes.

- **FR-011**: The 11 standard SAE J1979 readiness monitors MUST be decoded in this order with these names: `misfire`, `fuelSystem`, `components` (continuous monitors, bits from byte 5 and byte 3), and `catalyst`, `heatedCatalyst`, `evap`, `secondaryAir`, `acRefrigerant`, `oxygenSensor`, `oxygenSensorHeater`, `egrVvt` (non-continuous monitors, bits from bytes 5–6 for availability and bytes 3–4 for completion).

- **FR-012**: When PID 0101 is in the adapter's unsupported command set (mock profile `UNSUPPORTED_COMMANDS`) or returns NO DATA, the system MUST return `{"supported": False, "value": {}}` as the readiness result, consistent with other unsupported PID results in the vehicle health read flow.

- **FR-013**: The readiness result MUST be included in the `VEHICLE_DATA_READ` event payload under the `readinessMonitors` key, following the existing result shape convention established by vehicle health, DTC, and VIN reads.

- **FR-014**: The `read_readiness_monitors` function MUST be callable independently of the full vehicle health read flow, enabling readiness-only diagnostic checks.

- **FR-015**: The readiness parser MUST handle SAE J1979 bit ordering correctly: availability bits are in bytes 5–6 of the response (byte index 4–5 in zero-indexed, after the header bytes), and completion bits are in bytes 3–4 (byte index 2–3 in zero-indexed). Continuous monitor bits are in byte 5 for availability and byte 3 for completion. Non-continuous monitor bits span bytes 5–6 for availability and bytes 3–4 for completion.

- **FR-016**: The `READINESS_MONITORS` attribute on mock profiles MUST be removed or deprecated. It is not used by the readiness parser and is not needed. Raw OBD response bytes in `PID_RESPONSES` are the single source of truth for mock readiness data.

### Key Entities

- **ReadinessResult**: The top-level result of a readiness monitor read. Fields: `milStatus` (ON, OFF, or UNKNOWN), `storedDtcCount` (integer or null), `monitors` (list of `ReadinessMonitor`), `rawResponse` (string — the raw ECU response hex for debugging).

- **ReadinessMonitor**: A single readiness monitor entry. Fields: `name` (string — one of the 11 standard monitor names), `supported` (boolean — whether the vehicle declares this monitor), `ready` (boolean or null — whether the monitor has completed its self-test; null if unsupported).

- **MonitorState**: An enum-like distinction for monitor readiness. Values: `supported_and_ready` (supported: true, ready: true), `supported_and_not_ready` (supported: true, ready: false), `unsupported` (supported: false, ready: null). This is not a separate entity but a documented state convention.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All six mock profile readiness responses (`0101` PID data) decode successfully, producing valid `ReadinessResult` structures with correct MIL status, DTC count, and monitor states.

- **SC-002**: A real WiFi ELM327 adapter connected to a vehicle produces a valid `ReadinessResult` that correctly reflects the vehicle's MIL status and monitor completion states.

- **SC-003**: MIL ON/OFF state is decoded correctly from bit 7 of the first response byte across all test cases (MIL ON = bit 7 set, MIL OFF = bit 7 clear).

- **SC-004**: Stored DTC count is decoded correctly from bits 0–6 of the first response byte, matching the number of stored fault codes the vehicle reports.

- **SC-005**: All 11 standard readiness monitor states are decoded correctly — each monitor is classified as supported/ready, supported/not-ready, or unsupported, matching the SAE J1979 bit assignments.

- **SC-006**: Mock and real adapters produce identical parser behavior: the same raw PID 0101 response bytes produce the same `ReadinessResult` regardless of adapter type.

- **SC-007**: All existing desktop-agent tests pass without modification — no regressions in vehicle health, DTC, VIN, or clear-code functionality.

- **SC-008**: The feature works without Redis, external caches, or additional databases. Readiness is a live read with no persistence requirements.

- **SC-009**: The same Toyota real vehicle used for Feature 013 must be tested with Mode 01 PID 01. The test must capture: raw 0101 response, decoded MIL status, decoded stored DTC count, and decoded readiness monitor states. If Toyota returns NO DATA, the feature must handle it gracefully as unsupported and this result must be documented as the real Toyota regression behavior.

## Assumptions

- The `read_readiness_monitors()` function already exists in `vehicle_data.py` (line 314) and is called from `execute_vehicle_data_read()` in `main.py` (line 136). This feature **refactors and strengthens** the existing function — it does not create it from scratch. The current implementation decodes monitor availability/completion but does NOT extract MIL status or DTC count. This feature adds MIL/DTC count extraction, strengthens edge case handling, and improves the result shape.
- The existing `compact_raw_response()` and `is_adapter_error_response()` functions in `elm_parser.py` are used for both mock and real paths. The readiness parser will follow the same pattern.
- The 11 standard SAE J1979 readiness monitors are the only monitors decoded. OEM-specific or manufacturer-specific monitors beyond the standard 11 are out of scope.
- Mock profiles store PID 0101 raw response bytes in `PID_RESPONSES` (e.g., `PID_RESPONSES["0101"] = bytes.fromhex("41010007FF07EF")`). Raw OBD bytes are the single source of truth. The `READINESS_MONITORS` attribute on mock profiles currently exists but is `None` in all profiles and is not used by the readiness parser. This feature will remove or deprecate the `READINESS_MONITORS` attribute — no decoded readiness state will be duplicated in mock profiles.
- PID 0101 is already included in all mock profile `PID_RESPONSES` dicts (value: `bytes.fromhex("41010007FF07EF")`). The readiness parser must decode this correctly.
- The readiness result shape is already part of the `VEHICLE_DATA_READ` event payload under `readinessMonitors`. This feature ensures the data is correctly structured and complete, adding `milStatus`, `storedDtcCount`, and `rawResponse` fields.
- The existing mock adapter `send()` method already handles PID 0101 via the `PID_RESPONSES` dict lookup path. No changes to the adapter dispatch logic are needed.
- Bit ordering follows SAE J1979: the first byte after the header (41 01) contains MIL and DTC count, bytes 3–4 contain completion status, and bytes 5–6 contain availability/support status. The continuous monitors (bits 0–2) and non-continuous monitors (bits 3–7) follow the standard encoding.
- The current `read_readiness_monitors()` function uses `complete` as the monitor state field name. This feature updates it to `ready` to match the `ReadinessMonitor` entity definition and the domain terminology (readiness = ready/not ready).

## Scope Boundaries

### In Scope

- Reading and decoding Mode 01 PID 01 readiness monitor data
- Parsing MIL status, stored DTC count, and 11 standard monitor availability/completion states
- Refactoring and strengthening the existing `read_readiness_monitors()` function (not creating from scratch)
- Extracting a shared `parse_readiness_monitors()` parser function from the existing implementation
- Removing or deprecating the `READINESS_MONITORS` attribute on mock profiles (raw OBD bytes are the single source of truth)
- Ensuring mock and real adapters produce identical decoded output for the same raw bytes
- Graceful handling of unsupported, empty, NO DATA, and invalid-length responses
- Including readiness data in the `VEHICLE_DATA_READ` event payload
- Preserving raw ECU response data for debugging
- Real Toyota vehicle validation with PID 0101 capture

### Optional Additive Work (may be included or deferred)

- Backend result payload extension (new fields in vehicle data response)
- Frontend readiness monitor display — the feature is primarily complete when the agent/backend result shape is correct, but frontend display may be included if low-risk

### Out of Scope

- ECU Discovery
- UDS Readiness
- OEM-specific readiness monitors beyond the 11 SAE J1979 standard monitors
- Emissions test prediction or pass/fail determination
- Health scoring or readiness-based health assessment
- Freeze Frame Data
- PDF reports
- Persistent storage of readiness results
- Redis, caching, or external databases