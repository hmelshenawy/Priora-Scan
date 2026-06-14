# Feature Specification: Vehicle Health Real Adapter Integration

**Feature Branch**: `013-vehicle-health-real-adapter`

**Created**: 2026-06-14

**Status**: Draft

**Input**: Integrate the working real adapter probe logic into the production Vehicle Health read flow. Vehicle Health must discover supported PIDs from the connected vehicle, then read only supported health PIDs. Unsupported PIDs and VIN must be reported as unsupported rather than failing the read.

**Objective**: The primary objective of Feature 013 is end-to-end Vehicle Health integration using real and mock adapters. Backend and frontend updates are optional additive work and may be implemented in this feature or a subsequent feature. Feature success is measured by successful capability discovery, PID reads, and correct Vehicle Health result generation.

## User Scenarios & Testing

### User Story 1 - Technician Reads Vehicle Health from a Real Adapter (Priority: P1)

A technician connects a real WiFi ELM327 adapter to a vehicle and triggers a vehicle health read. The system discovers which PIDs the vehicle supports by querying the Mode 01 PID bitmap (0100/0120/0140 as needed), then reads only the supported health PIDs. The result shows decoded values for RPM, vehicle speed, coolant temperature, engine load, and control module voltage. The technician sees real values from their vehicle instead of placeholder or mock data.

**Why this priority**: This is the core value — PrioraScan currently has real adapter communication verified, but the vehicle health read flow does not use PID capability discovery. Without this, a real read sends commands the vehicle does not support, leading to NO DATA errors that look like failures. This unblocks real-world diagnostic use.

**Independent Test**: Can be fully tested by connecting a real WiFi ELM327 adapter to a vehicle and triggering a vehicle health read, then verifying that only supported PIDs return decoded values and unsupported PIDs are listed as unsupported.

**Acceptance Scenarios**:

1. **Given** a real WiFi ELM327 adapter connected to a Toyota vehicle, **When** the technician triggers a vehicle health read, **Then** the system queries PID 0100 to discover supported PIDs before reading any health PIDs.
2. **Given** a real adapter and a vehicle that supports PIDs 0104, 0105, 010C, 010D, and 0142, **When** vehicle health is read, **Then** the result contains decoded values for engine load, coolant temperature, RPM, vehicle speed, and control module voltage.
3. **Given** a real adapter and a vehicle that does not support PID 012F, **When** vehicle health is read, **Then** fuel level is reported as `{pid: "012F", supported: false, available: false, value: null}` and the health read does not fail.
4. **Given** a real adapter and a vehicle that does not support VIN (0902), **When** vehicle health is read, **Then** VIN is reported as unsupported and the health read completes successfully with all other supported PIDs.

---

### User Story 2 - Technician Sees Supported and Unsupported PID Lists (Priority: P2)

After a vehicle health read, the technician sees both which PIDs the vehicle supports and which configured health PIDs are not supported. The result distinguishes between a PID the vehicle does not support (capability) and a PID the vehicle supports but that returned no data for this read (availability). This helps the technician understand the vehicle's diagnostic capabilities and avoids confusion about missing readings.

**Why this priority**: Transparency about what a vehicle can and cannot report is essential for trust. Without showing unsupported PIDs, a technician might think a sensor is broken when the vehicle simply does not support that PID. Without distinguishing capability from availability, a temporary NO DATA response looks identical to a vehicle that never supported that PID.

**Independent Test**: Can be tested by performing a vehicle health read and verifying the health result payload includes explicit lists of supported and unsupported configured health PIDs, and that each PID result distinguishes capability (`supported`) from availability (`available`).

**Acceptance Scenarios**:

1. **Given** a vehicle health read has completed, **When** the result is inspected, **Then** the payload includes a list of supported health PIDs (e.g., `["0104", "0105", "010C", "010D", "0142"]`).
2. **Given** a vehicle health read has completed and the vehicle does not support PID 012F, **When** the result is inspected, **Then** the payload includes an unsupported health PIDs list containing `"012F"` and the fuel level result is `{pid: "012F", supported: false, available: false, value: null}`.
3. **Given** a vehicle health read has completed and the vehicle does not support VIN, **When** the result is inspected, **Then** VIN is reported as `{supported: false, available: false, value: null}` rather than causing an error.
4. **Given** a vehicle health read has completed and a supported PID (e.g., 010C) returned NO DATA, **When** the result is inspected, **Then** the PID result is `{pid: "010C", supported: true, available: false, value: null}` — capability and availability are distinguished.

