# Research: Freeze Frame Data (Feature 017)

**Date**: 2026-06-14
**Branch**: `017-freeze-frame-data`

## R1: SAE J1979 Mode 02 PID 01 Freeze Frame Response Format

**Decision**: Use standard SAE J1979 Mode 02 response format for freeze frame decoding.

**Rationale**: Mode 02 PID 01 (command `0201`) returns freeze frame data for the first stored DTC. The response format per SAE J1979 is:

```
42 01 [DTC_byte_1] [DTC_byte_2] [PID_num_1] [PID_value_bytes...] [PID_num_2] [PID_value_bytes...] ...
```

Where:
- `42 01` = Mode 02 PID 01 response header (analogous to `41 01` for Mode 01)
- `DTC_byte_1`, `DTC_byte_2` = 2-byte DTC code using standard SAE encoding:
  - DTC_byte_1 high nibble: type (0=P, 1=C, 2=B, 3=U)
  - DTC_byte_1 low nibble + DTC_byte_2: numeric portion
  - Example: `01 01` → P0101, `03 00` → P0300
- Following bytes: alternating PID number and PID value bytes
  - PID 04 (engine load): 1 byte value
  - PID 05 (coolant temp): 1 byte value (offset by -40°C)
  - PID 0C (RPM): 2 byte value (A * 256 + B) / 4
  - PID 0D (vehicle speed): 1 byte value (km/h)

**Example freeze frame response**:
```
42 01 01 03 04 3A 05 5B 0C 1A 98 0D 48
```
Decodes as:
- Header: `42 01` (Mode 02, PID 01 response)
- DTC: `01 03` → P0103
- PID 04 (engine load): `3A` = 58%
- PID 05 (coolant temp): `5B` = 91°C (0x5B = 91, 91 - 40 = 51? No: 0x5B = 91, 91 - 40 = 51°C. Wait — for freeze frame, the encoding is the same as Mode 01)
  - Actually: coolant temp = value - 40 = 0x5B - 40 = 91 - 40 = 51°C. Hmm, the spec example says 91°C. Let me verify: `05 5B` — 0x5B = 91, coolant = 91 - 40 = 51°C.
  - For 91°C, the value would be 91 + 40 = 131 = 0x83. So `05 83` would represent 91°C.
- PID 0C (RPM): `1A 98` → (0x1A * 256 + 0x98) / 4 = (26 * 256 + 152) / 4 = (6656 + 152) / 4 = 6808 / 4 = 1702 RPM
  - Wait, spec example says 2450 RPM. (2450 * 4) = 9800 = 0x2648. So RPM bytes would be `26 48`.
- PID 0D (speed): `48` = 72 km/h ✓

The exact byte values in mock data will be constructed to produce the spec example values (RPM 2450, speed 72, load 58, coolant 91°C).

**MVP PID encoding reference**:

| PID | Bytes | Formula | Unit |
|-----|-------|---------|------|
| 04  | 1     | value * 100 / 255 | % |
| 05  | 1     | value - 40 | °C |
| 0C  | 2     | (A * 256 + B) / 4 | RPM |
| 0D  | 1     | value | km/h |

**Alternatives considered**:
- Decoding all PIDs in the response: Rejected for MVP — spec FR-012 limits MVP to four PIDs. Unknown PIDs preserved in raw form under `additionalPids`.
- Using a separate PID lookup table: Deferred — the four MVP PIDs are hardcoded in the parser.

## R2: SAE J1979 DTC Encoding in Freeze Frame

**Decision**: Use standard SAE J1979 DTC encoding, identical to Mode 03 DTC parsing.

**Rationale**: The DTC in freeze frame uses the same 2-byte encoding as Mode 03:

| Byte 1 High Nibble | DTC Type | Prefix |
|--------------------|----------|--------|
| 0x0                | Powertrain | P     |
| 0x1                | Chassis    | C     |
| 0x2                | Body       | B     |
| 0x3                | Network    | U     |

DTC format: `[Type nibble][Byte 1 bits 3-0][Byte 2]`
Example: `01 03` → Type=P, digits=0103 → P0103
Example: `03 01` → Type=P, digits=0301 → P0301

