# Feature Specification: Real Vehicle Extended PID Validation

**Feature Branch**: `018-extended-live-data-pids`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "Validate which advanced OBD-II Mode 01 PIDs are actually supported and return useful data on a real vehicle before implementing Feature 018B Extended Live Data PIDs. This is a validation and discovery feature only — no frontend, no database, no backend contract changes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Validate Extended PIDs on a Real Vehicle (Priority: P1)

As a PrioraScan developer, I want to run a validation scan on a real vehicle that tests each candidate extended PID (fuel trims, MAF, MAP, throttle position) so that I can confirm which PIDs are supported and return valid data before building full UI and persistence support.

**Why this priority**: This is the entire purpose of the feature. Without real-vehicle validation, Feature 018B could invest in building support for PIDs that aren't available on target vehicles, or miss PIDs that are available. The validation data directly determines the scope of the follow-up feature.

**Independent Test**: Can be fully tested by running the validation function against a mock adapter that simulates various PID support scenarios (all supported, partial support, NO DATA, unsupported) and verifying the output report is correct.

**Acceptance Scenarios**:

1. **Given** a vehicle that supports all 7 target PIDs, **When** the validation function runs, **Then** the output shows each PID as `Supported: YES, Available: YES` with decoded values and raw hex responses.
2. **Given** a vehicle that does not support Bank 2 fuel trims (PIDs 08, 09) but supports the rest, **When** the validation function runs, **Then** PIDs 08 and 09 show `Supported: NO` with no OBD command sent, and the remaining PIDs show their decoded values.
3. **Given** a vehicle that supports PID 06 but returns NO DATA for it, **When** the validation function runs, **Then** PID 06 shows `Supported: YES, Available: NO` without crashing.
4. **Given** a vehicle that returns a malformed response for PID 10, **When** the validation function runs, **Then** PID 10 shows `Supported: YES, Available: NO` and all other PIDs are still processed correctly.
5. **Given** a vehicle where supported PID discovery fails entirely, **When** the validation function runs, **Then** the process terminates with a clear validation error message and does not attempt any PID reads.

---

### User Story 2 - Unit Test Coverage for Extended PID Decoders (Priority: P2)

As a PrioraScan developer, I want unit tests that verify the decode formulas for each extended PID against known hex inputs so that I can trust the decoders before testing on a real vehicle.

**Why this priority**: Decoder correctness is a prerequisite for meaningful real-vehicle validation. Wrong formulas produce wrong values, making the validation data unreliable.

**Independent Test**: Can be tested by running the unit test suite and verifying all decode test cases pass with expected values within tolerance.

**Acceptance Scenarios**:

1. **Given** hex response `41067F`, **When** decoded as STFT Bank 1, **Then** the result is approximately -0.78% (within ±0.5%).
2. **Given** hex response `410680`, **When** decoded as STFT Bank 1, **Then** the result is 0%.
3. **Given** hex response `4106FF`, **When** decoded as STFT Bank 1, **Then** the result is approximately 99.22%.
4. **Given** hex response `41100064`, **When** decoded as MAF, **Then** the result is 1.00 g/s.
5. **Given** hex response `411105`, **When** decoded as Throttle Position, **Then** the result is approximately 1.96%.
6. **Given** an unsupported PID, **When** the validation function processes it, **Then** no OBD command is sent and the result is `Supported: NO`.
7. **Given** a failed supported PID discovery, **When** the validation function is called, **Then** it terminates immediately with a validation error and does not attempt any PID reads.

---

### User Story 3 - Validation Report Generation (Priority: P3)

As a PrioraScan developer, I want a human-readable validation report printed to console that shows the support status, decoded values, and raw responses for each extended PID so that I can quickly determine which PIDs to include in Feature 018B.

**Why this priority**: The report makes validation results actionable. Without it, raw data structures are harder to interpret and compare across test runs.

**Independent Test**: Can be tested by running the validation function with a mock adapter and verifying the console output matches the expected format.

**Acceptance Scenarios**:

1. **Given** a completed validation run, **When** the report is generated, **Then** it prints a header line `===== EXTENDED PID VALIDATION =====`, followed by each PID's name, support status, availability, raw response, and decoded value, followed by a footer `===== END VALIDATION =====`.
2. **Given** an unsupported PID, **When** the report is generated, **Then** it shows `Supported: NO` with no `Available` or `Value` lines.
3. **Given** a supported-but-unavailable PID, **When** the report is generated, **Then** it shows `Supported: YES`, `Available: NO`, with no `Value` line.
4. **Given** a supported PID with a valid response, **When** the report is generated, **Then** it shows the raw OBD response hex string for that PID (e.g., `Raw Response: 41100064`).
5. **Given** a completed validation run, **When** the support matrix is generated, **Then** it produces a tabular summary in the format: `PID | Name | Supported | Available | Value` that can be copied directly into planning documents.

---

### Edge Cases

- What happens when the vehicle's ECU responds to a supported PID bitmap query but the specific PID returns an empty string? — The result is `Supported: YES, Available: NO` (the unavailable path).
- What happens when the supported PID discovery (Mode 01 bitmap) fails entirely? — The validation process MUST terminate with a clear error message. It MUST NOT fall back to attempting all PIDs, since this feature exists to validate actual support status and fallback would produce false results.
- What happens when a PID returns a response with the wrong prefix (e.g., response to a different PID)? — The reader returns `Supported: YES, Available: NO` because the prefix check fails.
- What happens when a two-byte PID (like MAF) returns only one byte? — The reader returns `Supported: YES, Available: NO` because the byte count check fails.
- What happens if optional PIDs (0F, 33) are not supported? — They show as `Supported: NO` in the report and do not affect other PIDs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The desktop agent MUST provide a `read_extended_pid_validation()` function that validates all target PIDs (06, 07, 08, 09, 0B, 10, 11) against a connected vehicle, using the existing supported PID bitmap discovery to determine which PIDs to query.
- **FR-002**: Each extended PID reader MUST follow the existing three-state result model: `_health_pid_result` (supported + available + decoded value), `_unavailable_pid_result` (supported but no data), or `_unsupported_pid_result` (not in vehicle bitmap).
- **FR-003**: The validation function MUST use the existing `read_supported_pids()` function to discover which PIDs the vehicle supports before attempting reads, and MUST NOT send OBD commands for unsupported PIDs.
- **FR-004**: Each PID decoder MUST use the official SAE OBD-II formulas: STFT/LTFT: `(A - 128) * 100 / 128`, MAP: `A`, MAF: `(A * 256 + B) / 100`, Throttle Position: `A * 100 / 255`.
- **FR-005**: STFT Bank 1 (PID 06) and LTFT Bank 1 (PID 07) MUST use the same formula `(A - 128) * 100 / 128`, differing only in their PID code and display name.
- **FR-006**: STFT Bank 2 (PID 08) and LTFT Bank 2 (PID 09) MUST use the same formula as their Bank 1 counterparts, differing only in PID code and display name.
- **FR-007**: MAF (PID 10) MUST be decoded as a two-byte value using `(A * 256 + B) / 100` where A is the high byte and B is the low byte, returning results in grams per second (g/s).
- **FR-008**: Intake Manifold Absolute Pressure (PID 0B) MUST be decoded as a single-byte value `A`, returning results in kilopascals (kPa).
- **FR-009**: Throttle Position (PID 11) MUST be decoded as `A * 100 / 255`, returning results as a percentage (%).
- **FR-010**: The validation function MUST produce a formatted console report showing each PID's name, support status, availability, raw response, and decoded value (when available).
- **FR-011**: The validation function MUST NOT modify existing vehicle health, readiness, freeze frame, or DTC reading behavior.
- **FR-012**: The validation function MUST NOT require any changes to the backend API, frontend, or database. No changes to PIDDefinition seed, VehicleDataJson, VehicleHealthPanel, or vehicle data API contracts.
- **FR-013**: All existing tests for vehicle health, readiness, freeze frame, and DTC MUST continue to pass without modification.
- **FR-014**: Unit tests MUST cover: fuel trim decoding with known hex inputs (41067F ≈ -0.78%, 410680 = 0%, 4106FF ≈ 99.22%), MAF decoding (41100064 = 1.00 g/s), throttle decoding (411105 ≈ 1.96%), MAP decoding, unsupported PID handling (no OBD command sent), NO DATA handling (returns available: false), malformed response handling, and discovery failure abort behavior.
- **FR-015**: Optional PIDs (0F: Intake Air Temperature, 33: Barometric Pressure) MAY be included in the validation if the implementation effort is minimal, but MUST NOT be required for feature completion.
- **FR-016**: If supported PID discovery fails (returns no Mode 01 PIDs), the validation process MUST terminate immediately with a clear validation error message. The system MUST NOT assume support status for any PID. The system MUST NOT attempt validation reads for all PIDs as a fallback. The validation report MUST indicate that discovery failed, for example: "Extended PID validation aborted. Supported PID discovery failed."
- **FR-017**: The validation report MUST include the raw OBD response hex string for every PID that was successfully queried. This is required for future debugging and vehicle-specific investigations.