---

### User Story 3 - Mock and Real Adapters Produce Consistent Results (Priority: P3)

A developer or QA tester uses mock adapter profiles to simulate vehicle health reads. The same parser path and data shape is used whether the data comes from a mock profile or a real adapter. The Toyota real sample mock profile produces exactly the same decoded values as the captured real Toyota data.

**Why this priority**: Consistency between mock and real paths ensures that mock profiles are valid test surrogates. If mock and real paths diverge, mock-based tests are unreliable.

**Independent Test**: Can be tested by comparing the decoded output of the Toyota real sample mock profile against the known captured values (RPM=900, Speed=0, Coolant=86°C, Load=46.3%, Voltage=13.417V).

**Acceptance Scenarios**:

1. **Given** a mock adapter with the `toyota_real_sample` profile, **When** vehicle health is read, **Then** RPM is 900, vehicle speed is 0, coolant temperature is 86°C, engine load is 46.3%, and control module voltage is 13.417V.
2. **Given** a mock adapter with the `toyota_real_sample` profile, **When** vehicle health is read, **Then** fuel level is `{pid: "012F", supported: false, available: false, value: null}`.
3. **Given** a mock adapter with the `toyota_real_sample` profile, **When** vehicle health is read, **Then** VIN is reported as unsupported.
4. **Given** a real WiFi adapter connected to the same Toyota vehicle, **When** vehicle health is read, **Then** the decoded values match the mock profile output for all supported PIDs.

---

### Edge Cases

- What happens when a PID is listed as supported by the bitmap (0100) but returns NO DATA? → Classified as supported but unavailable for this read (`supported: true, available: false, value: null`). The PID remains in the "supported" discovery list, but the data point clearly distinguishes capability from availability.
- What happens when PID 0100 itself returns NO DATA or an empty response? → Discovery fails gracefully; all configured health PIDs are attempted as a fallback, each returning unsupported if they also fail.
- What happens when the adapter is a mock adapter (no real PID discovery needed)? → The mock adapter's profile already defines which PIDs are supported/unsupported. The same PID discovery logic works because mock profiles return appropriate bitmap responses (e.g., `4100BE1FB813` for Toyota).
- What happens when PID 0120 (PIDs 21-40) is not supported? → The bitmap chain stops at 0100. The system does not query 0120 or any further ranges. PIDs 21-40 are not included in the supported list. No error.
- What happens when the bitmap chain indicates a further range is supported? → The system queries the next bitmap (e.g., 0120 → 0140 → 0160) until the chain ends (bit 32 of each response indicates whether the next range exists).
- What happens when the adapter disconnects mid-read? → A transport error is raised (distinct from unsupported PID), which fails the read as expected.
- What happens when a supported PID returns a response that cannot be parsed? → The PID is reported as `{supported: true, available: false, value: null}` rather than crashing the read.

## Requirements

### Functional Requirements

