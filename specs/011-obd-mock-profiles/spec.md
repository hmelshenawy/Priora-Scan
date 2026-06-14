# Feature Specification: Realistic OBD Mock Profiles

**Feature Branch**: `011-obd-mock-profiles`

**Created**: 2026-06-14

**Status**: Draft

**Input**: User description: "Feature 010.3A — Realistic OBD Mock Profiles. Replace artificial/random mock values with reusable realistic mock vehicle profiles based on actual captured vehicle responses, enabling frontend and backend development without requiring physical vehicle access."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer selects a mock vehicle profile (Priority: P1)

A developer sets `OBD_MOCK=true` and `OBD_MOCK_PROFILE=toyota_real_sample` in their environment, then starts the Desktop Agent. The system loads the Toyota Real Sample profile and all OBD responses (RPM, speed, coolant, voltage) return raw ECU hex matching actual captured vehicle data. The existing parsers decode these responses identically to how they would decode real vehicle data. The developer can work on Vehicle Health UI, DTC workflows, and VIN handling without a physical vehicle.

**Why this priority**: This is the core value proposition — replacing unrealistic mock data with realistic profiles. Without profile selection working, no other scenario functions.

**Independent Test**: Can be fully tested by starting the Desktop Agent with a specific profile and verifying that OBD command responses match the profile's defined raw ECU responses. Delivers the ability to develop against realistic vehicle data immediately.

**Acceptance Scenarios**:

1. **Given** environment variables `OBD_MOCK=true` and `OBD_MOCK_PROFILE=toyota_real_sample`, **When** the Desktop Agent starts, **Then** all OBD PID requests return raw ECU responses matching the Toyota Real Sample profile (e.g., `010C` → `410C0E10` decodes to 900 RPM, `0105` → `41057E` decodes to 86°C, `0142` → `41423469` decodes to 13.417V, `012F` → `NO DATA` for unsupported fuel level, `0902` → all-FF payload for unsupported VIN)
2. **Given** environment variables `OBD_MOCK=true` and `OBD_MOCK_PROFILE=nonexistent`, **When** the Desktop Agent starts, **Then** the system falls back to the default profile and logs a warning about the missing profile
3. **Given** environment variable `OBD_MOCK=true` with no `OBD_MOCK_PROFILE` set, **When** the Desktop Agent starts, **Then** the system uses the default profile

---

### User Story 2 - Developer tests DTC fault code workflows offline (Priority: P2)

A developer sets `OBD_MOCK_PROFILE=with_faults` and triggers a diagnostic scan. The system returns raw DTC response bytes that decode to fault codes P0301, P0171, and U0100. The existing enrichment engine processes these codes and the frontend displays enriched descriptions ("Cylinder 1 Misfire", "System Too Lean", "Lost Communication With ECM"). Separately, using `OBD_MOCK_PROFILE=no_faults`, the scan returns "NO DATA" indicating no fault codes present.

**Why this priority**: DTC workflow testing is critical for the diagnostic feature but depends on P1 (profile selection) working first.

**Independent Test**: Can be tested by switching profiles and triggering diagnostic scans, verifying that raw DTC responses decode to the expected fault codes with enriched descriptions and that the no-faults profile returns clean results.

**Acceptance Scenarios**:

1. **Given** `OBD_MOCK_PROFILE=with_faults`, **When** a DTC scan is triggered, **Then** the system returns raw DTC response bytes that decode to codes P0301, P0171, and U0100 with enriched descriptions ("Cylinder 1 Misfire", "System Too Lean", "Lost Communication With ECM") displayed in the UI
2. **Given** `OBD_MOCK_PROFILE=no_faults`, **When** a DTC scan is triggered, **Then** the system returns "NO DATA" and the UI displays no fault codes found
3. **Given** `OBD_MOCK_PROFILE=toyota_real_faults`, **When** a DTC scan is triggered, **Then** the system returns raw DTC response bytes that decode to codes P0301, P0171, and U0100, and Vehicle Health PIDs return raw ECU responses identical to the `toyota_real_sample` profile

---

### User Story 3 - Developer tests unsupported VIN scenario (Priority: P3)

A developer sets `OBD_MOCK_PROFILE=unsupported_vin` and triggers a VIN read. The system returns the raw all-FF payload (`490201FFFFFF FFFFFFFFFFFFFFFF FFFFFFFFFFFFFF`) which the existing VIN parser decodes as an invalid VIN. The UI displays "Not supported by vehicle" without crashing or breaking the workflow.

