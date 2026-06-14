# Data Model: Vehicle Health Real Adapter Integration

**Feature**: 013-vehicle-health-real-adapter
**Date**: 2026-06-14

## Runtime Data Entities

These entities exist only within the scope of a single Vehicle Health read. They are not persisted as database tables.

### PidCapability

Discovered PID capability from the connected vehicle.

| Field            | Type          | Description                                        |
|------------------|---------------|----------------------------------------------------|
| supportedPids    | list[string]  | Hex PID identifiers the vehicle supports (e.g., ["04", "05", "0C", "0D", "42"]) |
| unsupportedPids  | list[string]  | Configured health PIDs the vehicle does not support (e.g., ["2F"]) |
| discoveredAt     | string        | ISO 8601 timestamp of discovery                    |
| chainFollowed    | bool          | Whether bitmap chain-following was used             |

**Lifecycle**: Created at the start of each `execute_vehicle_data_read()`, included in the VEHICLE_DATA_READ event payload, then discarded.

**Validation**:
- `supportedPids` + `unsupportedPids` must equal the configured health PID set (FR-006)
- Each PID is a 2-character uppercase hex string
- `unsupportedPids` PIDs are never sent to the vehicle (FR-003)

### HealthPidResult

A single PID data point in the vehicle health result, extending the existing VehicleDataPoint shape.

| Field       | Type           | Description                                                       |
|-------------|----------------|-------------------------------------------------------------------|
| pid         | string         | Hex identifier (e.g., "0C")                                       |
| value       | number\|null   | Decoded value, or null when unavailable                           |
| unit        | string         | Unit of measurement (e.g., "RPM", "°C", "km/h", "%", "V")        |
| supported   | bool           | Whether the vehicle declared this PID via bitmap                  |
| available   | bool           | Whether a value was successfully read this time                   |
| rawResponse | string\|null   | Raw OBD hex response (optional, for diagnostics)                  |

**State Combinations**:

| supported | available | value  | Meaning                                    |
|-----------|-----------|--------|--------------------------------------------|
| false     | false     | null   | Vehicle does not support this PID          |
| true      | false     | null   | Vehicle supports it, but NO DATA this read |
| true      | true      | number | Value successfully decoded                   |

**Note**: `supported: false` always implies `available: false`. The combination `supported: false, available: true` is impossible.

**Backward Compatibility**: Existing `VehicleDataPoint` results with `supported: false` gain `available: false`. Existing `supported: true` results gain `available: true`. The `pid` and `rawResponse` fields are new additions. All changes are additive and backward-compatible.

### VehicleHealthResult

The complete result payload emitted in the VEHICLE_DATA_READ event.

| Field                | Type                    | Description                                         |
|----------------------|-------------------------|-----------------------------------------------------|
| rpm                  | HealthPidResult         | Engine RPM (PID 010C)                               |
| vehicleSpeed         | HealthPidResult         | Vehicle speed (PID 010D)                            |
| coolantTemperature   | HealthPidResult         | Coolant temperature (PID 0105)                       |
| batteryVoltage       | HealthPidResult         | Control module voltage (PID 0142)                    |
| calculatedEngineLoad | HealthPidResult         | Engine load percentage (PID 0104)                   |
| fuelLevel            | HealthPidResult         | Fuel level percentage (PID 012F)                     |
| vin                  | VinResult               | VIN read result (from Feature 012, no changes)      |
| readinessMonitors    | object                  | Existing readiness monitor data (no changes)         |
| supportedHealthPids  | list[string]            | Configured health PIDs the vehicle supports          |
| unsupportedHealthPids| list[string]            | Configured health PIDs the vehicle does not support   |
| fuelSystemStatus      | object                  | Existing fuel system data (no changes)               |
| mileage              | object                  | Existing mileage data (no changes)                  |

**Lifecycle**: Created during `execute_vehicle_data_read()`, emitted as VEHICLE_DATA_READ event, persisted as JSONB on DiagnosticSession by the backend webhook handler.

## Future Extension (Out of Scope)

### VehicleCapabilityProfile — PostgreSQL Table

| Field            | Type       | Description                                           |
|------------------|------------|-------------------------------------------------------|
| id               | UUID       | Primary key                                           |
| vehicleId        | UUID       | Foreign key to Vehicle table                          |
| vin              | string     | Nullable — VIN if available                            |
| protocol         | string     | Detected protocol (e.g., "ISO 15765-4 CAN")          |
| supportedPids    | JSONB      | Full supported PID map by mode                        |
| unsupportedPids  | JSONB      | Configured health PIDs not supported                  |
| discoveredAt     | timestamp  | When capability was first discovered                   |
| lastVerifiedAt   | timestamp  | When capability was last verified                     |
| source           | enum       | REAL_ADAPTER or MOCK_PROFILE                          |

**Status**: Documented for future implementation. NOT implemented in Feature 013.