- **FR-001**: The vehicle health read flow MUST discover supported PIDs by querying Mode 01 PID bitmap commands before reading health data PIDs. Discovery MUST start with PID 0100 and follow the bitmap chain (0120, 0140, etc.) only when the current bitmap indicates the next range is supported.
- **FR-002**: The vehicle health read flow MUST only request configured health PIDs that are present in the discovered supported PID list.
- **FR-003**: When a configured health PID is not in the discovered supported list, the system MUST report it as unsupported (`supported: false, available: false, value: null`) without sending the PID command to the vehicle.
- **FR-004**: The vehicle health read result payload MUST include a `supportedHealthPids` list containing the hex identifiers of all configured health PIDs that the vehicle supports.
- **FR-005**: The vehicle health read result payload MUST include an `unsupportedHealthPids` list containing the hex identifiers of all configured health PIDs that the vehicle does not support.
- **FR-006**: The configured health PIDs for vehicle health are: 0104 (Engine Load), 0105 (Coolant Temperature), 010C (RPM), 010D (Vehicle Speed), 0142 (Control Module Voltage), and 012F (Fuel Level).
- **FR-007**: When a supported PID returns NO DATA or an unparseable response, the system MUST classify it as supported but unavailable for this read (`supported: true, available: false, value: null`) rather than failing the entire health read. This distinguishes a vehicle capability (supported by bitmap) from a temporary read failure (unavailable this time).
- **FR-008**: VIN read MUST remain best-effort and optional. An unsupported VIN MUST NOT fail the vehicle health read. The VIN result MUST follow the `VinResult` typed shape established in Feature 012.
- **FR-009**: The same parser path and data point shape MUST be used for both mock and real adapters. Mock adapter responses and real adapter responses MUST produce identical decoded output for the same raw OBD data.
- **FR-010**: PID capability discovery MUST occur at the start of each vehicle health read (runtime discovery). No persistent cache or external data store is used for PID capability between reads.
- **FR-011**: The vehicle health read MUST ensure the adapter is connected before performing operations. If the adapter is not already connected, the system MUST attempt to connect it before proceeding with PID discovery and health reads.
- **FR-012**: The vehicle health result MUST include both the decoded value and the raw OBD response for each successfully read PID where applicable.
- **FR-013**: The Toyota real sample mock profile MUST produce the same decoded values as the captured real Toyota data: RPM=900, Speed=0 km/h, Coolant=86°C, Engine Load=46.3%, Voltage=13.417V, Fuel Level unsupported.
- **FR-014**: The vehicle health read MUST include RPM (010C) and vehicle speed (010D) in the result payload, in addition to the existing data points (battery voltage, engine load, fuel level).
- **FR-015**: When PID 0100 discovery fails or returns no data, the system MUST attempt to read all configured health PIDs as a fallback, reporting each as unsupported if it also fails.
- **FR-016**: PID capability discovery MUST stop when the bitmap indicates there are no additional supported PID ranges. The system MUST NOT blindly query all discovery ranges. Specifically: after querying 0100, check whether the bitmap supports PID 20 (next range); if not, stop. After querying 0120, check whether the bitmap supports PID 40; if not, stop. This chain-following continues until no further range is indicated.

### Key Entities

- **PidCapability**: The set of supported and unsupported PIDs discovered from a vehicle during a health read. Fields: `supportedPids` (list of hex PID identifiers), `unsupportedPids` (list of hex PID identifiers from the configured health set), `discoveredAt` (timestamp). Included in the vehicle health result payload as snapshot data, not persisted as a standalone entity in this feature.

- **HealthPidResult**: A single PID data point in the vehicle health result. Fields: `pid` (hex identifier, e.g., "010C"), `value` (decoded value or null), `unit` (measurement unit), `supported` (boolean — whether the vehicle declared this PID via bitmap), `available` (boolean — whether a value was successfully read this time), `rawResponse` (optional raw OBD hex string). The `supported`/`available` distinction separates vehicle capability from per-read availability:
  - `supported: false, available: false` — PID not supported by vehicle
  - `supported: true, available: false` — PID supported but returned NO DATA or unparseable response this read
  - `supported: true, available: true` — PID supported and value successfully read

- **VehicleCapabilityProfile (future, out of scope)**: Persistent record of a vehicle's supported PIDs. Fields: `id`, `vehicleId`, `vin` (nullable), `protocol`, `supportedPids` (JSONB), `unsupportedPids` (JSONB), `discoveredAt`, `lastVerifiedAt`, `source` (REAL_ADAPTER | MOCK_PROFILE). This entity is documented as a future PostgreSQL extension and MUST NOT be implemented in this feature.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A vehicle health read from a real WiFi ELM327 adapter returns decoded values for all supported health PIDs (RPM, speed, coolant temperature, engine load, and battery voltage) within a single read operation.
- **SC-002**: Fuel level is reported as `supported: false, available: false` when PID 012F is not supported by the vehicle, and as `supported: true, available: false` when PID 012F is supported but returns NO DATA — with no impact on the success of the health read in either case.
- **SC-003**: VIN reported as unsupported does not prevent the vehicle health read from completing successfully with all other supported data.
- **SC-004**: The vehicle health result payload includes explicit lists of supported and unsupported configured health PIDs, verifiable by inspecting the result JSON.
- **SC-005**: The Toyota real sample mock profile produces decoded values matching the captured real Toyota data (RPM=900, Speed=0, Coolant=86°C, Load=46.3%, Voltage=13.417V) with zero value deviation.
- **SC-006**: Mock adapter and real adapter reads produce identical decoded outputs for the same raw OBD response data.
- **SC-007**: All existing tests pass without modification — no regressions in backward-compatible behavior.
- **SC-008**: No Redis, cache, or external data store dependency is introduced in the vehicle health read flow.
- **SC-009**: The verified Toyota real vehicle capture successfully completes Vehicle Health. Input: `0100 → 4100BE1FB813`, `010C → 410C0E10`, `010D → 410D00`, `0105 → 41057E`, `0104 → 410476`, `0142 → 41423469`, `012F → NO DATA`, `0902 → Unsupported`. Expected result: RPM=900, Speed=0 km/h, Coolant=86°C, Engine Load=46.3%, Voltage=13.417V, Fuel Level=Unsupported, VIN=Unsupported. Vehicle Health read completes successfully with no fatal errors.