The existing `parse_dtcs()` function in `elm_parser.py` already implements this encoding. The freeze frame parser will reuse the same DTC decoding logic.

**Alternatives considered**:
- Inline DTC decoding: Acceptable but should extract a shared `_decode_dtc_byte_pair()` helper to avoid duplication with `parse_dtcs()`.

## R3: Existing `parse_dtcs()` Reuse for DTC Decoding

**Decision**: Extract a `_decode_dtc_byte_pair(byte1, byte2)` helper function from `parse_dtcs()` and reuse it in `parse_freeze_frame()`.

**Rationale**: The DTC encoding logic in `parse_dtcs()` (at `elm_parser.py` lines 189-260) decodes 2-byte DTC codes from Mode 03 responses. The freeze frame parser needs to decode a single 2-byte DTC code from Mode 02 responses using the identical encoding. Extracting a shared helper avoids duplication and ensures consistency.

**Action items**:
1. Extract `_decode_dtc_byte_pair(byte1_hex, byte2_hex)` from `parse_dtcs()`
2. Use the same helper in `parse_freeze_frame()` for the DTC bytes after the `4201` header

**Alternatives considered**:
- Inline DTC decoding in the freeze frame parser: Creates duplication and risk of encoding divergence
- Calling `parse_dtcs()` directly: Rejected — `parse_dtcs()` expects Mode 03 format with multiple DTC codes, not a single DTC from Mode 02

## R4: Freeze Frame Result Shape

**Decision**: Use a result shape consistent with the `ReadinessResult` pattern — outer `supported`/`value` wrapper with structured inner payload.

**Rationale**: The `FreezeFrameResult` entity defined in the spec has these fields:
- `supported` (boolean) — whether Mode 02 is supported
- `available` (boolean) — whether freeze frame data exists
- `dtc` (string or null) — the DTC code that triggered the freeze frame
- `rpm` (number or null) — engine RPM at time of fault
- `speed` (number or null) — vehicle speed in km/h
- `coolantTemperature` (number or null) — coolant temperature in °C
- `engineLoad` (number or null) — calculated engine load %
- `additionalPids` (object or null) — additional PID values beyond the four MVP PIDs
- `rawResponse` (string) — raw ECU response hex

The implementation shape follows the `read_readiness_monitors()` pattern:

**Supported + Available** (freeze frame data exists):
```python
{
    "supported": True,
    "available": True,
    "value": {
        "dtc": "P0301",
        "rpm": 2450,
        "speed": 72,
        "coolantTemperature": 91,
        "engineLoad": 58,
        "additionalPids": {},
        "rawResponse": "42010103043A05830C26480D48"
    }
}
```

**Supported + Unavailable** (Mode 02 works, no snapshot):
```python
{
    "supported": True,
    "available": False,
    "value": {}
}
```

Note: The `supported: true, available: false` state is a **desired state model**. Actual ECU behavior for "no freeze frame" must be validated during research (see R7). Possible outcomes include valid empty response, DTC = 0000, NO DATA, or unsupported response.

**Unsupported** (Mode 02 not supported or NO DATA):
```python
{
    "supported": False,
    "available": False,
    "value": {}
}
```

**Alternatives considered**:
- Flat structure without `value` wrapper: Rejected — breaks consistency with `ReadinessResult` pattern
- Separate `FreezeFrameResult` dataclass: Deferred — the `ReadinessResult` uses a plain dict, so freeze frame should too for consistency

## R5: `_send_pid()` Reuse for Mode 02

**Decision**: Reuse the existing `_send_pid()` helper for Mode 02 commands.

**Rationale**: The `_send_pid()` function at `vehicle_data.py:27-48` already handles:
- Sending a command via `adapter.send()`
- Cleaning the response via `compact_raw_response()`
- Checking for adapter errors via `is_adapter_error_response()`
- Validating hex characters
- Returning `None` for any error condition

Mode 02 commands use the same format as Mode 01 commands: `0201` for freeze frame. The `_send_pid()` function accepts `mode` and `pid` as separate parameters, so `read_freeze_frame()` calls `_send_pid(adapter, "02", "01")`.

