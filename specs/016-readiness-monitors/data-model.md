# Data Model: Readiness Monitors (Feature 016)

**Branch**: `016-readiness-monitors` | **Date**: 2026-06-14

## Entities

### ReadinessResult

The top-level result of a readiness monitor read. Returned by `read_readiness_monitors()` and included in the `VEHICLE_DATA_READ` event payload under the `readinessMonitors` key.

| Field | Type | Description |
|-------|------|-------------|
| `milStatus` | `"ON"` \| `"OFF"` \| `"UNKNOWN"` | Malfunction Indicator Lamp state. ON if bit 7 of byte 0 is set, OFF if clear, UNKNOWN if PID 0101 is unsupported. |
| `storedDtcCount` | `int` \| `null` | Number of confirmed DTCs stored in the ECU. Bits 0-6 of byte 0. `null` if PID 0101 is unsupported. |
| `monitors` | `list[ReadinessMonitor]` | List of 11 standard SAE J1979 readiness monitors with their states. Empty list if PID 0101 is unsupported. |
| `rawResponse` | `str` \| `null` | Raw ECU response hex string for debugging. `"NO DATA"` if unsupported, `null` if adapter error. |

**Unsupported shape** (when PID 0101 returns NO DATA, empty, or error):

```python
{
    "milStatus": "UNKNOWN",
    "storedDtcCount": None,
    "monitors": [],
    "rawResponse": "NO DATA"  # or empty string, or error message
}
```

**Successful shape** (example for `4101000007EF07FF`):

```python
{
    "milStatus": "OFF",
    "storedDtcCount": 0,
    "monitors": [
        {"name": "misfire", "supported": True, "ready": True},
        {"name": "fuelSystem", "supported": True, "ready": True},
        {"name": "components", "supported": True, "ready": True},
        {"name": "catalyst", "supported": True, "ready": True},
        {"name": "heatedCatalyst", "supported": True, "ready": True},
        {"name": "evap", "supported": True, "ready": True},
        {"name": "secondaryAir", "supported": True, "ready": True},
        {"name": "acRefrigerant", "supported": True, "ready": True},
        {"name": "oxygenSensor", "supported": True, "ready": True},
        {"name": "oxygenSensorHeater", "supported": True, "ready": True},
        {"name": "egrVvt", "supported": True, "ready": False},
    ],
    "rawResponse": "4101000007EF07FF"
}
```

### ReadinessMonitor

A single readiness monitor entry within the `ReadinessResult.monitors` list.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `str` | One of the 11 standard SAE J1979 monitor names (see Monitor Names table). |
| `supported` | `bool` | Whether the vehicle declares this monitor as available. Derived from availability bytes. |
| `ready` | `bool` \| `null` | Whether the monitor has completed its self-test. `null` if the monitor is not supported. |

**State combinations**:

| `supported` | `ready` | Meaning |
|-------------|---------|---------|
| `True` | `True` | Monitor is supported and has completed its self-test (ready for inspection) |
| `True` | `False` | Monitor is supported but has not yet completed its self-test (not ready) |
| `False` | `null` | Monitor is not supported by this vehicle |

### Monitor Names (in SAE J1979 order)

| Index | Name | Type | Availability Byte.Bit | Completion Byte.Bit |
|-------|------|------|-----------------------|---------------------|
| 0 | `misfire` | Continuous | data[4].bit0 | data[2].bit0 |
| 1 | `fuelSystem` | Continuous | data[4].bit1 | data[2].bit1 |
| 2 | `components` | Continuous | data[4].bit2 | data[2].bit2 |
| 3 | `catalyst` | Non-continuous | data[5].bit0 | data[3].bit0 |
| 4 | `heatedCatalyst` | Non-continuous | data[5].bit1 | data[3].bit1 |
| 5 | `evap` | Non-continuous | data[5].bit2 | data[3].bit2 |
| 6 | `secondaryAir` | Non-continuous | data[5].bit3 | data[3].bit3 |
| 7 | `acRefrigerant` | Non-continuous | data[5].bit4 | data[3].bit4 |
| 8 | `oxygenSensor` | Non-continuous | data[5].bit5 | data[3].bit5 |
| 9 | `oxygenSensorHeater` | Non-continuous | data[5].bit6 | data[3].bit6 |
| 10 | `egrVvt` | Non-continuous | data[5].bit7 | data[3].bit7 |

**Byte index reference** (after removing header `41 01`):

| Byte Index | SAE J1979 Name | Content |
|-----------|----------------|---------|
| data[0] | Byte A | MIL (bit 7) + DTC count (bits 0-6) |
| data[1] | Byte B | Reserved (usually 0x00) |
| data[2] | Byte C | Continuous monitor **completion** (bits 0-2) + reserved (bits 3-7) |
| data[3] | Byte D | Non-continuous monitor **completion** (bits 0-7) |
| data[4] | Byte E | Continuous monitor **availability** (bits 0-2) + reserved (bits 3-7) |
| data[5] | Byte F | Non-continuous monitor **availability** (bits 0-7) |

## Relationships

### ReadinessResult → Vehicle Data Event

`ReadinessResult` is included in the `VEHICLE_DATA_READ` event payload as:

```python
vehicle_health["readinessMonitors"] = read_readiness_monitors(adapter)
```

The `readinessMonitors` key already exists in the event payload (added in Feature 009). This feature changes the shape of the value from the current `{"supported": bool, "value": {}}` to the new `ReadinessResult` entity shape.

### ReadinessResult → Mock Profile PID_RESPONSES

Mock profiles store raw OBD bytes in `PID_RESPONSES["0101"]`. The shared `parse_readiness_monitors()` parser decodes these bytes into a `ReadinessResult`. Raw bytes are the single source of truth — no decoded readiness state is stored in profiles.

### ReadinessResult → parse_readiness_monitors()

The parser function takes a hex string and returns a `ReadinessResult`. It is the single point of decoding for both mock and real adapter paths.

## Validation Rules

1. `milStatus` must be one of `"ON"`, `"OFF"`, `"UNKNOWN"`
2. `storedDtcCount` must be 0-127 or `null`
3. `monitors` must contain exactly 11 entries when PID 0101 is supported
4. `monitors` must be an empty list when PID 0101 is unsupported
5. Each monitor `name` must match one of the 11 standard names
6. `ready` must be `null` when `supported` is `False`
7. `rawResponse` must be a non-empty string when `milStatus` is not `"UNKNOWN"`

## State Transitions

Not applicable — `ReadinessResult` is a per-read snapshot with no persistence or state machine.

## Backward Compatibility

The current `read_readiness_monitors()` return shape is:

```python
{"supported": True, "value": {"misfire": {"supported": True, "complete": True}, ...}}
```

The new shape is:

```python
{"milStatus": "OFF", "storedDtcCount": 0, "monitors": [...], "rawResponse": "..."}
```

This is a **breaking change** to the `readinessMonitors` field in the `VEHICLE_DATA_READ` event payload. The `main.py` integration point must be updated to use the new shape.