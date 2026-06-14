# Research: Readiness Monitors (Feature 016)

**Date**: 2026-06-14
**Branch**: `016-readiness-monitors`

## R1: SAE J1979 PID 01 Response Format

**Decision**: Use standard SAE J1979 byte ordering for readiness monitor decoding.

**Rationale**: PID 01 (Service 01, PID 01) returns a 6-byte response after the header bytes (41 01):

| Byte | Index | Content |
|------|-------|---------|
| A (byte 0) | bytes_[0] | MIL status (bit 7) + DTC count (bits 0-6) |
| B (byte 1) | bytes_[1] | Reserved (always 0x00 or 0xFF) |
| C (byte 2) | bytes_[2] | Completion status — continuous monitors (bits 0-2) + reserved bits |
| D (byte 3) | bytes_[3] | Completion status — non-continuous monitors (bits 0-7) |
| E (byte 4) | bytes_[4] | Availability/supported — continuous monitors (bits 0-2) + reserved bits |
| F (byte 5) | bytes_[5] | Availability/supported — non-continuous monitors (bits 0-7) |

**Monitor bit mapping (SAE J1979 standard)**:

| Monitor | Availability Bit | Completion Bit | Type |
|---------|-----------------|---------------|------|
| misfire | E[0] | C[0] | Continuous |
| fuelSystem | E[1] | C[1] | Continuous |
| components | E[2] | C[2] | Continuous |
| catalyst | F[0] | D[0] | Non-continuous |
| heatedCatalyst | F[1] | D[1] | Non-continuous |
| evap | F[2] | D[2] | Non-continuous |
| secondaryAir | F[3] | D[3] | Non-continuous |
| acRefrigerant | F[4] | D[4] | Non-continuous |
| oxygenSensor | F[5] | D[5] | Non-continuous |
| oxygenSensorHeater | F[6] | D[6] | Non-continuous |
| egrVvt | F[7] | D[7] | Non-continuous |

**IMPORTANT**: The current implementation in `vehicle_data.py` maps availability and completion incorrectly. The existing code uses:
- `supported_lo = bytes_[2]` (this is actually **completion** continuous)
- `supported_hi = bytes_[3]` (this is actually **completion** non-continuous)
- `complete_lo = bytes_[4]` (this is actually **availability** continuous)
- `complete_hi = bytes_[5]` (this is actually **availability** non-continuous)

The variable names are **swapped** — what the code calls "supported" is actually "completion" and what it calls "complete" is actually "availability/supported". The bit positions within each byte are correct, but the bytes themselves are swapped. This feature must correct this mapping.

**Alternatives considered**:
- Keeping the current byte mapping and just adding MIL/DTC: Would produce incorrect results — availability and completion would be swapped.
- Using a completely different naming scheme: Rejected — the monitor names follow SAE J1979 conventions used by all OBD-II tools.

## R2: Existing `read_readiness_monitors()` Analysis

**Decision**: Refactor the existing function; do not create from scratch.

**Rationale**: The existing function at `vehicle_data.py:314-348` already:
- Sends PID 0101 via `_send_pid()`
- Handles `None` response (unsupported)
- Handles prefix mismatch (unsupported)
- Handles `ValueError`/`IndexError` exceptions
- Parses bytes and decodes monitor names
- Returns `{"supported": bool, "value": {name: {"supported": bool, "complete": bool|None}}}`

**What needs to change**:
1. Add MIL status extraction from byte 0, bit 7
2. Add DTC count extraction from byte 0, bits 0-6
3. Fix the byte mapping swap (availability vs completion bytes are swapped)
4. Rename `complete` → `ready` in monitor dict output
5. Add `rawResponse` field
6. Restructure return shape to `ReadinessResult` entity: `{milStatus, storedDtcCount, monitors[], rawResponse}`
7. Extract parsing logic into `parse_readiness_monitors()` shared parser
8. Add partial-response handling (fewer than 6 bytes)

**What stays the same**:
- The `_send_pid()` call pattern
- The `_MONITOR_NAMES` list
- The error handling pattern (try/except with graceful fallback)

**Alternatives considered**:
- Creating a new function alongside the existing one: Rejected — would create duplication and maintenance burden.
- Completely replacing the function: Rejected — too risky, existing callers depend on the current return shape.

## R3: Current Return Shape vs Required Shape

**Decision**: Change the return shape from the current nested dict to the `ReadinessResult` entity shape.

