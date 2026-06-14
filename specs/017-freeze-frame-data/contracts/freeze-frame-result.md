# Contract: Freeze Frame Result Shape

**Branch**: `017-freeze-frame-data` | **Date**: 2026-06-14

## Internal Contract: `FreezeFrameResult`

This is an **internal data contract** between the desktop agent's OBD parser and the `VEHICLE_DATA_READ` event payload. It is NOT an external API endpoint.

### Producer

`read_freeze_frame(adapter: BaseAdapter) -> dict` in `vehicle_data.py`

### Consumer

`execute_vehicle_data_read()` in `main.py` → `vehicle_health["freezeFrame"]`

### Result Shapes

#### Freeze Frame Available

```python
{
    "supported": True,
    "available": True,
    "value": {
        "dtc": "P0301",           # SAE DTC code string
        "rpm": 2450.0,            # float, PID 0C decoded value
        "speed": 72,              # int, PID 0D decoded value in km/h
        "coolantTemperature": 91, # int, PID 05 decoded value in °C
        "engineLoad": 58.0,       # float, PID 04 decoded value in %
        "additionalPids": {},     # dict[str, str] - additional PIDs in raw hex
        "rawResponse": "42010103043A05830C26480D48"  # full hex string
    }
}
```

#### Freeze Frame Unavailable (desired state — actual ECU behavior TBD)

```python
{
    "supported": True,
    "available": False,
    "value": {}
}
```

#### Freeze Frame Unsupported

```python
{
    "supported": False,
    "available": False,
    "value": {}
}
```

### Parser Function Contract

#### `parse_freeze_frame(hex_str: str) -> Optional[dict]`

**Input**: Cleaned uppercase hex string (output of `compact_raw_response()`)

**Output on success**:
```python
{
    "dtc": "P0301",
    "rpm": 2450.0,
    "speed": 72,
    "coolantTemperature": 91,
    "engineLoad": 58.0,
    "additionalPids": {"0F": "4B"},
    "rawResponse": "42010103043A05830C26480D48"
}
```

**Output on failure**: `None`
- Returns `None` for: NO DATA, empty string, invalid hex, prefix mismatch (`!= "4201"`), insufficient data length

#### `read_freeze_frame(adapter: BaseAdapter) -> dict`

**Input**: OBD adapter instance

**Behavior**:
1. Calls `_send_pid(adapter, "02", "01")` to send command `0201`
2. If `_send_pid` returns `None`: returns `{supported: False, available: False, value: {}}`
3. Calls `parse_freeze_frame(hex_str)` with the cleaned response
4. If `parse_freeze_frame` returns `None`: returns `{supported: False, available: False, value: {}}`
5. If `parse_freeze_frame` returns valid result: returns `{supported: True, available: True, value: result}`
6. If result has DTC `"P0000"` and no PID data: returns `{supported: True, available: False, value: {}}` (desired state — actual behavior TBD)

### Event Payload Integration

The `freezeFrame` key is added to the `VEHICLE_DATA_READ` event payload:

```python
vehicle_health["freezeFrame"] = read_freeze_frame(adapter)
```

Result placed alongside existing keys: `fuelSystemStatus`, `readinessMonitors`, `supportedPids`, `mileage`, `vin`.

### No External API Changes

This feature does NOT introduce new REST API endpoints. The `freezeFrame` data is included in the existing `VEHICLE_DATA_READ` scan event payload consumed by the frontend.