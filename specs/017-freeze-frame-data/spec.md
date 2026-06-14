# Feature Specification: Freeze Frame Data

**Feature Branch**: `017-freeze-frame-data`

**Created**: 2026-06-14

**Status**: Draft

**Input**: PrioraScan currently supports Vehicle Health, VIN Handling, DTC Reading, DTC Clear, and Readiness Monitors. The next diagnostic capability is OBD-II Freeze Frame Data. Freeze Frame allows technicians to view the operating conditions that existed when a diagnostic trouble code was first recorded. The implementation must support mock adapters, real ELM327 adapters, and real vehicle communication. Mock Path must equal Real Path. Raw OBD responses remain the single source of truth.

## Pre-Implementation Probe

Before implementation or during Phase 0 research, run a real adapter probe against the Toyota vehicle.

**Command**: `0201`

Capture the following from the Toyota vehicle:

- Raw adapter response (exactly as received from ELM327)
- Cleaned response (after `compact_raw_response()` processing)
- Whether freeze frame data exists
- Whether the ECU reports NO DATA
- Whether the ECU reports an unsupported response

Expected response types:

- Valid response with DTC and PID values, e.g. `42 01 01 01 0C 1A 98 0D 48 04 3A 05 47 ...`
- `NO DATA`
- Empty response
- Malformed response
- Valid empty response (e.g., DTC bytes zeroed out, no PID pairs)
- Unsupported response

**Research Validation Gate**: Implementation tasks MUST NOT begin until the following questions are answered and documented in `research.md`:

1. What does the Toyota vehicle return for `0201`?
2. What does the Toyota vehicle return when no freeze frame exists?
3. Is NO DATA considered unsupported or simply no stored snapshot for this ECU?
4. Does the current ELM327 adapter require any special handling for Mode 02 responses?

All findings must be documented in `specs/017-freeze-frame-data/research.md`. A regression test must be created using the captured Toyota response where possible. If Toyota returns NO DATA, treat it as a valid regression result — document the behavior and do not block implementation.

> **Research Note**: Real ECU freeze frame behavior must be validated before parser assumptions are finalized. Do not assume every ECU exposes freeze frame through 0201 in the same way.

## User Scenarios & Testing

### User Story 1 — Freeze Frame Available (Priority: P1)

A technician connects to a vehicle that has a stored DTC with available freeze frame data. The system sends Mode 02 PID 01 to the ECU, decodes the response, and displays the DTC code that triggered the freeze frame along with the operating conditions at the time the fault occurred — including engine RPM, vehicle speed, engine load, and coolant temperature. The technician uses this snapshot to understand what the vehicle was doing when the fault was recorded.

**Why this priority**: Freeze frame data is the primary diagnostic context for understanding fault conditions. Without it, technicians must guess the operating conditions at the time of the fault. This is the fundamental capability the feature delivers.

**Independent Test**: Can be fully tested by sending PID 0201 to a vehicle (or mock adapter) that has stored DTCs, and verifying that the response correctly decodes the DTC code, RPM, speed, engine load, coolant temperature, and other supported PID values.

**Acceptance Scenarios**:

1. **Given** a vehicle with a stored DTC (e.g., P0301) and available freeze frame data, **When** freeze frame is requested, **Then** the system returns a structured result with `supported: true`, `available: true`, the DTC code `P0301`, and decoded operating conditions including `rpm`, `speed`, `coolantTemperature`, `engineLoad`, and `rawResponse`.
2. **Given** a vehicle with a stored DTC and freeze frame data containing RPM = 2450, vehicle speed = 72 km/h, engine load = 58%, and coolant temperature = 91°C, **When** freeze frame is requested, **Then** the system decodes and returns `rpm: 2450`, `speed: 72`, `engineLoad: 58`, `coolantTemperature: 91` in the result.
3. **Given** a vehicle with a stored DTC and freeze frame data that includes additional PIDs beyond the four MVP PIDs (e.g., intake air temperature, fuel pressure), **When** freeze frame is requested, **Then** the system decodes the four MVP PIDs and may preserve unknown PIDs in raw form under `additionalPids` without mandatory decoding.