## Assumptions

- The desktop agent already has PID bitmap discovery logic (0100, 0120, 0900) that returns a structured map of supported PIDs per mode. This will be called at the start of the vehicle health read, and its results will be used to filter which health PIDs to request. The existing logic queries 0120 unconditionally; it will be updated to follow the bitmap chain (FR-016).
- The desktop agent already handles adapter connection before reads. This pattern will be reused unchanged.
- The VIN result typed shape from Feature 012 already handles unsupported VIN gracefully. No changes to the VIN result shape are needed.
- The Toyota real sample mock profile marks PID 012F and 0900 as unsupported. The 0100 bitmap `4100BE1FB813` has bit 32 SET (PID 0x20 supported), so the profile must include `0120` and `0140` bitmap responses for consistent chain-following: `0120 → 412000000001` (chain continues, no PIDs 21-3F supported), `0140 → 414040000000` (PID 0x42 supported, chain stops). The current profile has `0120` in UNSUPPORTED_COMMANDS which contradicts the bitmap — this must be fixed before implementation (T001). The PID discovery flow works identically for mock and real adapters.
- PID capability discovery must follow the bitmap chain: after 0100, only query 0120 if the 0100 bitmap indicates PID 20 is supported. After 0120, only query 0140 if the 0120 bitmap indicates PID 40 is supported. The chain stops when no further range is indicated. PID 0x2F (Fuel Level) is in the 0120 range (PIDs 21-40) and PID 0x42 (Voltage) is in the 0140 range (PIDs 41-60) — proper chain-following through 0120 → 0140 is required to discover both.
- Backend vehicle data response shape extension (RPM, vehicle speed, coolant temperature, supported/unsupported health PID lists) and frontend display updates are optional additive work. They may be included in this feature or deferred to a subsequent feature. Feature success does not depend on backend or frontend changes.
- Raw OBD responses are included in the result payload for diagnostic purposes but are optional and not required for normal display.
- The `supported`/`available` distinction in HealthPidResult separates vehicle capability (declared by bitmap) from per-read availability (value successfully obtained). A PID can be `supported: true` (vehicle declared it) but `available: false` (NO DATA or unparseable this time). A PID that is `supported: false` is always `available: false`.
- PID capability discovery is runtime-only in Feature 013. No persistent cache, Redis, external capability database, or data store is used between reads. The VehicleCapabilityProfile PostgreSQL table remains a documented future extension.

## Scope Boundaries

### In Scope

- Runtime PID capability discovery during each vehicle health read
- Bitmap chain-following: stop discovery when no further range is indicated
- Reading only supported configured health PIDs (0104, 0105, 010C, 010D, 0142, 012F)
- Distinguishing PID capability (`supported`) from per-read availability (`available`)
- Reporting supported and unsupported health PID lists in the result payload
- Adding RPM, coolant temperature, and vehicle speed to the vehicle health result
- VIN as best-effort (already handled by Feature 012)
- Same parser path for mock and real adapters
- Toyota real sample profile validation
- Real Toyota vehicle capture regression (SC-009)

### Optional Additive Work (may be included or deferred)

- Backend result payload extension (new fields in vehicle data response)
- Frontend display updates for new data points and PID lists

### Out of Scope

- Real DTC Mode 03 read
- DTC clear validation
- VIN protocol discovery (UDS 22F190)
- Mode 09 PID discovery (0900-0909)
- Redis or any external cache infrastructure
- External capability databases
- Persistent VehicleCapabilityProfile table in PostgreSQL (future extension only)
- Live data streaming / continuous PID polling
- Protocol auto-detection improvements
- Adapter reconnection logic