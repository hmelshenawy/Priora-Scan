# Research: Realistic OBD Mock Profiles

**Feature**: 011-obd-mock-profiles | **Date**: 2026-06-14

## Research Task 1: MockObdAdapter Interface & Duck-Typing

**Question**: How does MockObdAdapter interact with the rest of the system, and what must be preserved for backward compatibility?

**Decision**: MockObdAdapter uses duck-typing (no BaseAdapter inheritance) and the system accesses it through four methods: `connect()`, `is_connected()`, `send()`, `close()`, plus attributes `adapter_type`, `protocol`, and `fault_metadata`.

**Rationale**: The adapter is consumed by `main.py` (factory), `vin.py` (branches on `adapter_type`), `dtc.py` (reads `fault_metadata`), `vehicle_data.py` (calls `send()`), and `heartbeat.py` (reads `adapter_type`, `protocol`). All these consumers must work unchanged.

**Alternatives Considered**:
- Making MockObdAdapter inherit from BaseAdapter — rejected because vin.py explicitly checks `adapter_type == "MOCK"` to choose a different decode path, and the duck-typing is well-established in tests.
- Changing the adapter interface — rejected as a breaking change with no benefit.

## Research Task 2: vin.py Branching on adapter_type

**Question**: How does `read_vin()` handle the mock adapter vs real adapters, and how must profiles interact with this?

**Decision**: `vin.py` branches on `adapter_type`: if `"MOCK"` or `None`, it uses `_read_vin_mock()` (simple hex decode). For real adapters, it uses `elm_parser.parse_vin()`. Mock profiles must produce responses compatible with `_read_vin_mock()` — i.e., the profile's VIN response must be a clean hex string starting with `"4902"` followed by ASCII-encoded VIN bytes.

**Rationale**: The `unsupported_vin` profile must produce the all-FF payload (`490201FFFFFF FFFFFFFFFFFFFFFF FFFFFFFFFFFFFF`). When `_read_vin_mock()` decodes this, it will get invalid characters. The `vin.py` code currently raises `RuntimeError("Invalid VIN length")` for non-17-char results. The spec requires displaying "Not supported by vehicle" without workflow failure — so either `vin.py` needs a small enhancement to handle the all-FF case gracefully, OR the profile should return an empty bytes response which causes `_send_pid` to return `None` and triggers the unsupported path in `vehicle_data.py`.

**Alternatives Considered**:
- Return `"NO DATA"` as bytes from the profile for unsupported VIN — this would make `read_vin()` follow the NO DATA path in the ELM parser, but since mock uses `_read_vin_mock()`, we need the profile to signal "unsupported" in a way `_read_vin_mock()` can detect.
- Return `b""` (empty bytes) — this causes `raw.decode()` to succeed but produce a hex string not starting with `"4902"`, raising `"Unexpected VIN response"`.
- Best approach: Return the raw all-FF hex as the spec requires (`490201FFFFFF...`), and add a graceful handling path in `_read_vin_mock()` that detects the all-0xFF data payload and raises a descriptive `RuntimeError("VIN not supported by vehicle")` that the caller can catch and display.

## Research Task 3: Profile Response Format

**Question**: What format should profile responses use — raw `bytes` objects or hex strings?

**Decision**: Profiles return `bytes` objects, matching the current `MockObdAdapter.send()` return type. This is consistent with how real adapters work and requires no changes to command modules.

**Rationale**: All command modules (`vin.py`, `dtc.py`, `vehicle_data.py`, `clear_dtc.py`) call `adapter.send()` and receive `bytes`. Returning `bytes` from profiles maintains this contract. The profile definition can use hex strings internally for readability (e.g., `bytes.fromhex("410C0E10")`), but the output must be `bytes`.

## Research Task 4: DTC Clear State (Stateful vs Stateless Profiles)

**Question**: The current MockObdAdapter has mutable state (`_dtcs_cleared`, `_dtcs_logged`). Should profiles be stateful?