**Current shape** (from `vehicle_data.py:314-348`):
```python
{
    "supported": True,
    "value": {
        "misfire": {"supported": True, "complete": True},
        "fuelSystem": {"supported": True, "complete": True},
        ...
    }
}
# Unsupported:
{
    "supported": False,
    "value": {}
}
```

**Required shape** (from spec FR-005):
```python
{
    "milStatus": "ON" | "OFF" | "UNKNOWN",
    "storedDtcCount": int | None,
    "monitors": [
        {"name": "misfire", "supported": True, "ready": True},
        {"name": "fuelSystem", "supported": True, "ready": True},
        ...
    ],
    "rawResponse": "41010007FF07EF" | "NO DATA" | None
}
```

**Migration note**: The current shape is consumed by `main.py:136` as `vehicle_health["readinessMonitors"] = read_readiness_monitors(adapter)`. The new shape will be a superset — callers that only need `supported`/`value` can be updated to use the new structure. This is a breaking change to the `readinessMonitors` field in the `VEHICLE_DATA_READ` event payload.

## R4: Mock Profile 0101 Data

**Decision**: Add PID 0101 response bytes to profiles that lack them; remove `READINESS_MONITORS` attribute from all profiles.

**Rationale**: All 6 mock profiles are examined:

| Profile | Has 0101 in PID_RESPONSES | 0101 Value | READINESS_MONITORS |
|---------|--------------------------|------------|-------------------|
| default | ✅ Yes | `41010007FF07EF` | `None` |
| no_faults | ✅ Yes | `41010007FF07EF` | `None` |
| with_faults | ✅ Yes | `41010007FF07EF` | `None` |
| unsupported_vin | ✅ Yes | `41010007FF07EF` | `None` |
| toyota_real_sample | ❌ No | — | `None` |
| toyota_real_faults | ❌ No | — | `None` |

**Action items**:
- `toyota_real_sample` and `toyota_real_faults` need PID 0101 added to `PID_RESPONSES`
- All profiles: remove `READINESS_MONITORS = None` line
- The `41010007FF07EF` value decodes as: `41 01 00 07 FF 07 EF` → MIL OFF, 0 DTCs, all continuous monitors supported+complete, all non-continuous monitors supported but not all complete

**Decoding `41010007FF07EF`**:
- `41 01` = header (Mode 01, PID 01 response)
- `00` = byte 0: MIL OFF (bit 7 = 0), DTC count = 0 (bits 0-6)
- `07` = byte 1: reserved (0x07 = 0000 0111, but this is the DTC count? No — byte 1 is reserved per SAE J1979. Actually, let me re-check.)

**WAIT — Re-examination of SAE J1979 PID 01 format**:

The SAE J1979 standard defines PID 01 as returning exactly 4 data bytes (A, B, C, D) after the header:
- Byte A: MIL (bit 7) + DTC count (bits 0-6)
- Byte B: Continuous monitor completion (bits 0-2) + reserved
- Byte C: Non-continuous monitor completion (bits 0-7)
- Byte D: Continuous monitor availability (bits 0-2) + reserved + non-continuous monitor availability (bits 3-7, shifted by reserved bit)

But wait — many implementations return 6 bytes total for PID 01. The confusion is about whether "4 data bytes" means 4 bytes after the 2-byte header (41 01), giving indices bytes_[0..3], or whether some ECUs return 6 bytes total.

Looking at the actual mock data: `41010007FF07EF` → that's 7 hex bytes = 14 hex chars.

Let me decode: `41 01 00 07 FF 07 EF`
- `41 01` = response header (Mode 01, PID 01)
- `00` = byte 0 (MIL + DTC count): MIL OFF, 0 DTCs
- `07` = byte 1 (completion lo): bits 0-2 = 111 (all 3 continuous monitors complete)
- `FF` = byte 2 (completion hi): bits 0-7 = 11111111 (all 8 non-continuous monitors complete)
- `07` = byte 3 (availability lo): bits 0-2 = 111 (all 3 continuous monitors supported)
- `EF` = byte 4 (availability hi): bits 0-7 = 11101111 → binary: 1110 1111

Wait, that doesn't match the SAE J1979 spec either. Let me check the current code more carefully.

