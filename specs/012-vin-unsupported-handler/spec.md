# Feature Specification: VIN Unsupported Handler Fix

**Feature Branch**: `012-vin-unsupported-handler`

**Created**: 2026-06-14

**Status**: Draft

**Input**: VIN must be optional and non-blocking. Currently, the Toyota real sample profiles intentionally return an all-FF / invalid VIN payload, but VIN reading fails the flow instead of being handled as unsupported. VIN read should return a typed result classifying VIN as SUPPORTED or UNSUPPORTED, with an optional reason, so that vehicle health workflows continue gracefully when VIN is not available.

## User Scenarios & Testing

### User Story 1 - Vehicle Health Scan Completes with Unsupported VIN (Priority: P1)

A diagnostic scan runs on a vehicle that does not support VIN reporting (e.g., Toyota with all-FF VIN payload). The scan completes successfully — all supported health PIDs are collected and reported. The VIN result is reported as unsupported with the reason (ALL_FF), and the VIN value is null. No error is thrown, and the workflow does not fail.

**Why this priority**: This is the core problem — currently an unsupported VIN crashes the entire scan. Without this fix, the Toyota real profiles cannot be used for end-to-end testing at all.

**Independent Test**: Can be fully tested by running a vehicle health scan with the `toyota_real_sample` or `unsupported_vin` profile and verifying that the scan completes and reports VIN as unsupported.

**Acceptance Scenarios**:

1. **Given** a mock adapter with `toyota_real_sample` profile, **When** vehicle health data is read, **Then** all health PIDs are collected and VIN is reported as `{status: "UNSUPPORTED", vin: null, reason: "ALL_FF"}`.
2. **Given** a mock adapter with `unsupported_vin` profile, **When** vehicle health data is read, **Then** the scan completes successfully with VIN unsupported.
3. **Given** a vehicle that does not respond to VIN PID 0902 at all (empty response), **When** VIN is read, **Then** the result is `{status: "UNSUPPORTED", vin: null, reason: "EMPTY_RESPONSE"}`.
4. **Given** a vehicle that returns "NO DATA" for VIN, **When** VIN is read, **Then** the result is `{status: "UNSUPPORTED", vin: null, reason: "NO_DATA"}`.

---

### User Story 2 - Valid VIN Returns Supported Result (Priority: P2)

A diagnostic scan runs on a vehicle that supports VIN reporting (e.g., the default profile). The VIN result is reported as supported with the decoded VIN string, maintaining backward compatibility with existing behavior.

**Why this priority**: Existing working functionality must not break. This ensures the default and `no_faults` profiles still produce valid VIN results in the new typed format.

**Independent Test**: Can be tested by running a VIN read with the `default` or `no_faults` profile and verifying the result shape includes `status: "SUPPORTED"` with a valid 17-character VIN.

**Acceptance Scenarios**:

1. **Given** a mock adapter with `default` profile, **When** VIN is read, **Then** the result is `{status: "SUPPORTED", vin: "W1KAF4GB1RF124321"}`.
2. **Given** a mock adapter with `no_faults` profile, **When** VIN is read, **Then** the result is `{status: "SUPPORTED"}` and VIN is a 17-character string.
3. **Given** a real ELM327 adapter returning a valid VIN, **When** VIN is read, **Then** the result is `{status: "SUPPORTED", vin: <decoded VIN>}`.

---

### User Story 3 - Malformed VIN Response Does Not Crash (Priority: P3)

A vehicle returns a VIN response that has a valid prefix (4902) but the decoded VIN contains non-printable or invalid characters, or has an incorrect length. The system classifies this as unsupported with a MALFORMED reason rather than throwing an error.

**Why this priority**: Defensive handling ensures robustness with real-world ECU responses that may be garbled or partially corrupt.

**Independent Test**: Can be tested by providing a mock adapter that returns a malformed VIN response and verifying the result shape.

**Acceptance Scenarios**:

1. **Given** a VIN response with valid prefix but non-ASCII characters, **When** VIN is read, **Then** the result is `{status: "UNSUPPORTED", vin: null, reason: "MALFORMED"}`.
2. **Given** a VIN response with valid prefix but fewer than 17 decoded characters, **When** VIN is read, **Then** the result is `{status: "UNSUPPORTED", vin: null, reason: "MALFORMED"}`.

---

### Edge Cases