---

### User Story 2 — No Freeze Frame Available (Priority: P1)

A technician connects to a vehicle that has no stored freeze frame data — either because there are no active DTCs, the freeze frame has been cleared, or the vehicle reports no stored snapshot. The system returns a graceful result that correctly represents the ECU response, without throwing an exception or breaking the scan workflow.

**Why this priority**: Graceful degradation is essential for production reliability. Technicians frequently encounter vehicles with no stored freeze frames, and the system must handle this as a normal diagnostic outcome rather than an error condition.

**Independent Test**: Can be tested by requesting freeze frame from a vehicle or mock profile with no stored DTCs, and verifying the result correctly represents the ECU behavior without any exception.

> **Desired state model**: `{ supported: true, available: false }` is the desired outcome when Mode 02 is supported but no freeze frame data exists. Actual ECU behavior must be confirmed during research and real adapter testing — possible outcomes include valid empty responses, DTC = 0000, NO DATA, or unsupported responses. Implementation will follow verified behavior rather than assumptions.

**Acceptance Scenarios**:

1. **Given** a vehicle with no active DTCs, **When** freeze frame is requested, **Then** the system correctly represents the ECU response based on verified real or documented OBD-II behavior, without exceptions.
2. **Given** a vehicle where freeze frame data has been cleared, **When** freeze frame is requested, **Then** the system correctly represents the ECU response based on verified real or documented OBD-II behavior, without exceptions.
3. **Given** a vehicle that reports no stored snapshot, **When** freeze frame is requested, **Then** the system correctly represents the ECU response based on verified real or documented OBD-II behavior, without exceptions.

---

### User Story 3 — Freeze Frame Unsupported (Priority: P1)

A technician connects to a vehicle whose ECU does not support Mode 02 freeze frame requests. The system returns a graceful result indicating that freeze frame is unsupported for this vehicle, without throwing an exception or breaking the scan workflow.

**Why this priority**: Not all ECUs support Mode 02. The system must handle this as a normal diagnostic variation, not an error. This prevents scan workflow crashes and provides clear information to the technician.

**Independent Test**: Can be tested by requesting freeze frame from a vehicle or mock profile that returns NO DATA or an unsupported PID response for Mode 02, and verifying the result contains `supported: false, available: false` without any exception.

**Acceptance Scenarios**:

1. **Given** a vehicle that returns NO DATA for Mode 02 PID 01, **When** freeze frame is requested, **Then** the system returns `{ supported: false, available: false }` with no exception thrown.
2. **Given** a vehicle that returns an unsupported PID response, **When** freeze frame is requested, **Then** the system returns `{ supported: false, available: false }` with no exception thrown.
3. **Given** an ECU implementation that does not support freeze frame at all, **When** freeze frame is requested, **Then** the system returns `{ supported: false, available: false }` with no exception thrown.

---

### Edge Cases

- What happens when the freeze frame response is NO DATA? → The system returns `{ supported: false, available: false }` with `rawResponse: "NO DATA"`. The scan does not crash.
- What happens when the freeze frame response is empty (zero bytes)? → Same as NO DATA — graceful degradation to `{ supported: false, available: false }`.
- What happens when the freeze frame response contains invalid hex data? → The parser returns `None` from `parse_freeze_frame()`, and the result is `{ supported: false, available: false }` with the raw response preserved for debugging.
- What happens when the freeze frame response has a partial set of PID values (e.g., only DTC and RPM but missing speed and temperature)? → The parser decodes as many PID values as are present. Missing PIDs are not included in the result. The result still has `supported: true, available: true` with whatever PIDs could be decoded.
- What happens when a vehicle has DTCs but no freeze frame (freeze frame was cleared or never recorded)? → The system correctly represents the ECU response. The desired state model is `{ supported: true, available: false }`, but actual behavior must follow verified real ECU responses — possible outcomes include valid empty response, DTC = 0000, NO DATA, or unsupported response.
- What happens when multiple DTCs exist but only one freeze frame record is available? → The system returns the single freeze frame associated with the first/most-recent DTC. OBD-II standard provides only one freeze frame per request. Multiple DTC freeze frames are out of scope for this feature.
- What happens when the adapter is disconnected during a freeze frame read? → A transport error is raised, distinct from an unsupported PID. The freeze frame result reflects a connection error, not an unsupported mode.
- What happens when the ELM327 response ends with a `>` prompt character? → The `compact_raw_response()` function already strips `>` prompt characters. The parser handles this case identically to responses without prompts.