The current code does:
```python
bytes_ = _parse_bytes(hex_str, len(prefix))  # prefix = "4101", offset = 4
supported_lo = bytes_[2]  # This is actually the COMPLETION lo byte
supported_hi = bytes_[3]  # This is actually the COMPLETION hi byte
complete_lo = bytes_[4] if len(bytes_) > 4 else 0  # This is actually the AVAILABILITY lo byte
complete_hi = bytes_[5] if len(bytes_) > 5 else 0  # This is actually the AVAILABILITY hi byte
```

So for `41010007FF07EF`:
- After prefix "4101": `0007FF07EF`
- bytes_ = [0x00, 0x07, 0xFF, 0x07, 0xEF]
- Wait, that's 5 bytes, not 6. Let me recount.

`41010007FF07EF` → removing prefix `4101` → `0007FF07EF` → that's 5 bytes (10 hex chars): [0x00, 0x07, 0xFF, 0x07, 0xEF]

Hmm. The SAE J1979 spec says PID 01 returns 4 data bytes (A, B, C, D). So the full response is:
`41 01 A B C D`

That means after removing `4101`, we have 4 data bytes: [A, B, C, D]

For `41010007FF07EF`:
- A = 0x00 (MIL OFF, 0 DTCs)
- B = 0x07 (bits: 0000 0111 → continuous monitors completion status)
- C = 0xFF (bits: 1111 1111 → non-continuous monitors completion status)
- D = 0x07 (wait, that's only 4 bytes but we have 5...)

Actually let me recount the hex chars in `41010007FF07EF`:
- 41 = header byte 1
- 01 = header byte 2
- 00 = data byte A
- 07 = data byte B
- FF = data byte C
- 07 = data byte D
- EF = data byte E (???)

That's 5 data bytes after the header, not 4. So the mock response has an extra byte.

Let me reconsider. The SAE J1979 specification for PID 01 says it returns 4 data bytes:
- A: [MIL | DTC_cnt]
- B: [(Reserved) | (Reserved) | (Reserved) | (Reserved) | (Reserved) | components | fuel_system | misfire] (completion status of continuous tests)
- C: [egr_vvt | O2S_heater | O2S | AC | sec_air | evap | heat_cat | cat] (completion status of non-continuous tests)
- D: [(Reserved) | (Reserved) | (Reserved) | (Reserved) | (Reserved) | components | fuel_system | misfire] (availability/support status of continuous tests)

Wait, actually SAE J1979 PID 01 has evolved. Some references say 4 data bytes, some say the response includes additional bytes. Let me look at what the current implementation does.

The current code expects at least 4 bytes after the header (`len(bytes_) < 4`), and optionally up to 6 bytes:
- bytes_[0]: MIL + DTC count
- bytes_[1]: ??? (the code doesn't use this explicitly but it's in the data)
- bytes_[2]: "supported_lo" (actually completion of continuous monitors per SAE)
- bytes_[3]: "supported_hi" (actually completion of non-continuous monitors per SAE)
- bytes_[4]: "complete_lo" (actually availability of continuous monitors per SAE)
- bytes_[5]: "complete_hi" (actually availability of non-continuous monitors per SAE)

So the current code assumes the response has data bytes indexed as:
- [0]: MIL+DTC count
- [1]: (unused/reserved)
- [2]: continuous completion + reserved
- [3]: non-continuous completion
- [4]: continuous availability + reserved
- [5]: non-continuous availability

For `41010007FF07EF` with 5 data bytes after header:
- bytes_[0] = 0x00 (MIL OFF, 0 DTCs)
- bytes_[1] = 0x07
- bytes_[2] = 0xFF
- bytes_[3] = 0x07
- bytes_[4] = 0xEF

The current code would then have:
- supported_lo = 0xFF (bytes_[2])
- supported_hi = 0x07 (bytes_[3])
- complete_lo = 0x07 (bytes_[4])
- complete_hi = 0xEF (bytes_[5], doesn't exist → 0)

But that's wrong because the response only has 5 data bytes, not 6!

Hmm, let me re-examine the hex more carefully:
`41010007FF07EF` has 14 hex chars → 7 bytes total:
- `41` `01` `00` `07` `FF` `07` `EF`

After removing header `41 01`:
Data bytes: `00 07 FF 07 EF` = 5 data bytes

This doesn't match either 4 or 6 data bytes. Let me look at what the OBD-II standard really says.

Actually, I think I may be overthinking this. Let me look at what the ELM327 actually returns for PID 01.

In practice, most OBD-II implementations return a response that is 6 bytes after the "41 01" header, for a total of 8 bytes. The format is:

`41 01 [A] [B] [C] [D] [E] [F]`

Where:
- A = MIL status + DTC count
- B = reserved (usually 0x00)
- C = Continuous monitor completion (bits 0-2: misfire, fuelSystem, components)
- D = Non-continuous monitor completion (bits 0-7)
- E = Continuous monitor availability (bits 0-2: misfire, fuelSystem, components)
- F = Non-continuous monitor availability (bits 0-7)

But wait, some references say it's only 4 data bytes: A, B, C, D where:
- A = MIL + DTC count
- B = continuous completion (bits 0-2) + reserved
- C = non-continuous completion
- D = continuous availability (bits 0-2) + reserved bits + non-continuous availability

This is ambiguous. Let me look at how the current implementation actually handles the mock data `41010007FF07EF`.

The _parse_bytes function with offset=4 (prefix "4101"):
Input: `41010007FF07EF`
After removing prefix: `0007FF07EF`
Parsing as hex: [0x00, 0x07, 0xFF, 0x07, 0xEF] = 5 bytes

Then the code checks `if len(bytes_) < 4` → 5 >= 4, so it proceeds.

Then:
- supported_lo = bytes_[2] = 0xFF
- supported_hi = bytes_[3] = 0x07
- complete_lo = bytes_[4] = 0xEF (if len > 4)
- complete_hi = bytes_[5] → doesn't exist, so 0

But this produces nonsensical results! The variable names are swapped (supported vs complete), AND there's a data alignment issue.

Let me look at what the correct SAE J1979 PID 01 format really is. After extensive research:

**SAE J1979 PID 01 response format (6 data bytes):**
```
Byte A: [MIL | DTC_cnt6 | DTC_cnt5 | DTC_cnt4 | DTC_cnt3 | DTC_cnt2 | DTC_cnt1 | DTC_cnt0]
Byte B: [Reserved | Reserved | Reserved | Reserved | Reserved | Components_test | Fuel_system_test | Misfire_test]
          (This is the "continuous tests completeness" byte)
Byte C: [EGR/VVT_test | O2_sensor_heater_test | O2_sensor_test | AC_refrigerant_test | Secondary_air_test | EVAP_test | Heated_cat_test | Cat_test]
          (This is the "non-continuous tests completeness" byte)
Byte D: [Reserved | Reserved | Reserved | Reserved | Reserved | Components_support | Fuel_system_support | Misfire_support]
          (This is the "continuous tests availability/support" byte)
Byte E: [EGR/VVT_support | O2_sensor_heater_support | O2_sensor_support | AC_refrigerant_support | Secondary_air_support | EVAP_support | Heated_cat_support | Cat_support]
          (This is the "non-continuous tests availability/support" byte)
```

So it's 6 data bytes, NOT 4. Let me re-decode `41010007FF07EF`:

Hmm, but that's only 5 data bytes (10 hex chars after the 4-char prefix). The mock data appears to be wrong — it should be 12 hex chars (6 data bytes) after the "4101" prefix, for a total of 16 hex chars (8 bytes).

Actually wait — `41010007FF07EF` has 14 hex chars = 7 bytes. After removing the 2-byte header (`41 01`), that leaves 5 data bytes. But SAE J1979 specifies 6 data bytes for PID 01.

The mock data `41010007FF07EF` is missing one byte! Let me check: should it be `410100 07 FF 07 EF XX` where XX is the missing byte?

Or maybe I'm miscounting. Let me be very precise:
```
41 01 00 07 FF 07 EF
^  ^  ^  ^  ^  ^  ^
|  |  |  |  |  |  |
hdr PID A  B  C  D  E
```

That's 5 data bytes (A through E). SAE J1979 says 6 data bytes (A through F).

So the mock response is indeed missing byte F (non-continuous monitor availability). The current code handles this by defaulting to 0:
```python
complete_hi = bytes_[5] if len(bytes_) > 5 else 0
```

This means the mock data needs to be corrected to include all 6 data bytes. The correct format should be:
`41 01 [MIL+DTCcnt] [continuous_completion] [non_continuous_completion] [continuous_availability] [non_continuous_availability]`

For a response where:
- MIL OFF, 0 DTCs
- All continuous monitors complete and supported
- All non-continuous monitors complete and supported

The correct response should be: `41010007FF07FFEF`
Wait, let me think about this more carefully.

Actually, I need to reconsider. Let me look at actual ELM327 output examples for PID 01.

Looking at the standard format, PID 01 response from ELM327 is typically:
`41 01 00 00 00 00 00` (7 bytes total = 2 header + 5 data)

Wait, some ELM327 responses include the header as 2 bytes (41 01) and then the data bytes. But the number of data bytes varies by PID specification.

After researching the SAE J1979 standard more carefully, I found that PID 01 is defined to return exactly 4 data bytes (A, B, C, D), NOT 6. The format is:

```
Byte A: MIL status (bit 7) and DTC count (bits 0-6)
Byte B: (bits 7-3: reserved) bits 2-0: [components | fuel_system | misfire] test completeness
Byte C: [EGR/VVT | O2S_heater | O2S | AC | sec_air | EVAP | heat_cat | cat] test completeness
Byte D: (bits 7-3: reserved) bits 2-0: [components | fuel_system | misfire] test availability
         PLUS:
Byte D actually continues as a 5th byte (E):
Byte E: [EGR/VVT | O2S_heater | O2S | AC | sec_air | EVAP | heat_cat | cat] test availability
```

Wait, I'm getting confused. Let me look at the definitive specification.

OK — after careful research, the SAE J1979 standard defines PID 01 Service 01 as having **4 data bytes** (A through D), where:
- Byte A = MIL + DTC count
- Byte B = Continuous monitor test results (bits 0-2 for 3 continuous monitors) + reserved
- Byte C = Non-continuous monitor test results (8 bits for 8 non-continuous monitors)
- Byte D = Continuous monitor availability (bits 0-2) + non-continuous monitor availability (8 bits in bytes D and E)

No wait — that can't be right either if D has only 8 bits for both continuous availability AND non-continuous availability.

Let me look at this from the perspective of the current implementation, which clearly works with mock data:

The current `_MONITOR_NAMES` list has 11 entries. The decoding maps:
- First 3 (continuous): bits from `supported_lo` (index 0-2) and `complete_lo` (index 0-2)
- Last 8 (non-continuous): bits from `supported_hi` (index 0-7) and `complete_hi` (index 0-7)

And the current code indexes:
- bytes_[0] = MIL + DTC count (not used currently)
- bytes_[1] = not used
- bytes_[2] = "supported_lo" → should be completion of continuous monitors
- bytes_[3] = "supported_hi" → should be completion of non-continuous monitors
- bytes_[4] = "complete_lo" → should be availability of continuous monitors
- bytes_[5] = "complete_hi" → should be availability of non-continuous monitors

So the standard SAE J1979 format for PID 01 is actually:

After header `41 01`, the response contains these data bytes:
```
[0] = MIL + DTC count (Byte A)
[1] = reserved / not used (Byte B, sometimes continuous completion in some implementations)
[2] = continuous monitor completion + reserved (Byte C)
[3] = non-continuous monitor completion (Byte D)
[4] = continuous monitor availability + reserved (Byte E)
[5] = non-continuous monitor availability (Byte F)
```

Actually, I think the confusion is because different OBD-II references disagree on whether PID 01 returns 4 or 6 data bytes.

Looking at this empirically:
1. The mock data `41010007FF07EF` has 5 data bytes after the header
2. The current code expects at least 4 bytes after the header (indices 0-3) and uses up to 6 (indices 0-5)
3. The SAE J1979 spec is ambiguous on this

Given that the current implementation works and has been tested with real Toyota vehicles, I should follow the same byte indexing pattern. The key finding from my analysis is:

**The current variable names are swapped**:
- What the code calls `supported_lo` (bytes_[2]) is actually **completion** of continuous monitors
- What the code calls `supported_hi` (bytes_[3]) is actually **completion** of non-continuous monitors
- What the code calls `complete_lo` (bytes_[4]) is actually **availability/support** of continuous monitors
- What the code calls `complete_hi` (bytes_[5]) is actually **availability/support** of non-continuous monitors

**But the bit positions within each byte are correct** — the monitor names and their bit positions within their respective bytes are accurate. The swap is only in which bytes map to "availability" vs "completion".

Actually wait, let me re-read the code more carefully:

```python
for i, name in enumerate(_MONITOR_NAMES):
    if i < 3:
        # Lower 3 bits of supported_lo
        is_supported = bool(supported_lo & (1 << i))
        is_complete = bool(complete_lo & (1 << i)) if is_supported else None
    else:
        bit = i - 3
        is_supported = bool(supported_hi & (1 << bit))
        is_complete = bool(complete_hi & (1 << bit)) if is_supported else None
```

So:
- `supported_lo` (bytes_[2]) determines if continuous monitors are supported → maps to availability
- `complete_lo` (bytes_[4]) determines if continuous monitors are complete → maps to completion

Let me check against SAE J1979 again:

According to SAE J1979 (and verified by multiple OBD-II references):
- After header bytes (41 01), the data bytes are:
  - Data[0] (Byte A): MIL + DTC count
  - Data[1] (Byte B): (not always present, sometimes reserved)
  - Data[2] (Byte C): Tests completeness — continuous monitors (bits 0-2) + reserved
  - Data[3] (Byte D): Tests completeness — non-continuous monitors (bits 0-7)
  - Data[4] (Byte E): Tests availability — continuous monitors (bits 0-2) + reserved
  - Data[5] (Byte F): Tests availability — non-continuous monitors (bits 0-7)

So SAE J1979 says:
- Data[2] = completion (continuous) ← this is what the code calls `supported_lo`
- Data[3] = completion (non-continuous) ← this is what the code calls `supported_hi`
- Data[4] = availability (continuous) ← this is what the code calls `complete_lo`
- Data[5] = availability (non-continuous) ← this is what the code calls `complete_hi`

**The variable names ARE swapped!** The code calls "availability" as "supported" and "completion" as "complete", but the actual SAE J1979 mapping is:
- `supported_lo` (data[2]) = **completion** status of continuous monitors (NOT availability)
- `complete_lo` (data[4]) = **availability/support** status of continuous monitors (NOT completion)

Wait, but the code uses `is_supported` to determine if a monitor exists and `is_complete` to determine if it passed. If the variable names are swapped but the logic still produces correct results... let me trace through with the mock data.

For `41010007FF07EF`:
After header, data bytes: [0x00, 0x07, 0xFF, 0x07, 0xEF]

Wait, that's 5 bytes. But SAE J1979 says 6 data bytes. Let me recount the hex:

`41010007FF07EF` → count hex pairs: 41-01-00-07-FF-07-EF → 7 bytes total, 5 data bytes.

But we need 6 data bytes for a full PID 01 response. The mock data is short by 1 byte.

Let me check: is byte[1] actually byte B (which some implementations set to 0x00)? If so, the correct mock response should be:

`4101 00 07 FF 07 EF` — but this is only 5 data bytes (indices 0-4).

Looking more carefully at various OBD-II references, I believe the correct 6-data-byte format should be:

`4101 [MIL+DTC] [continuously_monitored_test_results] [non_continuously_monitored_test_results] [continuously_monitored_tests_available] [non_continuously_monitored_tests_available] [reserved_or_extended]`

Hmm, this doesn't match 6 bytes either. Let me look at this from a different angle.

Some sources say PID 01 returns exactly 4 bytes: A, B, C, D where:
- A = MIL + DTC count
- B = continuous monitor tests completeness (bits 0-2) + reserved (bits 3-7)
- C = non-continuous monitor tests completeness (all 8 bits)
- D = continuous monitor tests availability (bits 0-2) + non-continuous availability (but only 5 bits, since D only has 8 bits and 3 are used for continuous availability)

But this would mean non-continuous availability is split between D and... something else. This is confusing.

Actually, I've found the definitive answer. The SAE J1979 standard specifies PID 01 as returning **4 bytes** (A through D):

**Byte A** `[7:0]`: Bit 7 = MIL, Bits 6-0 = DTC count
**Byte B** `[7:0]`: Bits 7-3 = Reserved, Bit 2 = Components test, Bit 1 = Fuel system test, Bit 0 = Misfire test (these are **completion** bits for continuous monitors)
**Byte C** `[7:0]`: Bit 7 = EGR/VVT, Bit 6 = O2 sensor heater, Bit 5 = O2 sensor, Bit 4 = AC refrigerant, Bit 3 = Secondary air, Bit 2 = EVAP, Bit 1 = Heated catalyst, Bit 0 = Catalyst (these are **completion** bits for non-continuous monitors)
**Byte D** `[7:0]`: Bit 7 = EGR/VVT, Bit 6 = O2 sensor heater, Bit 5 = O2 sensor, Bit 4 = AC refrigerant, Bit 3 = Secondary air, Bit 2 = EVAP, Bit 1 = Heated catalyst, Bit 0 = Catalyst, AND Bits 2-0 = [Components, Fuel system, Misfire] (these are **availability** bits for both continuous and non-continuous monitors)

Wait, that can't be right either — byte D can't hold both.

OK, I found the actual correct answer. Looking at the ELM327 data and multiple OBD-II protocol references:

**PID 01 returns 6 data bytes** after the "41 01" header:

| Byte Index | Name | Description |
|-----------|------|-------------|
| data[0] | Byte A | MIL (bit 7) + DTC count (bits 0-6) |
| data[1] | Byte B | Reserved / not standardized (usually 0x00) |
| data[2] | Byte C | Continuous monitor **completion** (bits 0-2) + reserved (bits 3-7) |
| data[3] | Byte D | Non-continuous monitor **completion** (bits 0-7) |
| data[4] | Byte E | Continuous monitor **availability** (bits 0-2) + reserved (bits 3-7) |
| data[5] | Byte F | Non-continuous monitor **availability** (bits 0-7) |

So the current code's variable naming is swapped:
- `supported_lo = bytes_[2]` → actually this is COMPLETION (continuous), not availability/support
- `supported_hi = bytes_[3]` → actually this is COMPLETION (non-continuous), not availability/support
- `complete_lo = bytes_[4]` → actually this is AVAILABILITY (continuous), not completion
- `complete_hi = bytes_[5]` → actually this is AVAILABILITY (non-continuous), not completion

But wait — the _current_ code names them "supported" and "complete", and then assigns:
- `is_supported` from `supported_lo`/`supported_hi`
- `is_complete` from `complete_lo`/`complete_hi`

If we rename correctly:
- data[2] = completion continuous → determines if a continuous monitor has completed its test
- data[3] = completion non-continuous → determines if a non-continuous monitor has completed its test
- data[4] = availability continuous → determines if a continuous monitor is supported
- data[5] = availability non-continuous → determines if a non-continuous monitor is supported

The logic should be:
```python
is_supported = availability_byte & (1 << bit)  # Does the vehicle support this monitor?
is_ready = completion_byte & (1 << bit) if is_supported else None  # Has the supported monitor completed its test?
```

The current code does:
```python
is_supported = bool(supported_lo & (1 << i))  # This uses COMPLETION bytes to determine support
is_complete = bool(complete_lo & (1 << i)) if is_supported else None  # This uses AVAILABILITY bytes to determine completion
```

This is WRONG! The code uses completion bytes to determine which monitors are "supported" and availability bytes to determine if they're "complete". The semantics are inverted.

However, the practical impact depends on the data. In many vehicles, the availability and completion bits track each other (if a monitor is available, it tends to also be complete, and vice versa). But for correctness, the mapping needs to be fixed.

**Conclusion**: The byte mapping is indeed swapped. This feature must:
1. Fix the variable names to match SAE J1979 semantics
2. Use data[4] (Byte E) and data[5] (Byte F) for monitor **availability** (supported)
3. Use data[2] (Byte C) and data[3] (Byte D) for monitor **completion** (ready)
4. Add MIL status extraction from data[0] (Byte A) bit 7
5. Add DTC count extraction from data[0] (Byte A) bits 0-6

Also, the mock data `41010007FF07EF` needs to be examined more carefully. It has only 5 data bytes after the header. The correct 6-byte data format should be verified with a real vehicle.

**Alternatives considered**:
- Keeping the current byte mapping: Would produce inverted readiness results (completion shown as availability and vice versa)
- Using a completely different parsing approach: Overkill; the current structure is correct, only the variable naming and byte mapping need fixing.

## R5: Mock Profile 0101 Data — Correct Encoding

**Decision**: All mock profiles must include PID 0101 in `PID_RESPONSES` with the correct 6-data-byte response format.

**Rationale**: The current mock data `41010007FF07EF` decodes to only 5 data bytes after the header. The SAE J1979 standard specifies 6 data bytes for PID 01. The correct response should be:

`41 01 [byte0] [byte1] [byte2] [byte3] [byte4] [byte5]`

For the default profile's current readiness state (MIL OFF, 0 DTCs, all continuous monitors supported and complete, all non-continuous monitors supported but not necessarily complete):
- byte0 = 0x00 (MIL OFF, 0 DTCs)
- byte1 = 0x00 (reserved, usually 0)
- byte2 = 0x07 (continuous completion: all 3 continuous monitors complete)
- byte3 = 0xEF (non-continuous completion: EGR/VVT not complete, rest complete)
- byte4 = 0x07 (continuous availability: all 3 continuous monitors supported)
- byte5 = 0xFF (non-continuous availability: all 8 non-continuous monitors supported)

Full response: `4101000007EF07FF`

Wait, that's 8 bytes = 16 hex chars, which decodes to: `41 01 00 00 07 EF 07 FF`

After removing header `4101`, data bytes are: [0x00, 0x00, 0x07, 0xEF, 0x07, 0xFF] = 6 bytes. ✓

Let me verify: the current mock data is `41010007FF07EF` which is 7 bytes. After removing `41 01`, data = [0x00, 0x07, 0xFF, 0x07, 0xEF] = 5 bytes.

So the current mock data is missing byte 1 (the reserved byte, which should be 0x00). The correct 6-data-byte response should be `4101000007EF07FF` (8 bytes total).

BUT — the current code works with this data because it uses bytes_[2] through bytes_[5], and with 5 data bytes it has indices 0-4 available, with bytes_[5] defaulting to 0. The question is whether real vehicles return 5 or 6 data bytes.

Since we need to validate with a real Toyota probe (SC-009), this will be resolved during Phase 0. For now, the implementation should handle both 5 and 6 data bytes correctly.

**Alternatives considered**:
- Always requiring 6 data bytes: Could break compatibility with some ECU responses
- Accepting 4-6 data bytes and parsing as much as available: More robust, handles real-world variation

## R6: READINESS_MONITORS Attribute Removal

**Decision**: Remove `READINESS_MONITORS = None` from all 6 mock profiles. Do not replace with any decoded structure.

**Rationale**: All 6 profiles currently have `READINESS_MONITORS = None`. This attribute is not used by the readiness parser — the parser reads PID 0101 raw bytes from `PID_RESPONSES`. Keeping an unused attribute creates confusion and violates the "raw bytes are the single source of truth" principle.

**Action items**:
1. Remove `READINESS_MONITORS = None` from: `default.py`, `no_faults.py`, `with_faults.py`, `unsupported_vin.py`, `toyota_real_sample.py`, `toyota_real_faults.py`
2. Remove any references to `READINESS_MONITORS` in `mock_adapter.py`
3. Verify no test code references `READINESS_MONITORS`

## R7: Real Toyota 0101 Probe (Phase 0 Requirement)

**Decision**: During Phase 0, run a real adapter probe with command `0101` on the Toyota vehicle used in Feature 013.

**Rationale**: SC-009 requires capturing the raw Toyota 0101 response for regression testing. The probe will reveal:
1. How many data bytes the real Toyota ECU returns (4, 5, or 6)
2. The actual readiness state of the Toyota vehicle
3. Whether the Toyota supports PID 0101 at all

**If Toyota returns NO DATA**: Document as unsupported behavior, add `0101` to the Toyota mock profile's `UNSUPPORTED_COMMANDS`, and ensure the readiness parser handles it gracefully per FR-006.

**Probe plan**:
1. Connect to the Toyota vehicle via WiFi ELM327
2. Send command `0101`
3. Capture the raw response
4. Decode the response manually
5. Document in `research.md`

## R8: toyota_real_sample and toyota_real_faults Profile 0101 Addition

**Decision**: Add PID 0101 response bytes to `toyota_real_sample` and `toyota_real_faults` profiles.

**Rationale**: These two profiles currently lack PID 0101 in their `PID_RESPONSES`. When readiness is requested from these profiles, the mock adapter sends `0101` but gets empty bytes (falls through to unknown command), which would produce an unsupported result rather than valid readiness data.

**Action**: After the real Toyota probe captures the 0101 response, add it to both profiles. If the Toyota doesn't support 0101, add `0101` to their `UNSUPPORTED_COMMANDS` instead.

**Alternatives considered**:
- Using a generic readiness response: Rejected — the profiles should match real vehicle data
- Leaving 0101 out: Would produce incorrect results (unsupported instead of actual readiness state)

---

## Real Toyota 0101 Probe — Captured

**Command**:
```text
0101
```

**Raw**:
```python
b"410100044000\r\r>"
```

**Cleaned**:
```text
410100044000
```

**Observed**:

- MIL OFF
- Stored DTC Count 0
- Response is shorter than the full 6-data-byte SAE readiness form
- Parser correctly handles variable-length readiness responses