**Decision**: Profiles are stateless data containers. The `MockObdAdapter` retains its stateful behavior but delegates response lookup to the active profile. When `_dtcs_cleared` is `True`, the adapter overrides profile DTC responses with zero-code responses, exactly as it does today.

**Rationale**: Separating data (profiles) from behavior (adapter) follows the constitution's principle of single responsibility. The adapter's state mutation for DTC clear is behavioral, not profile data. The `default` profile must reproduce current behavior, so the adapter handles the `send("04")` → set `_dtcs_cleared` flow internally, regardless of which profile is active.

## Research Task 5: LiveData Mock Generator Integration

**Question**: Should `MockLiveDataGenerator` also use mock profiles?

**Decision**: No. The `MockLiveDataGenerator` is a separate system that produces random-jitter live data for streaming. Mock profiles address one-shot OBD command responses (scan, VIN, DTC, vehicle health). Live data streaming has different semantics (continuous polling with drift) and is out of scope per FR exclusions ("Live streaming simulation").

**Rationale**: The spec explicitly excludes live streaming simulation. The `MockLiveDataGenerator` can be enhanced later by adding a `from_profile()` class method that creates a generator from profile data, but this is a future concern.

## Research Task 6: Profile Registry Discovery Pattern

**Question**: How should the profile registry discover available profiles — static mapping, dynamic import, or configuration file?

**Decision**: Static mapping in `profile_registry.py`. A `PROFILES` dict maps profile name strings to their module import functions. Adding a new profile requires: (1) creating the profile module file, and (2) adding one line to the `PROFILES` dict.

**Rationale**: The spec requirement SC-008 states "a new profile can be added by creating a single module file without modifying any existing profile code." A static registry mapping satisfies this — existing profile code is not modified, only the registry gains one line. Dynamic import (scanning a directory) was considered but adds complexity and potential security concerns for no real benefit with only 5 profiles. A configuration file is unnecessary overhead.

## Research Task 7: OBD_MOCK_PROFILE Environment Variable

**Question**: Where should `OBD_MOCK_PROFILE` be read and how should it interact with existing config?

**Decision**: Add `OBD_MOCK_PROFILE` to `config.py` alongside existing OBD config. It's read at import time (like other config values). The `profile_registry.py` reads it from config. When `OBD_MOCK` is not `true`, the `OBD_MOCK_PROFILE` variable is ignored.

**Rationale**: Consistent with the existing config pattern where all env vars are centralized in `config.py`. The registry uses the config module rather than calling `os.getenv()` directly, maintaining the single-source-of-truth pattern established by `_OBD_MOCK` and `OBD_ADAPTER_TYPE`.

## Research Task 8: Toyota Real Sample Data Verification

**Question**: Do the captured OBD response values in the spec decode correctly to the stated human-readable values?

**Decision**: Verified all captured values decode correctly:

| Command | Raw Response | Decode | Result |
|---------|-------------|--------|--------|
| 0100 | 4100BE1FB813 | PID bitmask | PIDs 01,03,04,05,06,07,0F,1F supported |
| 010C | 410C0E10 | (0E×256+10)/4 | 900 RPM ✅ |
| 010D | 410D00 | 0 | 0 km/h ✅ |
| 0105 | 41057E | 7E-40 | 86°C ✅ |
| 0104 | 410476 | 76×100/255 | 46.3% ✅ |
| 0142 | 41423469 | (34×256+69)/1000 | 13.417V ✅ |
| 012F | NO DATA | unsupported | — |
| 0902 | 490201FFFFFF... | all-FF | VIN unavailable ✅ |

**Rationale**: All decoded values match the spec. The `4100BE1FB813` supported PID mask differs slightly from the default profile's `4100BE1FB820` — the Toyota vehicle doesn't support PID 20 (PIDs 21-40), which is correct for a real vehicle with limited PID support.

## Research Task 9: default Profile Backward Compatibility

**Question**: What exact values must the `default` profile reproduce from the current `MockObdAdapter`?