## Requirements

### Functional Requirements

- **FR-001**: The desktop agent MUST support reading Mode 02 PID 01 (OBD-II Freeze Frame Data) through the existing adapter interface (`adapter.send("0201")`). The command `0201` requests freeze frame data for the first stored DTC. Real ECU behavior for `0201` must be validated during research — do not assume every ECU exposes freeze frame through `0201` in the same way.

- **FR-002**: The system MUST distinguish three freeze frame states as a **desired state model**: (1) supported and available (vehicle supports Mode 02 and has stored freeze frame data), (2) supported but unavailable (vehicle supports Mode 02 but no freeze frame data is currently stored), and (3) unsupported (vehicle does not support Mode 02 or returned NO DATA). The actual mapping of ECU responses to these states must be confirmed through real adapter testing — possible responses when no freeze frame exists include: valid empty response, DTC = 0000, NO DATA, or unsupported response. Implementation must follow verified behavior rather than assumptions.

- **FR-003**: Freeze frame retrieval MUST NOT crash scan workflows. Any error or unsupported response MUST produce a graceful result rather than an exception.

- **FR-004**: Mock profiles MUST store raw freeze frame response bytes in `PID_RESPONSES` (e.g., `PID_RESPONSES["0201"] = bytes.fromhex("420101010C1A980D48043A0547000000000000")`). Raw OBD bytes are the single source of truth — no separately decoded freeze frame state is stored in mock profiles.

- **FR-005**: The same freeze frame parser function MUST be used for both mock adapter responses and real ELM327 responses. Mock adapter responses go through `compact_raw_response()` and the shared parser, identical to real responses. The parser is the single point of decoding for both paths.

- **FR-006**: The parser MUST support prompt-terminated ELM327 responses ending with `>`. The existing `compact_raw_response()` function already handles this, and freeze frame parsing MUST use it consistently.

- **FR-007**: Raw ECU responses MUST be preserved in the `rawResponse` field of the `FreezeFrameResult` for debugging and verification purposes.

- **FR-008**: Freeze frame results MUST be returned as structured data conforming to the `FreezeFrameResult` entity shape: `supported`, `available`, `dtc`, `rpm`, `speed`, `coolantTemperature`, `engineLoad`, `additionalPids`, and `rawResponse`.

- **FR-009**: Freeze frame reading MUST NOT require Redis, caching, or external persistence. Each read is a live query to the ECU (or mock adapter).

- **FR-010**: The feature MUST follow the existing PrioraScan pattern established by VIN Handler, Vehicle Health, and Readiness Monitors: separate `read_freeze_frame(adapter)` function for I/O, separate `parse_freeze_frame(hex_str)` pure function for parsing, and a structured result dict wrapped with `supported`/`available` flags. No backend redesign. No Redis. No persistence. No ECU Discovery dependency. No UDS dependency. The data flow is: `read_freeze_frame(adapter)` → `parse_freeze_frame(raw_hex)` → `FreezeFrameResult` → `VEHICLE_DATA_READ` payload.

- **FR-010a**: **Parser-first implementation**: The parser MUST first correctly decode DTC, RPM, speed, load, and coolant. Only after these five fields are verified should optional PID expansion be considered. The parser is the source of truth — no decoded state may bypass it.

