# Quickstart: VIN Unsupported Handler Fix

**Feature**: 012-vin-unsupported-handler | **Date**: 2026-06-14

## For Developers

### What Changed

`read_vin()` now returns a `VinResult` dataclass instead of a bare string or raising `RuntimeError` on unsupported VIN.

**Before (old API)**:
```python
try:
    vin = read_vin(adapter)        # Returns str or raises RuntimeError
    print(f"VIN: {vin}")
except RuntimeError:
    print("VIN not supported")
```

**After (new API)**:
```python
result = read_vin(adapter)          # Always returns VinResult, never raises on unsupported VIN
if result.status == "SUPPORTED":
    print(f"VIN: {result.vin}")     # result.vin is the 17-char string
else:
    print(f"VIN unsupported: {result.reason}")  # reason is "ALL_FF", "NO_DATA", etc.
```

### VinResult Fields

| Field | Type | When SUPPORTED | When UNSUPPORTED |
|-------|------|----------------|------------------|
| `status` | `str` | `"SUPPORTED"` | `"UNSUPPORTED"` |
| `vin` | `str \| None` | Decoded 17-char VIN | `None` |
| `reason` | `str \| None` | `None` | `"NO_DATA"`, `"ALL_FF"`, `"MALFORMED"`, or `"EMPTY_RESPONSE"` |

### Factory Methods

```python
from src.obd.commands.vin import VinResult

# Create a supported result
result = VinResult.supported("W1KAF4GB1RF124321")
# VinResult(status='SUPPORTED', vin='W1KAF4GB1RF124321', reason=None)

# Create an unsupported result
result = VinResult.unsupported("ALL_FF")
# VinResult(status='UNSUPPORTED', vin=None, reason='ALL_FF')
```

### Unsupported Reasons

| Reason | Meaning | Typical Cause |
|--------|---------|---------------|
| `"ALL_FF"` | Vehicle ECU returned all-0xFF VIN data | Vehicle does not support VIN reporting (common in some Toyota models) |
| `"NO_DATA"` | ECU returned "NO DATA" response | ELM327 adapter received no VIN data from vehicle |
| `"EMPTY_RESPONSE"` | Adapter returned empty bytes | VIN command is not supported by the vehicle |
| `"MALFORMED"` | VIN response has valid prefix but invalid content | Corrupted data, wrong length, or non-ASCII characters |

### What Still Raises RuntimeError

Only genuine transport/adapter failures raise exceptions:
- ELM327 adapter disconnected (`ADAPTER_STOPPED`)
- Connection failures
- Hardware errors

These are not VIN capability results — they indicate the adapter cannot communicate with the vehicle at all.

### Mock Profiles with Unsupported VIN

The `unsupported_vin`, `toyota_real_sample`, and `toyota_real_faults` profiles all return all-FF VIN payloads. These now produce `VinResult.unsupported("ALL_FF")` instead of raising an error.

```python
from src.obd.mock_adapter import MockObdAdapter
from src.obd.commands.vin import read_vin

adapter = MockObdAdapter(profile_name="toyota_real_sample")
result = read_vin(adapter)
assert result.status == "UNSUPPORTED"
assert result.reason == "ALL_FF"
assert result.vin is None

# Vehicle health continues normally
from src.obd.commands.vehicle_data import read_battery_voltage
voltage = read_battery_voltage(adapter)
assert voltage["supported"] is True
assert voltage["value"] == 13.4
```

### Testing

```python
from src.obd.commands.vin import read_vin, VinResult
from src.obd.mock_adapter import MockObdAdapter

# Test supported VIN
adapter = MockObdAdapter(profile_name="default")
result = read_vin(adapter)
assert result.status == "SUPPORTED"
assert result.vin == "W1KAF4GB1RF124321"
assert result.reason is None

# Test unsupported VIN (all-FF)
adapter = MockObdAdapter(profile_name="unsupported_vin")
result = read_vin(adapter)
assert result.status == "UNSUPPORTED"
assert result.vin is None
assert result.reason == "ALL_FF"
```

### Migration Checklist for Callers

If you have code that calls `read_vin()`:

1. **Remove try/except around `read_vin()`** — unsupported VIN no longer raises
2. **Use `result.status` instead of catching RuntimeError** — check `result.status == "SUPPORTED"` or `result.status == "UNSUPPORTED"`
3. **Access VIN via `result.vin`** — the string is always available via `.vin` (None when unsupported)
4. **Keep RuntimeError handling for genuine failures** — adapter disconnects still raise
5. **Use `result.reason` for diagnostics** — log the reason when VIN is unsupported