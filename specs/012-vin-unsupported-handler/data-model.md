# Data Model: VIN Unsupported Handler Fix

**Feature**: 012-vin-unsupported-handler | **Date**: 2026-06-14

## Entities

### VinResult (dataclass)

A typed result representing the outcome of a VIN read attempt. Replaces the previous pattern of returning a bare string on success or raising `RuntimeError` on unsupported/invalid VIN.

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | `str` | Yes | `"SUPPORTED"` or `"UNSUPPORTED"` |
| `vin` | `str \| None` | Yes | Decoded 17-char VIN string when supported, `None` when unsupported |
| `reason` | `str \| None` | No | Unsupported reason: `"NO_DATA"`, `"ALL_FF"`, `"MALFORMED"`, or `"EMPTY_RESPONSE"`. `None` when supported. |

**Factory Methods**:

| Method | Returns | Description |
|--------|---------|-------------|
| `VinResult.supported(vin)` | `VinResult` | Creates a SUPPORTED result with the decoded VIN string |
| `VinResult.unsupported(reason)` | `VinResult` | Creates an UNSUPPORTED result with `vin=None` and the given reason |

**Validation Rules**:
- When `status == "SUPPORTED"`, `vin` must be a non-empty string (typically 17 chars) and `reason` must be `None`
- When `status == "UNSUPPORTED"`, `vin` must be `None` and `reason` must be one of `"NO_DATA"`, `"ALL_FF"`, `"MALFORMED"`, `"EMPTY_RESPONSE"`
- Immutable (frozen dataclass) — results are read-only

**State Transitions**: None — VinResult is a value object, not stateful.

### VinStatus (implicit enum)

The `status` field values are string literals, not a formal enum. This keeps the implementation simple while providing clear semantics.

| Value | Meaning |
|-------|---------|
| `"SUPPORTED"` | Vehicle supports VIN reporting; `vin` field contains the decoded VIN |
| `"UNSUPPORTED"` | Vehicle does not support VIN reporting; `vin` is `None`, `reason` explains why |

### VinUnsupportedReason (implicit enum)

The `reason` field values for unsupported results:

| Value | Meaning |
|-------|---------|
| `"NO_DATA"` | ECU returned "NO DATA" (real ELM327 adapter) |
| `"ALL_FF"` | VIN payload is all 0xFF bytes — vehicle does not support VIN reporting |
| `"MALFORMED"` | VIN response has valid prefix but invalid content (non-ASCII, wrong length) |
| `"EMPTY_RESPONSE"` | Adapter returned empty bytes (`b""`) for the VIN command |

## Entity Relationships

```text
read_vin(adapter)
  │
  ├── Mock adapter path
  │   └── _read_vin_mock(raw: bytes) → VinResult
  │       ├── b"" → VinResult.unsupported("EMPTY_RESPONSE")
  │       ├── No "4902" prefix → VinResult.unsupported("MALFORMED")
  │       ├── All-0xFF data → VinResult.unsupported("ALL_FF")
  │       ├── Non-ASCII decoded VIN → VinResult.unsupported("MALFORMED")
  │       ├── Length ≠ 17 → VinResult.unsupported("MALFORMED")
  │       └── Valid 17-char ASCII → VinResult.supported(vin)
  │
  └── Real adapter path
      └── clean_raw_response + parse_vin → VinResult
          ├── parse_vin → UNSUPPORTED dict → VinResult.unsupported("NO_DATA")
          ├── parse_vin → PARSE_ERROR dict → VinResult.unsupported("NO_DATA")
          ├── parse_vin → INCOMPLETE_DATA dict → VinResult.unsupported("MALFORMED")
          ├── parse_vin → ADAPTER_STOPPED dict → RuntimeError (genuine failure)
          ├── parse_vin → supported + warning → VinResult.supported(vin)
          └── parse_vin → supported + 17-char → VinResult.supported(vin)
```

## Callers → VinResult Usage

```text
execute_scan(main.py)
  │
  ├── vin_result = read_vin(adapter)
  ├── if vin_result.status == "SUPPORTED":
  │   └── emit VIN_READ {vin: vin_result.vin}
  └── if vin_result.status == "UNSUPPORTED":
      └── emit VIN_READ {vin: null, vinStatus: "UNSUPPORTED", reason: vin_result.reason}
  // DTC read continues regardless of VIN status

execute_vehicle_data_read(main.py)
  │
  ├── vin_result = read_vin(adapter)
  └── vehicle_data["vin"] = {
        value: vin_result.vin,
        supported: vin_result.status == "SUPPORTED",
        reason: vin_result.reason (if unsupported)
      }
```

## No New Database Entities

This feature is entirely in-memory and does not introduce any persistent data. VinResult is a runtime value object created by `read_vin()` and consumed by callers within the same process. No database, storage, or API schema changes are required.