**Why this priority**: VIN unsupported is an edge case that must be handled gracefully, but it's less frequently needed than health data or fault codes.

**Independent Test**: Can be tested by setting the unsupported_vin profile, requesting VIN, and verifying the UI shows "Not supported by vehicle" and the workflow continues without failure.

**Acceptance Scenarios**:

1. **Given** `OBD_MOCK_PROFILE=unsupported_vin`, **When** a VIN read is requested, **Then** the system returns the raw all-FF payload and the UI displays "Not supported by vehicle" without workflow failure
2. **Given** `OBD_MOCK_PROFILE=no_faults`, **When** a VIN read is requested, **Then** the system returns a valid VIN raw response that decodes correctly (e.g., JTDBR32E720123456) displayed in the UI

---

### Edge Cases

- What happens when a profile is loaded but a specific PID is not defined in that profile? The system returns `b""` (empty bytes, equivalent to NO DATA) for that PID, matching real vehicle behavior for unsupported parameters.
- What happens when `OBD_MOCK` is false but `OBD_MOCK_PROFILE` is still set? The profile variable is ignored; real hardware communication is used.
- What happens if the profile registry fails to load? The system falls back to the default profile with a logged error.
- What happens when switching profiles at runtime (not at startup)? Profiles are read at startup only; a restart is required to switch profiles.
- What happens when a profile omits the `readinessMonitors` field? Missing readiness monitors are interpreted as "unsupported" — PID 0101 returns `b""` and Vehicle Health reports readiness data as `{"supported": false}`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Desktop Agent MUST support environment variable `OBD_MOCK_PROFILE` to select a specific mock vehicle profile when `OBD_MOCK=true`
- **FR-002**: Desktop Agent MUST support the following profile names: `default`, `toyota_real_sample`, `no_faults`, `with_faults`, `unsupported_vin`, `toyota_real_faults`
- **FR-003**: Desktop Agent MUST fall back to the `default` profile when `OBD_MOCK_PROFILE` is set to a nonexistent profile name, and MUST log a warning about the invalid profile
- **FR-004**: The `toyota_real_sample` profile MUST return raw OBD response bytes matching captured vehicle data: `010C` → `410C0E10` (900 RPM), `010D` → `410D00` (0 km/h), `0105` → `41057E` (86°C), `0104` → `410476` (46.3% engine load), `0142` → `41423469` (13.417V), `012F` → `NO DATA` (fuel level unsupported), `0902` → all-FF payload (VIN unsupported)
- **FR-005**: The `toyota_real_sample` profile MUST return the raw supported PID mask `4100BE1FB813` for PID 0100
- **FR-006**: The `no_faults` profile MUST return raw OBD response bytes for valid vehicle health PIDs, a valid VIN raw response, and "NO DATA" for DTC scans
- **FR-007**: The `with_faults` profile MUST return raw DTC response bytes that decode to fault codes P0301, P0171, and U0100 with descriptions enriched by the existing fault code enrichment engine
- **FR-008**: The `unsupported_vin` profile MUST return the raw all-FF VIN payload (`490201FFFFFF FFFFFFFFFFFFFFFF FFFFFFFFFFFFFF`) that the system gracefully handles by displaying "Not supported by vehicle"
- **FR-009**: MockObdAdapter MUST be refactored to delegate response generation to the active mock profile rather than returning hardcoded values
- **FR-010**: A profile registry MUST be created to load, validate, and return the active mock profile based on environment configuration
- **FR-011**: Each mock profile MUST be a separate module file under `desktop-agent/src/obd/mock_profiles/` containing its complete set of raw OBD response bytes
- **FR-012**: The existing `OBD_MOCK=true` behavior MUST continue to function without breaking changes to any existing tests or frontend behavior
- **FR-013**: The `default` profile MUST reproduce the current MockObdAdapter behavior exactly, ensuring backward compatibility
- **FR-014**: The `toyota_real_faults` profile MUST combine the `toyota_real_sample` vehicle health raw OBD responses with DTC fault codes P0301, P0171, and U0100. Vehicle Health PIDs (010C, 010D, 0105, 0104, 0142) and VIN/unsupported responses MUST be identical to `toyota_real_sample`. DTC responses (03, 07, 0A) MUST return raw bytes that decode to P0301, P0171, and U0100 with fault metadata matching the enrichment engine expectations
- **FR-015**: Mock profiles MUST store raw OBD response bytes (e.g., `bytes.fromhex("410C0E10")`) exactly as a real ECU would return them. The existing parsers and decoders MUST remain responsible for converting raw ECU responses into user-facing values. The mock communication path and the real vehicle communication path MUST exercise identical parser code
- **FR-016**: Each mock profile MAY include an optional `readinessMonitors` field containing readiness monitor data for PID 0101. Profiles that omit `readinessMonitors` MUST be interpreted as having unsupported readiness monitors — PID 0101 returns `b""` and Vehicle Health reports readiness data as `{"supported": false}`