**Implementation pattern**:
```python
def read_freeze_frame(adapter: BaseAdapter) -> dict:
    hex_str = _send_pid(adapter, "02", "01")
    if hex_str is None:
        return {"supported": False, "available": False, "value": {}}
    result = parse_freeze_frame(hex_str)
    if result is None:
        return {"supported": False, "available": False, "value": {}}
    return {"supported": True, "available": True, "value": result}
```

**Alternatives considered**:
- Direct `adapter.send("0201")` without `_send_pid()`: Rejected — would skip response cleaning and error checking
- A new `_send_mode_02()` helper: Rejected — unnecessary; `_send_pid()` already handles arbitrary mode/pid combos

## R6: Mock Profile Freeze Frame Data

**Decision**: Add `PID_RESPONSES["0201"]` entries to mock profiles that support freeze frame. Add `"0201"` to `UNSUPPORTED_COMMANDS` for profiles that do not.

**Rationale**: Following the readiness monitors pattern (Feature 016), mock profiles store raw OBD response bytes in `PID_RESPONSES`. The freeze frame command `0201` will be stored the same way. Profiles without freeze frame support will list `0201` in `UNSUPPORTED_COMMANDS`.

**Mock profile assignments**:

| Profile | Freeze Frame Support | `PID_RESPONSES["0201"]` | Notes |
|---------|---------------------|------------------------|-------|
| `default` | Supported + available | `bytes.fromhex("42010103043A05830C26480D48")` | P0103, load 58%, coolant 91°C, RPM 2450, speed 72 km/h |
| `no_faults` | Supported + unavailable | Response with DTC 0000 or no PID pairs | Actual behavior TBD by research |
| `with_faults` | Supported + available | `bytes.fromhex("42010103043A05830C26480D48")` | Same as default for consistency |
| `unsupported_vin` | Unsupported | `"0201"` in `UNSUPPORTED_COMMANDS` | Vehicle doesn't support Mode 02 |
| `toyota_real_sample` | TBD | Based on real Toyota probe | See R7 |
| `toyota_real_faults` | Supported + available | Based on real Toyota probe | See R7 |

**Important**: Mock profile `0201` data MUST NOT be updated until `parse_freeze_frame()` tests pass with known OBD-II example data. This follows the "parser first" constraint from the planning requirements.

**Alternatives considered**:
- Storing decoded freeze frame data in profiles: Rejected — raw bytes are the single source of truth (FR-004)
- Using a separate `FREEZE_FRAME` attribute: Rejected — follows the readiness monitors lesson; raw bytes in `PID_RESPONSES` are sufficient

## R7: Real Toyota 0201 Probe (Required Regression Activity)

**Decision**: Run a real adapter probe with command `0201` on the Toyota vehicle used in Feature 013 and Feature 016. This probe is a required research and regression activity before feature closure, but it is not a prerequisite for implementation.

**Rationale**: The spec (FR-001, Pre-Implementation Probe) requires validating real ECU behavior. The Toyota vehicle is currently not available, so this is documented as a deferred activity. Implementation proceeds using SAE J1979 standard examples and mock profiles. When the Toyota becomes available, the captured 0201 response is added as a regression test.

**Research questions to answer when Toyota is available**:

1. What does the Toyota vehicle return for `0201`?
2. What does the Toyota vehicle return when no freeze frame exists?
3. Is NO DATA considered unsupported or simply no stored snapshot for this ECU?
4. Does the current ELM327 adapter require any special handling for Mode 02 responses?

**If Toyota is unavailable during implementation**:
- Use SAE J1979 standard example data for parser tests
- Mark Toyota-specific tests as deferred
- Add a TODO in `research.md` to capture Toyota results when available
- Mock profiles for `toyota_real_sample` and `toyota_real_faults` will use placeholder `0201` data based on SAE J1979 examples
- Implementation is not blocked by Toyota vehicle availability

**If Toyota returns NO DATA**:
- Treat as valid regression result
- Document behavior in `research.md`
- Add `0201` to Toyota mock profile's `UNSUPPORTED_COMMANDS` or use appropriate response

## R8: "Supported + Unavailable" ECU Behavior Validation

