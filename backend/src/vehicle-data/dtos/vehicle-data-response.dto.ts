/**
 * VehicleDataPoint — a single data point in the vehicle health snapshot.
 *
 * Matches the API contract shape from `contracts/vehicle-data-api-contract.md`.
 * Each data point is an object with:
 *   - `value`: Decoded value (null when unsupported)
 *   - `unit`: Unit of measurement (absent for non-numeric values)
 *   - `supported`: Whether the vehicle/adapter returned data
 *   - `details`: Optional structured detail (e.g., fuel system system1/system2)
 */
export interface VehicleDataPoint {
  value: string | number | Record<string, unknown> | unknown[] | null;
  unit?: string;
  supported: boolean;
  details?: Record<string, unknown>;
}

/**
 * Readiness monitor status for a single monitor.
 * `complete` is null when the monitor is not supported by the vehicle.
 */
export interface ReadinessMonitor {
  supported: boolean;
  complete: boolean | null;
}

/**
 * Full vehicle data JSONB shape stored on DiagnosticSession.
 */
export interface VehicleDataJson {
  batteryVoltage: VehicleDataPoint;
  vin: VehicleDataPoint;
  readinessMonitors: {
    supported: boolean;
    value: Record<string, ReadinessMonitor>;
  };
  fuelSystemStatus: VehicleDataPoint;
  calculatedEngineLoad: VehicleDataPoint;
  fuelLevel: VehicleDataPoint;
  mileage: VehicleDataPoint;
  supportedPids: {
    '01': string[];
    '09': string[];
  };
  freezeFrame?: {
    supported: boolean;
    available: boolean;
    value?: {
      dtc?: string;
      rpm?: number | null;
      speed?: number | null;
      coolantTemperature?: number | null;
      engineLoad?: number | null;
      additionalPids?: Record<string, string>;
      rawResponse?: string;
    };
  };
}

/**
 * VehicleDataResponseDto — response shape for GET /vehicle-data.
 */
export class VehicleDataResponseDto {
  sessionId: string;
  vehicleData: VehicleDataJson | null;
  readAt: string | null;

  static fromSession(
    session: { id: string; vehicleDataJson: unknown; vehicleDataReadAt: Date | null } | null,
  ): VehicleDataResponseDto {
    const dto = new VehicleDataResponseDto();
    if (!session) {
      dto.sessionId = '';
      dto.vehicleData = null;
      dto.readAt = null;
      return dto;
    }
    dto.sessionId = session.id;
    dto.vehicleData = session.vehicleDataJson as VehicleDataJson | null;
    dto.readAt = session.vehicleDataReadAt?.toISOString() ?? null;
    return dto;
  }
}

/**
 * VehicleDataReadResponseDto — response shape for POST /vehicle-data/read.
 */
export class VehicleDataReadResponseDto {
  sessionId: string;
  status: string;
  message: string;

  static queued(sessionId: string): VehicleDataReadResponseDto {
    const dto = new VehicleDataReadResponseDto();
    dto.sessionId = sessionId;
    dto.status = 'READ_PENDING';
    dto.message = 'Vehicle data read command queued.';
    return dto;
  }
}

/**
 * Validate that an unknown value has the basic shape of VehicleDataJson.
 * Used when the agent pushes a VEHICLE_DATA_READ event — validates
 * the payload before persisting to the database.
 */
export function isValidVehicleDataJson(data: unknown): data is VehicleDataJson {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  // Check required top-level keys exist and each data point has `supported`
  const requiredPoints = [
    'batteryVoltage',
    'vin',
    'readinessMonitors',
    'fuelSystemStatus',
    'calculatedEngineLoad',
    'fuelLevel',
    'mileage',
    'supportedPids',
  ];
  for (const key of requiredPoints) {
    if (!(key in d)) return false;
    const point = d[key];
    if (point && typeof point === 'object' && 'supported' in (point as object)) {
      // Valid data point shape
    } else if (key === 'readinessMonitors' || key === 'supportedPids') {
      // These have nested structure, just verify they exist
    } else {
      return false;
    }
  }
  return true;
}