- **FR-011**: The freeze frame parser MUST decode the DTC code from the first two bytes after the Mode 02 PID 01 header (`42 01`). The DTC is encoded as a 2-byte value using the standard SAE J1979 DTC encoding (first byte high nibble determines type: P=0, C=1, B=2, U=3).

- **FR-012**: The freeze frame parser MUST decode the four MVP diagnostic PID values from the freeze frame response: RPM (PID 0C), vehicle speed (PID 0D), engine load (PID 04), and coolant temperature (PID 05). The parser must first correctly decode DTC, RPM, speed, load, and coolant before any optional PID expansion is considered. The parser is the source of truth.

- **FR-013**: The freeze frame parser MUST handle the case where only some expected PIDs are present in the response. PIDs not found in the response MUST be omitted from the result (not included with null or default values). The MVP decodes only the four required diagnostic PIDs (0C, 0D, 04, 05). Unknown or unsupported PIDs may be preserved in raw form under `additionalPids` without mandatory decoding — arbitrary PID decoding is not required for MVP.

- **FR-014**: The `read_freeze_frame` function MUST be callable independently of the full vehicle data read flow, enabling freeze-frame-only diagnostic checks.

- **FR-015**: The freeze frame result MUST be included in the `VEHICLE_DATA_READ` event payload under the `freezeFrame` key, following the existing result shape convention established by vehicle health, DTC, VIN, and readiness monitor reads.

- **FR-016**: When Mode 02 PID 01 is in the adapter's unsupported command set (mock profile `UNSUPPORTED_COMMANDS`) or returns NO DATA, the system MUST return `{ supported: false, available: false }` as the freeze frame result, consistent with other unsupported PID results in the vehicle data read flow.

- **FR-017**: The freeze frame parser MUST handle the standard OBD-II freeze frame response format where PID identifiers and values alternate after the DTC bytes (e.g., `42 01 [DTC_2_BYTES] [PID_1_BYTE] [VALUE_N_BYTES] [PID_2_BYTE] [VALUE_N_BYTES] ...`).

### Key Entities

- **FreezeFrameResult**: The top-level result of a freeze frame read. Fields: `supported` (boolean — whether Mode 02 is supported by the ECU), `available` (boolean — whether freeze frame data is currently stored), `dtc` (string or null — the DTC code that triggered the freeze frame, e.g., "P0301"), `rpm` (number or null — engine RPM at time of fault), `speed` (number or null — vehicle speed in km/h at time of fault), `coolantTemperature` (number or null — coolant temperature in °C at time of fault), `engineLoad` (number or null — calculated engine load percentage at time of fault), `additionalPids` (object or null — any additional decoded PID values beyond the four mandatory ones, keyed by PID number), `rawResponse` (string — the raw ECU response hex for debugging).

- **FreezeFrameState**: A desired state model for freeze frame availability. Values: `supported_and_available` (supported: true, available: true — data exists), `supported_and_unavailable` (supported: true, available: false — Mode 02 works but no snapshot stored), `unsupported` (supported: false, available: false — Mode 02 not supported or NO DATA). This is not a separate entity but a documented state convention. **Note**: The mapping of real ECU responses to these states must be confirmed through research and real adapter testing. Possible ECU responses when no freeze frame exists include valid empty response, DTC = 0000, NO DATA, or unsupported response — implementation must follow verified behavior.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All mock profile freeze frame responses (`0201` PID data) decode successfully, producing valid `FreezeFrameResult` structures with correct DTC codes and decoded PID values.

- **SC-002**: A real WiFi ELM327 adapter connected to a vehicle produces a valid `FreezeFrameResult` that correctly reflects the vehicle's stored freeze frame DTC and operating conditions.

- **SC-003**: NO DATA responses return `{ supported: false, available: false }` without exceptions, preserving the raw response for debugging.

- **SC-004**: The system correctly represents the ECU response when no freeze frame exists, based on verified real or documented OBD-II behavior, without exceptions. The supported/unavailable distinction is a desired state model — actual mapping must follow validated ECU behavior.

- **SC-005**: Mock and real adapters produce identical parser behavior: the same raw Mode 02 PID 01 response bytes produce the same `FreezeFrameResult` regardless of adapter type.