**Decision**: The `supported: true, available: false` state is a desired state model. Actual ECU behavior must be validated during research. Implementation must handle all observed ECU behaviors without hardcoding assumptions.

**Rationale**: The spec (FR-002, Correction 2) explicitly states that the supported/unavailable distinction must be validated through real adapter testing. Possible ECU behaviors when no freeze frame exists include:

1. **Valid response with DTC = 0000**: Some ECUs return a valid Mode 02 response with the DTC bytes as `00 00` and no PID value pairs. The parser should treat this as `supported: true, available: false`.

2. **Valid response with zero-value DTC and PID pairs**: Some ECUs return a full freeze frame structure even when no DTC is set, with all values at zero. The parser should decode this as `supported: true, available: true` with DTC `P0000` (or a generic "no DTC" indicator).

3. **NO DATA**: The ECU returns NO DATA, which could mean either "Mode 02 is not supported" or "no freeze frame is stored." The parser should treat NO DATA as `supported: false, available: false` since it cannot distinguish between these two cases.

4. **Unsupported response**: Some ECUs return an error or non-standard response. The parser should treat this as `supported: false, available: false`.

**Implementation approach**:
- `parse_freeze_frame()` returns `None` for any unparseable response (NO DATA, empty, invalid hex, invalid length)
- `read_freeze_frame()` maps `None` from parser to `{"supported": False, "available": False, "value": {}}`
- Valid responses with `DTC = 0000` and no PID pairs are mapped to `{"supported": True, "available": False, "value": {}}`
- Valid responses with actual DTC and PID data are mapped to `{"supported": True, "available": True, "value": {...}}`
- The exact mapping for "DTC = 0000 with PID pairs" is TBD based on research — currently treated as available

**Alternatives considered**:
- Hardcoding `supported: true, available: false` for all non-NO-DATA empty responses: Rejected — must follow verified ECU behavior
- Returning `supported: false` for DTC = 0000 responses: Too aggressive — a DTC of 0000 may legitimately indicate "no freeze frame" on some ECUs

## R9: Implementation Order — Parser First

**Decision**: Implementation must follow this strict order:

1. **Known OBD-II examples** — Construct test hex strings from SAE J1979 specification examples
2. **Parser tests** — Write `test_freeze_frame.py` with test cases for all known OBD-II examples, edge cases, and error conditions
3. **Parser implementation** — Implement `parse_freeze_frame(hex_str)` in `vehicle_data.py` to pass all tests
4. **Read function** — Implement `read_freeze_frame(adapter)` in `vehicle_data.py` using `_send_pid()` pattern
5. **Mock profile updates** — Add `PID_RESPONSES["0201"]` data to mock profiles (only after parser tests pass)
6. **Workflow integration** — Add `vehicle_health["freezeFrame"] = read_freeze_frame(adapter)` to `main.py`
7. **Integration tests** — Write mock adapter integration tests and verify event payload shape

**Rationale**: The spec (Correction 4) requires parser-first implementation. Mock profile data must not be updated before parser validation passes. This ensures the parser is verified against known OBD-II examples before being tested with mock adapter data.

**Alternatives considered**:
- Implementation in arbitrary order: Rejected — risks parser assumptions going unvalidated
- Mock profiles first, parser later: Rejected — violates "parser is the source of truth" principle

## R10: Parser Test Cases

**Decision**: Create comprehensive parser tests covering all spec edge cases before implementing the parser.

**Test cases for `parse_freeze_frame()`**:

1. **Valid freeze frame with all 4 MVP PIDs**: Input `42010103043A05830C26480D48` → DTC P0103, load 58%, coolant 91°C, RPM 2450, speed 72 km/h
2. **Valid freeze frame with partial PIDs** (only DTC + RPM): Input with PID 0C only → DTC decoded, RPM decoded, other MVP PIDs as `null`
3. **DTC = 0000 (no freeze frame DTC)**: Input `42010000043A0D48` → DTC P0000, load and speed decoded
4. **NO DATA response**: Input `"NO DATA"` → returns `None`
5. **Empty response**: Input `""` → returns `None`
6. **Invalid hex characters**: Input `"4201ZZ03043A"` → returns `None`
7. **Response too short** (no PID data after DTC): Input `42010103` → DTC decoded, all MVP PIDs as `null`
8. **Prefix mismatch** (not `4201`): Input `"41010103043A"` → returns `None`
9. **Unknown PIDs mixed with known PIDs**: Input with PID 04, 05, 0C, 0D, plus PID 0F (air intake temp) → MVP PIDs decoded, PID 0F preserved in `additionalPids` as raw hex
10. **Multiple DTCs but single freeze frame**: Parser returns only the first freeze frame (per OBD-II standard)
11. **Prompt-terminated response**: Input `"42010103043A05830C26480D48\r\n>"` → cleaned by `compact_raw_response()` before reaching parser, so parser only sees clean hex