### Key Entities

- **Extended PID Reader**: A function per PID (or a parameterized function) that sends the OBD command, parses the response, and applies the decode formula. Uses the existing `_send_pid`, `_parse_bytes`, and three-state result factories from `health_pids.py`.
- **Extended PID Validation Map**: A mapping of PID hex codes to reader functions, display names, and units, analogous to `CONFIGURED_HEALTH_PIDS` but for the extended PIDs. Used by `read_extended_pid_validation()`.
- **Validation Report**: A console-formatted output showing the support status and decoded values for each extended PID. Includes raw OBD responses for every successfully queried PID. No persistence required — the developer captures results manually.
- **Support Matrix**: A tabular summary of validation results in the format `PID | Name | Supported | Available | Value` that can be copied directly into planning documents for Feature 018B.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running `read_extended_pid_validation()` against a mock adapter that supports all PIDs produces a report showing all 7 target PIDs as "Supported: YES, Available: YES" with correctly decoded values.
- **SC-002**: Running the validation against a vehicle with partial support correctly identifies unsupported PIDs (e.g., Bank 2 fuel trims) without sending OBD commands for them.
- **SC-003**: All unit tests pass, including new decoder tests for fuel trim, MAF, MAP, and throttle position PIDs with the specified hex inputs and expected values.
- **SC-004**: The Toyota regression test suite passes without modification, confirming no regressions to existing vehicle health behavior.
- **SC-005**: The validation report is readable and actionable, allowing a developer to produce a support matrix that determines the scope of Feature 018B.
- **SC-006**: The validation results are available in a simple support matrix format (`PID | Name | Supported | Available | Value`) that can be copied directly into planning documents for Feature 018B. Example:

```
PID | Name | Supported | Available | Value

06 | STFT B1 | YES | YES | 2.3 %
07 | LTFT B1 | YES | YES | 8.6 %
08 | STFT B2 | NO | -
09 | LTFT B2 | NO | -
0B | MAP | YES | YES | 42 kPa
10 | MAF | YES | YES | 3.1 g/s
11 | Throttle | YES | YES | 1.9 %
```

This matrix is considered part of the feature output.

## Assumptions

- This feature is validation-only and does not add any UI, backend API endpoints, or database schema changes.
- The existing `_send_pid`, `_parse_bytes`, `_health_pid_result`, `_unavailable_pid_result`, and `_unsupported_pid_result` helpers in `health_pids.py` will be reused by the new extended PID readers.
- The existing `read_supported_pids()` function in `supported_pids.py` will be used for PID bitmap discovery — no changes to the discovery mechanism.
- PIDs 06 and 07 (STFT/LTFT Bank 1) use the same formula as the existing seed definition `(A - 128) * 100 / 128`, which is mathematically equivalent to `A / 1.28 - 100`.
- PID 11 (Throttle Position) uses the same formula as PID 04 (Engine Load) and PID 2F (Fuel Level): `A * 100 / 255`. The difference is only the response prefix and expected byte count.
- Optional PIDs (0F, 33) are included for completeness but are not required for acceptance. PID 0F (Intake Air Temperature) uses formula `A - 40` (same as coolant temperature). PID 33 (Barometric Pressure) uses formula `A` (same as MAP).
- The validation output is console-only (no file, no API, no persistence). The developer captures results manually.
- Feature 018B (Extended Live Data PIDs — full pipeline) will be defined after this validation feature produces a real-vehicle support matrix. Only PIDs confirmed as supported on the target vehicle will be included in 018B's scope.
- If supported PID discovery fails, the validation MUST NOT fall back to attempting all PIDs. Unlike the existing `read_vehicle_health` behavior which falls back to trying all configured PIDs when discovery fails, this validation feature exists to determine actual support status — a fallback would produce false validation results.