**Decision**: The `default` profile must reproduce every response from `MockObdAdapter.send()` exactly, including:

| Command | Response |
|---------|----------|
| 0902 | `b"490257314B4146344742315246313234333231"` (VIN: W1KAF4GB1RF124321) |
| 03 (pre-clear) | `b"43020301C100"` |
| 07 (pre-clear) | `b"47010171"` |
| 0A | `b"4A00"` |
| 0101 | `b"41010007FF07EF"` |
| 0103 | `b"41030200"` |
| 0104 | `b"410480"` |
| 012F | `b"412FCC"` |
| 0131 | `b"41312710"` |
| 0142 | `b"414236D4"` |
| 0100 | `b"4100BE1FB820"` |
| 0120 | `b"412081008402"` |
| 0900 | `b"490002000000"` |
| 04 | `b"44"` (sets `_dtcs_cleared=True`) |

Plus the `fault_metadata` dict: P0301→ACTIVE/ECM, P0171→PENDING/ECM, U0100→ACTIVE/TCM.

**Rationale**: Exact reproduction ensures all existing tests pass without modification (FR-012, SC-007).

## Research Task 10: Toyota Real Faults Profile

**Question**: What should the `toyota_real_faults` profile contain, and how does it relate to `toyota_real_sample`?

**Decision**: The `toyota_real_faults` profile combines the `toyota_real_sample` vehicle health data (identical PID responses) with fault codes P0301, P0171, and U0100. This enables testing Vehicle Health and DTC workflows simultaneously with real-captured data. The fault codes are shared with `with_faults` for enrichment consistency.

**Rationale**: During field testing, a vehicle may exhibit both health data characteristics and fault codes. Having a profile that combines both allows developers to test the full diagnostic pipeline (health read → DTC scan → enrichment → display) without switching profiles. The `toyota_real_sample` profile remains clean (no faults) for focused health testing, while `toyota_real_faults` enables integrated testing.

**Alternatives Considered**:
- Profile composition/inheritance (sharing PID data between profiles) — rejected because the spec requires each profile module to be self-contained and independent. Duplication of PID data across two Toyota profiles is acceptable given the small data size.
- Using `with_faults` for combined testing — rejected because `with_faults` uses generic health data, not real-captured Toyota responses.

## Research Task 11: Readiness Monitors in Profile Architecture

**Question**: Should profiles include readiness monitor data, and if so, what format?

**Decision**: Add an optional `readiness_monitors` field to the profile model. When present, it provides readiness monitor data as a dict (e.g., `{"misfire": true, "fuelSystem": true, "catalyst": false}`). When absent (`None`), PID 0101 returns `b""` and Vehicle Health reports readiness as `{"supported": false}`. Actual PID 0101 response generation from readiness monitor data is NOT implemented in this feature.

**Rationale**: Including the architecture now prevents a future profile architecture change when PID 0101 readiness monitor support is added. The field is optional so existing profiles remain unchanged. The spec explicitly states "Do NOT require implementation of PID 0101 in this feature."

## Research Task 12: Raw OBD Response Storage Rationale

**Question**: Why must profiles store raw OBD response bytes rather than decoded values?

**Decision**: Profiles MUST store raw OBD response bytes (e.g., `bytes.fromhex("410C0E10")` for RPM 900) rather than decoded values (e.g., `{"rpm": 900}`). The existing parser/decoder code (`vehicle_data.py`, `dtc.py`, `vin.py`, `elm_parser.py`) MUST be the single source of truth for converting raw bytes to user-facing values.

**Rationale**: Storing raw bytes ensures:
1. The mock communication path exercises the same parser code as the real vehicle path — no separate mock-only decode logic
2. Bugs in parsers are caught during mock testing because mock data flows through the same parsers
3. Profile data matches what a real ECU returns, making it trivially verifiable against captured vehicle logs
4. Future changes to decode formulas only need updating in one place (the parser), not in profile definitions