**Edge case note**: Test cases 4 and 5 are handled by `_send_pid()` returning `None` before the parser is called. The parser itself only receives clean hex strings. The parser should still validate the input format as a safety measure.

## R11: `additionalPids` Field Design

**Decision**: The `additionalPids` field stores raw PID values as a dict keyed by PID number string, with hex string values. No decoding beyond the 4 MVP PIDs is required for MVP.

**Rationale**: The spec (FR-013, Correction 3) limits MVP decoding to PIDs 04, 05, 0C, and 0D. Any other PIDs found in the freeze frame response are preserved in raw form under `additionalPids` without mandatory decoding.

**Shape**:
```python
"additionalPids": {
    "0F": "4B",   # Air intake temp, raw hex value
    "23": "01A4", # Fuel pressure, raw hex value
}
```

If no additional PIDs are present, `additionalPids` is an empty dict `{}`.

**Alternatives considered**:
- Decoding all PIDs in the response: Rejected — violates MVP scope constraint
- Omitting additional PIDs entirely: Rejected — FR-013 requires preserving them in raw form for debugging

## R12: Vehicle Data Read Integration

**Decision**: Add `read_freeze_frame(adapter)` call to `execute_vehicle_data_read()` in `main.py`, adding the result under `vehicle_health["freezeFrame"]`.

**Rationale**: Following the existing pattern in `main.py:118-150`, where additional data is added to the `vehicle_health` dict:

```python
vehicle_health["freezeFrame"] = read_freeze_frame(adapter)
```

This places the freeze frame result alongside `readinessMonitors`, `fuelSystemStatus`, `supportedPids`, and `mileage` in the `VEHICLE_DATA_READ` event payload.

**Alternatives considered**:
- Separate event type: Rejected — FR-015 requires inclusion in `VEHICLE_DATA_READ` payload
- Conditional read (only when DTCs exist): Deferred — always reading avoids complexity; the parser handles unsupported/unavailable gracefully

---

## R12: Toyota 0201 Real Vehicle Probe (TODO)

**Decision**: Required pre-closure activity to validate real Toyota 0201 freeze frame behavior.

**Status**: TODO — Blocked until Toyota vehicle access is available.

**When the Toyota vehicle is available, complete the following steps**:

1. Send command `0201` to the Toyota ELM327 adapter
2. Capture the raw adapter response (before `compact_raw_response()`)
3. Capture the cleaned response after `compact_raw_response()`
4. Document whether a freeze frame exists (vehicle with stored DTCs)
5. Document whether the ECU reports NO DATA or unsupported (vehicle with no stored DTCs)
6. Add the captured response as a regression test in `desktop-agent/tests/test_toyota_regression.py`
7. Update `desktop-agent/src/obd/mock_profiles/toyota_real_sample.py` with real data (replace placeholder DTC P0000)
8. Update `desktop-agent/src/obd/mock_profiles/toyota_real_faults.py` with real data (replace placeholder SAE J1979 values)
9. Validate that `read_freeze_frame()` correctly handles the real Toyota responses
10. Verify the DTC P0000 → `supported: true, available: false` mapping against real Toyota behavior

**Rationale**: The current implementation uses SAE J1979 standard example data as placeholders for Toyota profiles. Real vehicle validation is essential to confirm that:
- The freeze frame response format matches our parser assumptions
- The DTC P0000 "supported but unavailable" state mapping is correct for Toyota ECUs
- The `additionalPids` handling for unknown PIDs works with real data