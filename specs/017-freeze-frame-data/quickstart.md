# Quickstart: Freeze Frame Data (Feature 017)

**Branch**: `017-freeze-frame-data` | **Date**: 2026-06-14

## Overview

Add OBD-II Mode 02 PID 01 Freeze Frame Data retrieval to the PrioraScan desktop agent. The feature follows the existing PrioraScan pattern (read function → parse function → structured result → event payload) and is scoped to decode four MVP diagnostic PIDs plus DTC code.

## Implementation Order (Parser First)

```
1. Known OBD-II examples (test data)
   ↓
2. Parser tests (test_freeze_frame.py)
   ↓
3. Parser implementation (parse_freeze_frame in vehicle_data.py)
   ↓
4. Read function implementation (read_freeze_frame in vehicle_data.py)
   ↓
5. Mock profile updates (PID_RESPONSES["0201"])
   ↓
6. Workflow integration (main.py)
   ↓
7. Integration tests
```

## Key Files to Modify

| File | Change |
|------|--------|
| `desktop-agent/src/obd/commands/freeze_frame.py` | **New**: `parse_freeze_frame()`, `read_freeze_frame()`, MVP PID decoding |
| `desktop-agent/src/obd/commands/elm_parser.py` | Extract `_decode_dtc_byte_pair()` helper (shared with `parse_dtcs()`) |
| `desktop-agent/src/obd/commands/vehicle_data.py` | Add import re-export of `parse_freeze_frame`, `read_freeze_frame` |
| `desktop-agent/src/agent/scan_executor.py` | Add `vehicle_health["freezeFrame"] = read_freeze_frame(adapter)` |
| `desktop-agent/src/obd/mock_profiles/default.py` | Add `PID_RESPONSES["0201"]` |
| `desktop-agent/src/obd/mock_profiles/no_faults.py` | Add `PID_RESPONSES["0201"]` (unavailable case) |
| `desktop-agent/src/obd/mock_profiles/with_faults.py` | Add `PID_RESPONSES["0201"]` |
| `desktop-agent/src/obd/mock_profiles/unsupported_vin.py` | Add `"0201"` to `UNSUPPORTED_COMMANDS` |
| `desktop-agent/src/obd/mock_profiles/toyota_real_sample.py` | Add `PID_RESPONSES["0201"]` or `UNSUPPORTED_COMMANDS` (TBD by research) |
| `desktop-agent/src/obd/mock_profiles/toyota_real_faults.py` | Add `PID_RESPONSES["0201"]` (TBD by research) |
| `desktop-agent/tests/test_freeze_frame.py` | **New**: Parser tests, read function tests, profile decoding tests, edge cases |
| `desktop-agent/tests/test_elm_parser.py` | Add `_decode_dtc_byte_pair` helper tests |
| `desktop-agent/tests/test_vehicle_health_integration.py` | Add `TestFreezeFrameIntegration` class |
| `desktop-agent/tests/test_vehicle_health_integration.py` | Verify freezeFrame shape in event payload |

## Key Patterns to Follow

### Parse Function (pure, no I/O)

```python
def parse_freeze_frame(hex_str: str) -> Optional[dict]:
    """Parse Mode 02 PID 01 freeze frame response.

    Args:
        hex_str: Cleaned uppercase hex string (output of compact_raw_response)

    Returns:
        Dict with dtc, rpm, speed, coolantTemperature, engineLoad,
        additionalPids, rawResponse; or None on parse failure.
    """
```

### Read Function (I/O layer)

```python
def read_freeze_frame(adapter: BaseAdapter) -> dict:
    """Read freeze frame data from vehicle via Mode 02 PID 01.

    Args:
        adapter: OBD adapter instance

    Returns:
        FreezeFrameResult dict with supported/available/value keys.
    """
    hex_str = _send_pid(adapter, "02", "01")
    if hex_str is None:
        return {"supported": False, "available": False, "value": {}}
    result = parse_freeze_frame(hex_str)
    if result is None:
        return {"supported": False, "available": False, "value": {}}
    # Handle DTC P0000 with no PID data → available: False
    # This mapping follows current research assumptions (research.md R8)
    # and may be refined after real Toyota 0201 validation.
    # The parser remains generic — no Toyota-specific assumptions.
    if result.get("dtc") == "P0000" and _no_pid_data(result):
        return {"supported": True, "available": False, "value": {}}
    return {"supported": True, "available": True, "value": result}
```

### DTC Decoding (shared helper)

```python
def _decode_dtc_byte_pair(byte1_hex: str, byte2_hex: str) -> str:
    """Decode a 2-byte DTC code using SAE J1979 encoding.

    Shared between parse_dtcs() and parse_freeze_frame().
    """
```

## MVP PID Decoding

| PID | Bytes | Formula | Unit | Field Name |
|-----|-------|---------|------|-------------|
| `04` | 1 | `value * 100 / 255` | % | `engineLoad` |
| `05` | 1 | `value - 40` | °C | `coolantTemperature` |
| `0C` | 2 | `(A * 256 + B) / 4` | RPM | `rpm` |
| `0D` | 1 | `value` | km/h | `speed` |

## Testing Strategy

1. **Parser tests** — Pure function tests with known hex strings (no adapter needed)
2. **Read function tests** — Mock adapter integration with `MockObdAdapter(profile_name=...)`
3. **Parser equivalence tests** — Same raw bytes through mock and real paths produce identical results
4. **Profile decoding tests** — Each mock profile's 0201 response decodes correctly
5. **Toyota regression test** — Captured Toyota 0201 response (required before feature closure, not a prerequisite for implementation)

## Required Pre-Closure Activities

- Real Toyota 0201 probe — must be completed and documented before feature closure, but does not block implementation

## Deferred Items

- Toyota mock profile 0201 data (pending real probe; placeholder data from SAE J1979 examples used in the interim)
- Arbitrary PID decoding beyond the 4 MVP PIDs
- Backend API endpoint for freeze frame data
- Frontend freeze frame display