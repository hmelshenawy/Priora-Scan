# Readiness Monitors — Internal Contracts

**Feature**: 016-readiness-monitors | **Date**: 2026-06-14

## Desktop Agent Internal API

### `read_readiness_monitors(adapter: BaseAdapter) -> ReadinessResult`

**Module**: `src.obd.commands.vehicle_data`

**Input**: An OBD adapter instance (mock or real)

**Output**: `ReadinessResult` dict with the following shape:

```python
# Successful read (PID 0101 supported)
{
    "milStatus": "ON" | "OFF",         # MIL state from byte 0 bit 7
    "storedDtcCount": int,               # DTC count from byte 0 bits 0-6
    "monitors": [                        # Exactly 11 entries
        {"name": "misfire", "supported": bool, "ready": bool | None},
        {"name": "fuelSystem", "supported": bool, "ready": bool | None},
        {"name": "components", "supported": bool, "ready": bool | None},
        {"name": "catalyst", "supported": bool, "ready": bool | None},
        {"name": "heatedCatalyst", "supported": bool, "ready": bool | None},
        {"name": "evap", "supported": bool, "ready": bool | None},
        {"name": "secondaryAir", "supported": bool, "ready": bool | None},
        {"name": "acRefrigerant", "supported": bool, "ready": bool | None},
        {"name": "oxygenSensor", "supported": bool, "ready": bool | None},
        {"name": "oxygenSensorHeater", "supported": bool, "ready": bool | None},
        {"name": "egrVvt", "supported": bool, "ready": bool | None},
    ],
    "rawResponse": str,                 # Raw hex response string
}

# Unsupported read (PID 0101 not supported, NO DATA, empty, error)
{
    "milStatus": "UNKNOWN",
    "storedDtcCount": None,
    "monitors": [],
    "rawResponse": str | None,          # "NO DATA", empty string, or None
}
```

**Error handling**:
- Adapter returns `None` (empty response) → unsupported result
- Adapter returns `NO DATA` → unsupported result with `rawResponse: "NO DATA"`
- Adapter returns response without `4101` prefix → unsupported result
- Response has fewer than 4 data bytes after prefix → unsupported result
- `ValueError` or `IndexError` during parsing → unsupported result

### `parse_readiness_monitors(hex_str: str) -> ReadinessResult | None`

**Module**: `src.obd.commands.vehicle_data` (NEW)

**Input**: Raw hex response string from `_send_pid()` (already compacted via `compact_raw_response`)

**Output**: `ReadinessResult` dict, or `None` if the response cannot be parsed

**Purpose**: Shared parser for both mock and real adapter paths. This is the single point of decoding.

**Byte mapping** (after removing `4101` prefix):

| Index | SAE J1979 | Content |
|-------|-----------|---------|
| data[0] | Byte A | MIL (bit 7) + DTC count (bits 0-6) |
| data[1] | Byte B | Reserved |
| data[2] | Byte C | Continuous monitor **completion** (bits 0-2) |
| data[3] | Byte D | Non-continuous monitor **completion** (bits 0-7) |
| data[4] | Byte E | Continuous monitor **availability** (bits 0-2) |
| data[5] | Byte F | Non-continuous monitor **availability** (bits 0-7) |

**Note**: The current implementation uses swapped variable names (`supported_lo`/`supported_hi` for what are actually completion bytes, `complete_lo`/`complete_hi` for what are actually availability bytes). This feature corrects the mapping and renames variables to match SAE J1979 semantics.

### VEHICLE_DATA_READ Event Payload — readinessMonitors Key

**Current shape** (pre-Feature 016):

```python
vehicle_health["readinessMonitors"] = {
    "supported": bool,
    "value": {
        "misfire": {"supported": bool, "complete": bool | None},
        ...
    }
}
```

**New shape** (Feature 016):

```python
vehicle_health["readinessMonitors"] = {
    "milStatus": "ON" | "OFF" | "UNKNOWN",
    "storedDtcCount": int | None,
    "monitors": [...],
    "rawResponse": str | None,
}
```

This is a **breaking change** to the event payload. Backend consumers must be updated to use the new shape.