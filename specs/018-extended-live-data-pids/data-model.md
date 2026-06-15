# Data Model: Extended Live Data PIDs — Full Pipeline

**Feature**: 018-extended-live-data-pids (018B) | **Date**: 2026-06-15

## Entity Changes

### No New Database Entities

Feature 018B adds zero new database tables or schema migrations. All extended PID data is stored in the existing `DiagnosticSession.vehicleDataJson` JSONB column.

### VehicleDataJson Extension

The existing `VehicleDataJson` interface is extended with **optional** fields. No required fields are added, changed, or removed.

#### Existing Fields (Unchanged)

| Field | Type | Required |
|---|---|---|
| `batteryVoltage` | `VehicleDataPoint` | Yes |
| `vin` | `VehicleDataPoint` | Yes |
| `readinessMonitors` | `{ supported: boolean; value: Record<string, ReadinessMonitor> }` | Yes |
| `fuelSystemStatus` | `VehicleDataPoint` | Yes |
| `calculatedEngineLoad` | `VehicleDataPoint` | Yes |
| `fuelLevel` | `VehicleDataPoint` | Yes |
| `mileage` | `VehicleDataPoint` | Yes |
| `supportedPids` | `{ '01': string[]; '09': string[] }` | Yes |
| `freezeFrame` | `{ supported: boolean; available: boolean; value?: {...} }` | No |

#### New Fields (All Optional)

| Field | Type | PID | Unit | Required | Description |
|---|---|---|---|---|---|
| `stftBank1` | `VehicleDataPoint` | 06 | % | No | Short Term Fuel Trim Bank 1 |
| `ltftBank1` | `VehicleDataPoint` | 07 | % | No | Long Term Fuel Trim Bank 1 |
| `stftBank2` | `VehicleDataPoint` | 08 | % | No | Short Term Fuel Trim Bank 2 |
| `ltftBank2` | `VehicleDataPoint` | 09 | % | No | Long Term Fuel Trim Bank 2 |
| `map` | `VehicleDataPoint` | 0B | kPa | No | Intake Manifold Absolute Pressure |
| `maf` | `VehicleDataPoint` | 10 | g/s | No | Mass Air Flow |
| `throttlePosition` | `VehicleDataPoint` | 11 | % | No | Throttle Position |

> **Note**: No top-level metadata fields (`extendedPidsDiscoveryFailed`, `supportedExtendedPids`, `unsupportedExtendedPids`). Discovery state is represented inside each PID result via the `reason` field.

### VehicleDataPoint Shape (Unchanged)

```typescript
interface VehicleDataPoint {
  value: string | number | Record<string, unknown> | unknown[] | null;
  unit?: string;
  supported: boolean;
  details?: Record<string, unknown>;
  // Extended PID results add:
  available?: boolean;      // true if value was successfully read
  pid?: string;             // hex PID code (e.g., "06")
  rawResponse?: string;     // raw ELM327 response
  reason?: string;          // unavailable reason (NO_DATA, PREFIX_MISMATCH, INVALID_RESPONSE, PID_DISCOVERY_FAILED)
}
```

### Three-State Result Model (Agent Side, Unchanged)

The desktop agent produces results using the existing three-state pattern from `health_pids.py`:

| State | `supported` | `available` | `value` | `rawResponse` | `reason` |
|---|---|---|---|---|---|
| Supported + Available | `true` | `true` | Decoded value | Present | — |
| Supported + Unavailable | `true` | `false` | `null` | Present or `null` | `"NO_DATA"` / `"PREFIX_MISMATCH"` / `"INVALID_RESPONSE"` |
| Unsupported | `false` | `false` | `null` | `null` | — |
| Discovery Failed | `false` | `false` | `null` | `null` | `"PID_DISCOVERY_FAILED"` |

### Fuel Trim Hint Logic (Frontend Only)

A pure deterministic function, not a data model:

```typescript
function getFuelTrimHint(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value < -10) return "Rich Tendency";
  if (value > 10) return "Lean Tendency";
  return "Normal";
}
```

## Relationships

```
DiagnosticSession (existing)
  └── vehicleDataJson: JSONB (extended with optional fields)
        ├── stftBank1?: VehicleDataPoint
        ├── ltftBank1?: VehicleDataPoint
        ├── stftBank2?: VehicleDataPoint
        ├── ltftBank2?: VehicleDataPoint
        ├── map?: VehicleDataPoint
        ├── maf?: VehicleDataPoint
        └── throttlePosition?: VehicleDataPoint
```

## Backward Compatibility

Pre-018B `VehicleDataJson` payloads (without extended PID fields) remain valid. The backend's `isValidVehicleDataJson()` function must be updated to accept but not require the new optional fields. The frontend's `VehicleHealthPanel` must handle missing fields by not rendering the Fuel & Air Data section at all for pre-018B sessions — do not show "Not Supported" for data that was never collected.