### Key Entities

- **Mock Profile**: A named collection of raw OBD command-to-response byte mappings representing a specific vehicle's behavior. Stores raw ECU responses (not decoded values) so that the same parser code executes on both mock and real paths. Attributes: profile name, PID responses (raw bytes), VIN response (raw bytes), DTC responses (raw bytes), clear DTC response (raw bytes), fault metadata, unsupported commands, vehicle description, and an optional readiness monitors field.
- **Profile Registry**: A service that loads the active mock profile based on `OBD_MOCK_PROFILE` environment variable, validates the profile exists, and falls back to `default` if invalid. Attributes: available profile names, active profile reference.
- **MockObdAdapter**: An adapter that delegates OBD command queries to the active mock profile instead of returning hardcoded values. Modified, not new entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can set `OBD_MOCK=true` and `OBD_MOCK_PROFILE=toyota_real_sample` and receive raw OBD responses that decode to vehicle health data matching real captured values (RPM=900, Speed=0, Coolant=86°C, Voltage=13.417V) without any physical hardware
- **SC-002**: Switching between all 6 supported profiles (`default`, `toyota_real_sample`, `no_faults`, `with_faults`, `unsupported_vin`, `toyota_real_faults`) takes effect on Desktop Agent restart with no code changes required
- **SC-003**: Setting an invalid `OBD_MOCK_PROFILE` value results in fallback to the `default` profile with a logged warning, not a crash or error
- **SC-004**: The Vehicle Health UI displays realistic profile values decoded from raw ECU responses (e.g., "900 rpm", "86°C", "13.417 V", "Not supported") without any frontend code modifications, using the same parser code path as real vehicle communication
- **SC-005**: DTC enrichment displays enriched fault descriptions (e.g., "Cylinder 1 Misfire", "System Too Lean", "Lost Communication With ECM") when using the `with_faults` or `toyota_real_faults` profile
- **SC-006**: The unsupported VIN scenario displays "Not supported by vehicle" without workflow failure or UI crash
- **SC-007**: All existing tests continue to pass without modification
- **SC-008**: A new profile can be added by creating a single module file without modifying any existing profile code (extensibility)
- **SC-009**: The `toyota_real_faults` profile produces Vehicle Health responses identical to `toyota_real_sample` while also returning DTC fault codes P0301, P0171, and U0100, enabling simultaneous testing of Vehicle Health and DTC workflows with real-captured data
- **SC-010**: Mock profiles store raw OBD response bytes, and the same parser/decoder code path executes for both mock and real vehicle data — no separate mock-only decode logic exists

## Assumptions

- Profiles are selected at Desktop Agent startup only; runtime profile switching requires a restart
- The existing fault code enrichment engine handles DTC code lookups; mock profiles only need to provide the raw DTC response bytes
- The `default` profile preserves exact current MockObdAdapter behavior for backward compatibility
- Environment variables `OBD_MOCK` and `OBD_MOCK_PROFILE` are the standard configuration mechanism; no UI-based profile selection is required for this feature
- The profile architecture must support easy addition of future vehicle profiles (Mercedes W206, Toyota Corolla, Nissan Patrol, etc.) without modifying the registry or adapter code
- Each profile module is self-contained and does not depend on other profile modules
- Mock profiles store raw OBD response bytes (e.g., `bytes.fromhex("410C0E10")` for RPM) exactly as a real ECU would return them. The existing parsers and decoders are the single source of truth for converting raw bytes to user-facing values. This ensures the mock path and the real vehicle path exercise identical code
- The Desktop Agent is the sole consumer of mock profiles; no backend schema changes are needed
- The `readinessMonitors` field is an optional part of the profile architecture introduced in this feature to prepare for future PID 0101 support. Actual implementation of PID 0101 readiness monitor decoding is NOT required in this feature. Profiles that omit `readinessMonitors` are interpreted as having unsupported readiness monitors
- The `toyota_real_faults` profile combines real-captured vehicle health data with synthetic fault codes to enable integrated Vehicle Health + DTC testing. It does not represent a real vehicle with faults; the fault codes are shared with the `with_faults` profile for consistency