- **SC-006**: All existing desktop-agent tests pass without modification — no regressions in vehicle health, DTC, VIN, readiness monitors, or clear-code functionality.

- **SC-007**: The same Toyota real vehicle used for Feature 013 and Feature 016 must be tested with Mode 02 PID 01. The test must capture: raw adapter response, cleaned response, whether freeze frame exists, whether the ECU reports NO DATA, and whether the ECU reports an unsupported response. All findings must be documented in `specs/017-freeze-frame-data/research.md`. If Toyota returns NO DATA, treat it as a valid regression result — document the behavior and do not block implementation.

## Assumptions

- The freeze frame data format follows the SAE J1979 standard: Mode 02 PID 01 response contains the 2-byte DTC code followed by alternating PID identifier and PID value pairs. The PID values use the same encoding as Mode 01 (e.g., RPM = PID 0C encoded as `value = A * 256 + B / 4`, speed = PID 0D encoded as `value = A` in km/h).
- OBD-II provides only one freeze frame record per `0201` request — the frame associated with the DTC that caused the MIL to illuminate. Requesting freeze frames for specific DTCs (e.g., `0202` for the second DTC) is out of scope for this feature.
- The `compact_raw_response()` and `is_adapter_error_response()` functions in `elm_parser.py` are used for both mock and real paths. The freeze frame parser will follow the same pattern.
- Mock profiles will store freeze frame raw response bytes in `PID_RESPONSES["0201"]`. Raw OBD bytes are the single source of truth.
- The existing `_send_pid()` helper function in `vehicle_data.py` can be reused for sending the `0201` command, following the same pattern as readiness monitors and other PID reads.
- The freeze frame result will be added to the `VEHICLE_DATA_READ` event payload under a `freezeFrame` key, consistent with how `readinessMonitors`, `fuelSystemStatus`, and other results are structured.
- The DTC encoding in freeze frame uses the same SAE J1979 format as Mode 03 DTC responses: first byte high nibble determines type (P=0x0, C=0x1, B=0x2, U=0x3), remaining bits encode the numeric portion.
- Vehicles that support Mode 02 but have no stored freeze frame data may return a valid Mode 02 response with no PID value pairs after the DTC bytes, may return a response where the DTC bytes are zero (`00 00`), or may return NO DATA or an unsupported response. The actual behavior must be confirmed through real adapter testing — the `supported: true, available: false` state model is desired but must be validated against real ECU behavior before parser assumptions are finalized.

## Scope Boundaries

### In Scope

- Reading and decoding Mode 02 PID 01 freeze frame data
- Parsing DTC code from freeze frame response using SAE J1979 encoding
- Decoding standard PID values (RPM, speed, engine load, coolant temperature) from freeze frame response
- Creating `read_freeze_frame()` and `parse_freeze_frame()` functions following the existing pattern
- Adding freeze frame raw response data to mock profiles (`PID_RESPONSES["0201"]`)
- Ensuring mock and real adapters produce identical decoded output for the same raw bytes
- Graceful handling of unsupported, empty, NO DATA, and partial responses
- Including freeze frame data in the `VEHICLE_DATA_READ` event payload
- Preserving raw ECU response data for debugging
- Real Toyota vehicle validation with Mode 02 PID 01 capture

### Optional Additive Work (may be included or deferred)

- Backend result payload extension (new fields in vehicle data response)
- Frontend freeze frame display — the feature is primarily complete when the agent/backend result shape is correct, but frontend display may be included if low-risk

### Out of Scope

- ECU Discovery
- OEM-specific freeze frame data beyond the SAE J1979 standard PIDs
- UDS freeze frame
- Multiple freeze frame records (requesting frames for specific DTC numbers via Mode 02 PID 02+)
- Health scoring or freeze-frame-based health assessment
- PDF reports
- Redis, caching, or external databases
- Persistent storage of freeze frame results
- Clearing freeze frame data (covered by DTC Clear feature)