- What happens when a VIN response has mixed valid and invalid bytes (e.g., partially corrupt)? → Classified as MALFORMED, returns UNSUPPORTED.
- What happens when the adapter itself fails (transport error, not just unsupported response)? → This should still raise an exception; only unsupported/empty responses are classified as UNSUPPORTED.
- What happens when the adapter returns `b""` (empty bytes) for VIN PID? → Classified as EMPTY_RESPONSE, returns UNSUPPORTED.
- What happens when a mock adapter returns `b""` for an unsupported VIN command? → Classified as EMPTY_RESPONSE, returns UNSUPPORTED.

## Requirements

### Functional Requirements

- **FR-001**: The VIN read function MUST return a typed result object with the shape `{status, vin, reason?}` instead of a bare string or throwing on unsupported responses.
- **FR-002**: The `status` field MUST be one of `"SUPPORTED"` or `"UNSUPPORTED"`.
- **FR-003**: When VIN is SUPPORTED, the result MUST include `vin` as a 17-character decoded VIN string and MUST NOT include a `reason` field.
- **FR-004**: When VIN is UNSUPPORTED, the result MUST include `vin` as `null` and SHOULD include a `reason` field with one of: `"NO_DATA"`, `"ALL_FF"`, `"MALFORMED"`, `"EMPTY_RESPONSE"`.
- **FR-005**: All-FF VIN payload (17 bytes of 0xFF after the 4902 prefix) MUST be classified as UNSUPPORTED with reason `"ALL_FF"`.
- **FR-006**: Empty adapter response (adapter returns `b""` for VIN PID) MUST be classified as UNSUPPORTED with reason `"EMPTY_RESPONSE"`.
- **FR-007**: "NO DATA" response from real ELM327 adapters MUST be classified as UNSUPPORTED with reason `"NO_DATA"`.
- **FR-008**: Malformed VIN responses (valid prefix but invalid decoded content or wrong length) MUST be classified as UNSUPPORTED with reason `"MALFORMED"`.
- **FR-009**: The VIN read function MUST NOT throw exceptions for unsupported or malformed VIN responses — only for genuine transport/adapter failures.
- **FR-010**: Vehicle health workflows (`execute_vehicle_data_read`, `execute_scan`) MUST continue successfully when VIN is reported as UNSUPPORTED.
- **FR-011**: Backward compatibility MUST be maintained: existing code that expects a VIN string when VIN is supported MUST still receive a valid string.
- **FR-012**: All existing behavior MUST remain compatible. Existing supported-VIN flows must still expose the VIN string to callers that need it, either through `VinResult.vin` or a small compatibility helper.

### Key Entities

- **VinResult**: A typed result representing the outcome of a VIN read attempt. Fields: `status` (SUPPORTED | UNSUPPORTED), `vin` (string | null), `reason` (NO_DATA | ALL_FF | MALFORMED | EMPTY_RESPONSE | null). This replaces the previous pattern of returning a string on success or throwing RuntimeError on unsupported VIN.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Vehicle health scan completes successfully for the `toyota_real_sample` profile (previously crashed) and reports VIN as UNSUPPORTED.
- **SC-002**: Vehicle health scan completes successfully for the `unsupported_vin` profile and reports VIN as UNSUPPORTED.
- **SC-003**: Vehicle health scan completes successfully for the `default` profile and reports VIN as SUPPORTED with a valid 17-character VIN string.
- **SC-004**: All existing tests pass without modification — no regressions in backward-compatible behavior.
- **SC-005**: All-FF VIN payload, NO DATA response, malformed VIN, and empty response each produce a distinct UNSUPPORTED result with the appropriate reason, without throwing exceptions.
- **SC-006**: The `execute_scan` workflow does not abort when VIN is unsupported — it continues to read fault codes and emit events.

## Assumptions

- The typed result shape is introduced in the Python desktop-agent module only; the backend API contract for VIN data already includes a `supported` boolean field in vehicle data events, so the new result shape aligns with existing event payloads.
- Real transport/adapter failures (e.g., connection timeout, adapter disconnect) are distinct from unsupported VIN responses and should still raise exceptions to signal real failures.
- The existing `execute_vehicle_data_read` function already wraps `read_vin()` in a try/except and maps exceptions to `{supported: False}` — this behavior will be replaced with direct use of the typed result, simplifying the code.
- The `execute_scan` function currently does not wrap `read_vin()` in error handling — this will be updated to use the typed result.
- UDS VIN discovery (22F190) and Mode 09 PID discovery (0900–0909) are explicitly out of scope.
- Callers that need the VIN string can access it via `VinResult.vin` when status is SUPPORTED, or use a convenience helper if provided. The typed result is the canonical API; bare-string return is deprecated but accessible through the `vin` attribute for compatibility.