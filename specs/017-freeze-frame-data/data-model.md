# Data Model: Freeze Frame Data (Feature 017)

**Branch**: `017-freeze-frame-data` | **Date**: 2026-06-14

## Entities

### FreezeFrameResult

The top-level result of a freeze frame read operation.

| Field | Type | Description | Nullable | Example |
|-------|------|-------------|----------|---------|
| `supported` | `bool` | Whether Mode 02 is supported by the ECU | No | `True` |
| `available` | `bool` | Whether freeze frame data is currently stored | No | `True` |
| `value` | `dict` | Structured freeze frame data when supported and available; empty dict otherwise | No | See FreezeFrameValue |

**State combinations**:

| `supported` | `available` | `value` | Condition |
|-------------|-------------|--------|-----------|
| `True` | `True` | `{dtc, rpm, speed, ...}` | Freeze frame data exists |
| `True` | `False` | `{}` | Mode 02 works but no snapshot stored (desired state — ECU behavior TBD) |
| `False` | `False` | `{}` | Mode 02 unsupported or NO DATA |

**Validation rules**:
- If `supported` is `False`, `available` MUST be `False` and `value` MUST be `{}`
- If `available` is `True`, `supported` MUST be `True`
- `value` is only populated when both `supported` and `available` are `True`

### FreezeFrameValue

The inner payload containing decoded freeze frame data.

| Field | Type | Description | Nullable | Example |
|-------|------|-------------|----------|---------|
| `dtc` | `str` | DTC code that triggered the freeze frame (SAE format: P0103, C0123, B0245, U0100) | No (but may be "P0000") | `"P0301"` |
| `rpm` | `float` | Engine RPM at time of fault (PID 0C decoded value) | Yes | `2450.0` |
| `speed` | `int` | Vehicle speed in km/h at time of fault (PID 0D decoded value) | Yes | `72` |
| `coolantTemperature` | `int` | Coolant temperature in °C at time of fault (PID 05 decoded value) | Yes | `91` |
| `engineLoad` | `float` | Calculated engine load percentage at time of fault (PID 04 decoded value) | Yes | `58.0` |
| `additionalPids` | `dict[str, str]` | Additional PID values beyond the four MVP PIDs, keyed by PID number, values as raw hex strings | No (empty dict if none) | `{"0F": "4B"}` |
| `rawResponse` | `str` | Raw ECU response hex string for debugging | No | `"42010103043A05830C26480D48"` |

**Validation rules**:
- `dtc` is always present when `available` is `True` (may be `"P0000"` for no-DTC cases)
- `rpm`, `speed`, `coolantTemperature`, `engineLoad` are `null` when the corresponding PID is not present in the response
- `additionalPids` is an empty dict `{}` when no additional PIDs exist
- `rawResponse` always contains the full raw hex response including header bytes

### MVP PID Decoding Rules

| PID | Bytes | Formula | Unit | Nullable |
|-----|-------|---------|------|----------|
| `04` (Engine Load) | 1 | `value * 100 / 255` | % | Yes (null if not in response) |
| `05` (Coolant Temperature) | 1 | `value - 40` | °C | Yes (null if not in response) |
| `0C` (Engine RPM) | 2 | `(A * 256 + B) / 4` | RPM | Yes (null if not in response) |
| `0D` (Vehicle Speed) | 1 | `value` | km/h | Yes (null if not in response) |

### DTC Encoding (in Freeze Frame)

The 2-byte DTC code in the freeze frame response uses SAE J1979 encoding:

| Byte 1 High Nibble | DTC Type | Prefix |
|--------------------|----------|--------|
| `0x0` | Powertrain | P |
| `0x1` | Chassis | C |
| `0x2` | Body | B |
| `0x3` | Network | U |

**Format**: `[Type nibble][Byte 1 bits 3-0][Byte 2 hex]`
**Example**: `01 03` → Type=P, digits=0103 → `P0103`

## State Transitions

```
[Send 0201] → [compact_raw_response()] → [is_adapter_error_response()?]
     │                                      │
     │ NO DATA/error ───────────────────────┼──→ {supported: False, available: False, value: {}}
     │                                      │
     │ Valid hex ───→ [parse_freeze_frame(hex_str)]
                         │
                         │ None ──────→ {supported: False, available: False, value: {}}
                         │
                         │ DTC=0000, no PIDs → {supported: True, available: False, value: {}}
                         │
                         │ Valid result → {supported: True, available: True, value: {dtc, rpm, ...}}
```

**Note**: The `supported: True, available: False` transition is the desired state model. Actual ECU behavior for "no freeze frame" must be validated during research (see research.md R7, R8).

## Relationships

- `FreezeFrameResult` is produced by `read_freeze_frame(adapter)` and consumed by the `VEHICLE_DATA_READ` event payload under the `freezeFrame` key
- `FreezeFrameValue` is produced by `parse_freeze_frame(hex_str)` and embedded in `FreezeFrameResult.value`
- `parse_freeze_frame()` shares the DTC decoding logic with `parse_dtcs()` via a `_decode_dtc_byte_pair()` helper
- `FreezeFrameResult` follows the same `supported`/`value` wrapper pattern as `ReadinessResult`

## No Persistence

`FreezeFrameResult` is not persisted. It is a live read from the ECU (or mock adapter) with no Redis, cache, or database storage.