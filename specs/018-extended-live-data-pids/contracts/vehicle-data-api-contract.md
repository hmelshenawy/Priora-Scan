# Contract: Vehicle Data API — Extended PID Fields

**Feature**: 018-extended-live-data-pids (018B) | **Date**: 2026-06-15

## API Endpoint

**No new endpoints.** The existing endpoint is extended:

```
GET /api/v1/diagnostic-sessions/:sessionId/vehicle-data
```

## Response Shape Extension

### Before 018B

```json
{
  "sessionId": "uuid",
  "vehicleData": {
    "batteryVoltage": { "value": 13.417, "unit": "V", "supported": true },
    "vin": { "value": "JTDBR32E720123456", "supported": true },
    "readinessMonitors": { "supported": true, "value": { ... } },
    "fuelSystemStatus": { "value": "...", "supported": true },
    "calculatedEngineLoad": { "value": 46.3, "unit": "%", "supported": true },
    "fuelLevel": { "value": null, "unit": "%", "supported": false },
    "mileage": { "value": 12345, "unit": "km", "supported": true },
    "supportedPids": { "01": ["04","05","0C","0D","42","2F"], "09": ["02"] },
    "freezeFrame": { "supported": true, "available": false }
  },
  "readAt": "2026-06-15T10:30:00.000Z"
}
```

### After 018B (with extended PIDs)

```json
{
  "sessionId": "uuid",
  "vehicleData": {
    "batteryVoltage": { "value": 13.417, "unit": "V", "supported": true },
    "vin": { "value": "JTDBR32E720123456", "supported": true },
    "readinessMonitors": { "supported": true, "value": { ... } },
    "fuelSystemStatus": { "value": "...", "supported": true },
    "calculatedEngineLoad": { "value": 46.3, "unit": "%", "supported": true },
    "fuelLevel": { "value": null, "unit": "%", "supported": false },
    "mileage": { "value": 12345, "unit": "km", "supported": true },
    "supportedPids": { "01": ["04","05","06","07","0B","0C","0D","10","11","42","2F"], "09": ["02"] },
    "freezeFrame": { "supported": true, "available": false },

    "stftBank1": { "pid": "06", "value": 0.0, "unit": "%", "supported": true, "available": true, "rawResponse": "410680" },
    "ltftBank1": { "pid": "07", "value": -3.12, "unit": "%", "supported": true, "available": true, "rawResponse": "41077C" },
    "stftBank2": { "pid": "08", "value": null, "unit": "%", "supported": false, "available": false, "rawResponse": null },
    "ltftBank2": { "pid": "09", "value": null, "unit": "%", "supported": false, "available": false, "rawResponse": null },
    "map": { "pid": "0B", "value": 42, "unit": "kPa", "supported": true, "available": true, "rawResponse": "410B2A" },
    "maf": { "pid": "10", "value": 1.0, "unit": "g/s", "supported": true, "available": true, "rawResponse": "41100064" },
    "throttlePosition": { "pid": "11", "value": 1.96, "unit": "%", "supported": true, "available": true, "rawResponse": "411105" }
  },
  "readAt": "2026-06-15T10:30:00.000Z"
}
```

### After 018B (discovery failure)

Discovery state is represented inside each PID result. No top-level metadata fields.

```json
{
  "sessionId": "uuid",
  "vehicleData": {
    "batteryVoltage": { "value": 13.417, "unit": "V", "supported": true },
    "stftBank1": { "pid": "06", "value": null, "unit": "%", "supported": false, "available": false, "rawResponse": null, "reason": "PID_DISCOVERY_FAILED" },
    "ltftBank1": { "pid": "07", "value": null, "unit": "%", "supported": false, "available": false, "rawResponse": null, "reason": "PID_DISCOVERY_FAILED" },
    "stftBank2": { "pid": "08", "value": null, "unit": "%", "supported": false, "available": false, "rawResponse": null, "reason": "PID_DISCOVERY_FAILED" },
    "ltftBank2": { "pid": "09", "value": null, "unit": "%", "supported": false, "available": false, "rawResponse": null, "reason": "PID_DISCOVERY_FAILED" },
    "map": { "pid": "0B", "value": null, "unit": "kPa", "supported": false, "available": false, "rawResponse": null, "reason": "PID_DISCOVERY_FAILED" },
    "maf": { "pid": "10", "value": null, "unit": "g/s", "supported": false, "available": false, "rawResponse": null, "reason": "PID_DISCOVERY_FAILED" },
    "throttlePosition": { "pid": "11", "value": null, "unit": "%", "supported": false, "available": false, "rawResponse": null, "reason": "PID_DISCOVERY_FAILED" }
  },
  "readAt": "2026-06-15T10:30:00.000Z"
}
```

### After 018B (pre-018B data, backward compatible)

```json
{
  "sessionId": "uuid",
  "vehicleData": {
    "batteryVoltage": { "value": 13.417, "unit": "V", "supported": true },
    "vin": { "value": "JTDBR32E720123456", "supported": true }
  },
  "readAt": "2026-06-14T10:30:00.000Z"
}
```

The frontend must handle pre-018B data where extended PID fields are absent. The Fuel & Air Data section is not rendered for sessions with no extended PID fields — do not show "Not Supported" for data that was never collected.

## Contract Rules

1. **Backward Compatibility**: Pre-018B clients that ignore the new fields continue to work without errors.
2. **Optional Fields**: All extended PID fields (`stftBank1`, etc.) are optional in both backend and frontend types.
3. **No New Endpoints**: No new API routes are introduced.
4. **No Schema Changes**: The `vehicleDataJson` JSONB column accepts any JSON structure; no Prisma migration needed.
5. **Validation**: `isValidVehicleDataJson()` must be updated to accept but not require extended PID fields.
6. **Discovery Failure**: Each extended PID field with discovery failure has `reason: "PID_DISCOVERY_FAILED"` inside its own result object. No top-level metadata fields (`extendedPidsDiscoveryFailed`, `supportedExtendedPids`, `unsupportedExtendedPids`).
7. **Pre-018B Sessions**: For sessions created before Feature 018B, extended PID fields are absent. The frontend does not render the Fuel & Air Data section for these sessions.

## Agent Event Contract

The desktop agent emits a `VEHICLE_DATA_READ` event via `emit_session_event()`. The event payload's `vehicleData` dict is extended with the new fields:

```python
# In scan_executor.py, after read_vehicle_health():
vehicle_health = read_vehicle_health(adapter)
# Extended PID fields are now included in vehicle_health result
# The dict is passed through to emit_session_event as-is
vehicle_health["fuelSystemStatus"] = read_fuel_system_status(adapter)
vehicle_health["readinessMonitors"] = read_readiness_monitors(adapter)
vehicle_health["freezeFrame"] = read_freeze_frame(adapter)
vehicle_health["supportedPids"] = read_supported_pids(adapter)
vehicle_health["mileage"] = read_mileage(adapter)
# vin is handled separately
```

The extended PID fields (`stftBank1`, `ltftBank1`, etc.) are added to `vehicle_health` by `read_vehicle_health()` and flow through automatically — no changes to `scan_executor.py` are needed for the data payload structure.