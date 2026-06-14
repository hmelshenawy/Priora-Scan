# Contract: HealthPidResult Shape

**Feature**: 013-vehicle-health-real-adapter
**Date**: 2026-06-14

## Overview

This contract defines the shape of each PID data point in the Vehicle Health result payload, as emitted by the desktop agent in the VEHICLE_DATA_READ event and consumed by the backend webhook handler.

## HealthPidResult

Each health data point in the vehicle health result follows this shape.

### Fields

| Field       | Type                          | Required | Description                                          |
|-------------|-------------------------------|----------|------------------------------------------------------|
| pid         | string                        | Yes      | 2-character uppercase hex PID identifier (e.g., "0C") |
| value       | number \| null                | Yes      | Decoded numeric value, or null when unavailable       |
| unit        | string                        | Yes      | SI unit string (e.g., "RPM", "°C", "km/h", "%", "V") |
| supported   | boolean                       | Yes      | True if the vehicle's PID bitmap declares this PID   |
| available   | boolean                       | Yes      | True if a value was successfully read this time       |
| rawResponse | string \| null                | No       | Raw OBD hex response string (e.g., "410C0E10")       |

### State Combinations

| supported | available | value  | Meaning                                     |
|-----------|-----------|--------|---------------------------------------------|
| false     | false     | null   | Vehicle does not support this PID           |
| true      | false     | null   | Supported but returned NO DATA / unparseable |
| true      | true      | number | Value successfully decoded                    |

The combination `supported: false, available: true` is invalid and MUST NOT occur.

### Examples

**Supported and available (RPM = 900)**:
```json
{
  "pid": "0C",
  "value": 900,
  "unit": "RPM",
  "supported": true,
  "available": true,
  "rawResponse": "410C0E10"
}
```

**Supported but unavailable (NO DATA this read)**:
```json
{
  "pid": "0C",
  "value": null,
  "unit": "RPM",
  "supported": true,
  "available": false,
  "rawResponse": null
}
```

**Not supported by vehicle**:
```json
{
  "pid": "2F",
  "value": null,
  "unit": "%",
  "supported": false,
  "available": false,
  "rawResponse": null
}
```

## VehicleHealthResult Top-Level Fields

The VEHICLE_DATA_READ event payload includes these health data fields:

| Field                 | Type              | Description                                   |
|-----------------------|-------------------|-----------------------------------------------|
| rpm                   | HealthPidResult   | Engine RPM (PID 0C)                           |
| vehicleSpeed          | HealthPidResult   | Vehicle speed in km/h (PID 0D)                |
| coolantTemperature    | HealthPidResult   | Coolant temperature in °C (PID 05)            |
| batteryVoltage        | HealthPidResult   | Control module voltage in V (PID 42)           |
| calculatedEngineLoad  | HealthPidResult   | Engine load percentage (PID 04)               |
| fuelLevel             | HealthPidResult   | Fuel level percentage (PID 2F)                |
| vin                   | VinResult         | VIN read result (Feature 012 shape)            |
| readinessMonitors     | object            | Existing readiness monitor data                |
| fuelSystemStatus      | object            | Existing fuel system status data               |
| mileage               | object            | Existing mileage data                           |
| supportedHealthPids   | string[]          | Configured health PIDs the vehicle supports     |
| unsupportedHealthPids | string[]          | Configured health PIDs the vehicle doesn't support |

## Configured Health PIDs

The set of PIDs that the Vehicle Health read considers:

| PID  | Name                    | Unit  | Formula                     |
|------|-------------------------|-------|-----------------------------|
| 04   | Calculated Engine Load  | %     | A * 100 / 255               |
| 05   | Coolant Temperature     | °C    | A - 40                      |
| 0C   | Engine RPM              | RPM   | (A * 256 + B) / 4           |
| 0D   | Vehicle Speed           | km/h  | A                           |
| 42   | Control Module Voltage  | V     | (A * 256 + B) / 1000        |
| 2F   | Fuel Level Input        | %     | A * 100 / 255               |

## Bitmap Discovery Contract

### Input

Mode 01 PID bitmap queries:

| Command | Response Prefix | PIDs Covered | Bit 32 Meaning         |
|---------|-----------------|-------------|------------------------|
| 0100    | 41 00           | 01-20       | PID 20 supported?      |
| 0120    | 41 20           | 21-40       | PID 40 supported?      |
| 0140    | 41 40           | 41-60       | PID 60 supported?      |

### Chain-Following Logic

1. Send `0100`. Parse 4-byte bitmask into supported PIDs 01-20.
2. If bit 32 of the 0100 response is set → send `0120`. Parse PIDs 21-40.
3. If bit 32 of the 0120 response is set → send `0140`. Parse PIDs 41-60.
4. Continue until bit 32 is clear or response is NO DATA.
5. If `0100` returns NO DATA → fallback: attempt all configured health PIDs.

### Bitmap Parsing

4 bytes = 32 bits. Bit 1 (MSB) = PID 01, Bit 32 (LSB) = next-range indicator.
For PID 0120: Bit 1 = PID 21, Bit 32 = next-range indicator for 0140.

## Backward Compatibility

### Existing VehicleDataPoint Shape

The existing `VehicleDataPoint` shape in the backend DTO is:
```typescript
interface VehicleDataPoint {
  value: string | number | Record<string, unknown> | unknown[] | null;
  unit?: string;
  supported: boolean;
  details?: Record<string, unknown>;
}
```

The new `HealthPidResult` shape adds `pid`, `available`, and `rawResponse` fields. These are additive — the existing `supported`, `value`, and `unit` fields remain in place. The `VehicleDataJson` interface in the backend DTO will need to be extended with the new fields when backend work is performed.

### Event Payload Extension

The VEHICLE_DATA_READ event payload gains new top-level fields (`rpm`, `vehicleSpeed`, `coolantTemperature`, `supportedHealthPids`, `unsupportedHealthPids`). The existing `isValidVehicleDataJson()` validation function in the backend must be updated to accept the new fields when backend work is performed.