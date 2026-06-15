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
 * ExtendedPidDataPoint — a single extended PID result from vehicle health.
 *
 * Used for fuel trim, airflow, and throttle position PIDs (Feature 018B).
 * Includes `available` and `pid` fields that standard VehicleDataPoint lacks,
 * plus an optional `reason` field for discovery failure classification.
 */
export interface ExtendedPidDataPoint {
  pid: string;
  value: number | null;
  unit: string;
  supported: boolean;
  available: boolean;
  rawResponse?: string | null;
  reason?: string;
}

/**
 * Readiness monitor status for a single monitor.
 * `complete` is null when the monitor is not supported by the vehicle.
 */
export interface ReadinessMonitor {
  supported: boolean;
  complete: boolean | null;
}

// ---------------------------------------------------------------------------
// Control Unit Discovery types (Feature 019)
// ---------------------------------------------------------------------------

/**
 * Scan mode describing how discovery was executed.
 * v1 always uses FUNCTIONAL_THEN_PHYSICAL.
 */
export type ScanMode =
  | 'FUNCTIONAL_ONLY'
  | 'PHYSICAL_ONLY'
  | 'FUNCTIONAL_THEN_PHYSICAL'
  | 'ADVANCED_RANGE'
  | 'TOYOTA_PROFILE'
  | 'MERCEDES_PROFILE';

/**
 * A single probe attempt result during control unit discovery.
 */
export interface ProbeResult {
  method: 'FUNCTIONAL' | 'PHYSICAL';
  requestId: string;
  probe: string;
  responseId: string | null;
  status: 'DISCOVERED' | 'NOT_FOUND' | 'UNKNOWN' | 'ERROR';
  responseType: 'POSITIVE' | 'NEGATIVE' | 'NO_RESPONSE' | 'MALFORMED' | 'ERROR';
  negativeResponseCode: string | null;
  negativeResponseMeaning: string | null;
  rawHeader: string | null;
  rawPayload: string | null;
  rawResponse: string;
  /** Machine-readable error code. Only set when status is ERROR.
   *  Allowed values: TIMEOUT, COMMUNICATION_ERROR, UNEXPECTED_PAYLOAD, ADAPTER_DISCONNECT.
   *  Null for all other statuses. */
  errorCode: string | null;
}

/**
 * Discovery source tracking how a responder was found.
 */
export interface DiscoverySource {
  method: 'FUNCTIONAL' | 'PHYSICAL';
  requestId: string;
  probe: string;
}

/**
 * Responder capabilities derived from probe results.
 */
export interface ResponderCapabilities {
  respondedToF190: boolean;
  positiveF190: boolean;
  negativeF190: boolean;
}

/**
 * A deduplicated responder discovered during control unit discovery.
 */
export interface Responder {
  responseId: string;
  discoveredBy: DiscoverySource[];
  firstSeenBy: 'FUNCTIONAL' | 'PHYSICAL';
  confirmedByPhysical: boolean;
  confidence: 'LOW' | 'HIGH';
  ecuName: null;
  ecuType: null;
  protocol: 'UDS_ON_CAN_11BIT';
  capabilities: ResponderCapabilities;
}

/**
 * Summary statistics for a control unit discovery scan.
 */
export interface DiscoverySummary {
  totalProbes: number;
  respondersFound: number;
  functionalResponders: number;
  physicalResponders: number;
}

/**
 * Control Unit Discovery result stored under DiagnosticSession.vehicleDataJson.
 * Optional — sessions created before Feature 019 will not have this field.
 */
export interface ControlUnitDiscovery {
  version: 1;
  strategy: 'GENERIC_OBD_CAN';
  scanMode: ScanMode;
  probeSequence: string[];
  startedAt: string;
  completedAt: string;
  summary: DiscoverySummary;
  probes: ProbeResult[];
  responders: Responder[];
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
  // Extended PID fields (Feature 018B) — all optional for backward compatibility.
  // Discovery state is represented inside each PID result via the `reason` field.
  stftBank1?: ExtendedPidDataPoint;
  ltftBank1?: ExtendedPidDataPoint;
  stftBank2?: ExtendedPidDataPoint;
  ltftBank2?: ExtendedPidDataPoint;
  map?: ExtendedPidDataPoint;
  maf?: ExtendedPidDataPoint;
  throttlePosition?: ExtendedPidDataPoint;
  // Control Unit Discovery (Feature 019) — optional for backward compatibility.
  controlUnitDiscovery?: ControlUnitDiscovery;
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
 *
 * Extended PID fields (Feature 018B) are accepted but NOT required.
 * Pre-018B payloads without extended fields still pass validation.
 * When present, each extended PID field must have the ExtendedPidDataPoint shape.
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

  // Validate optional extended PID fields if present (Feature 018B).
  // Each must have at least `pid`, `supported`, and `available` properties.
  const extendedPidFields = [
    'stftBank1',
    'ltftBank1',
    'stftBank2',
    'ltftBank2',
    'map',
    'maf',
    'throttlePosition',
  ];
  for (const field of extendedPidFields) {
    if (field in d) {
      const point = d[field];
      if (
        !point ||
        typeof point !== 'object' ||
        !('pid' in (point as object)) ||
        !('supported' in (point as object)) ||
        !('available' in (point as object))
      ) {
        return false;
      }
    }
  }

  // Validate optional Control Unit Discovery field if present (Feature 019).
  // Sessions created before Feature 019 will not have this field — that is OK.
  // When present, it must have the correct structure.
  if ('controlUnitDiscovery' in d && d.controlUnitDiscovery != null) {
    const cud = d.controlUnitDiscovery as Record<string, unknown>;
    if (
      typeof cud !== 'object' ||
      cud.version !== 1 ||
      typeof cud.strategy !== 'string' ||
      typeof cud.scanMode !== 'string' ||
      !Array.isArray(cud.probeSequence) ||
      typeof cud.startedAt !== 'string' ||
      typeof cud.completedAt !== 'string' ||
      typeof cud.summary !== 'object' ||
      cud.summary === null ||
      !Array.isArray(cud.probes) ||
      !Array.isArray(cud.responders)
    ) {
      return false;
    }

    // Validate summary fields
    const summary = cud.summary as Record<string, unknown>;
    if (
      typeof summary.totalProbes !== 'number' ||
      typeof summary.respondersFound !== 'number' ||
      typeof summary.functionalResponders !== 'number' ||
      typeof summary.physicalResponders !== 'number'
    ) {
      return false;
    }

    // Validate probes: each must have required fields
    const validProbeStatuses = ['DISCOVERED', 'NOT_FOUND', 'UNKNOWN', 'ERROR'];
    const validResponseTypes = ['POSITIVE', 'NEGATIVE', 'NO_RESPONSE', 'MALFORMED', 'ERROR'];
    const validErrorCodes = ['TIMEOUT', 'COMMUNICATION_ERROR', 'UNEXPECTED_PAYLOAD', 'ADAPTER_DISCONNECT'];

    for (const probe of cud.probes as Record<string, unknown>[]) {
      if (
        typeof probe.method !== 'string' ||
        typeof probe.requestId !== 'string' ||
        typeof probe.probe !== 'string' ||
        typeof probe.status !== 'string' ||
        typeof probe.responseType !== 'string' ||
        !validProbeStatuses.includes(probe.status) ||
        !validResponseTypes.includes(probe.responseType)
      ) {
        return false;
      }
      // errorCode must be null for non-ERROR statuses
      if (probe.status !== 'ERROR' && probe.errorCode !== null && probe.errorCode !== undefined) {
        return false;
      }
      // errorCode must be a known value when status is ERROR (but preserve unknown for forward compatibility)
      if (probe.status === 'ERROR' && probe.errorCode != null && typeof probe.errorCode !== 'string') {
        return false;
      }
    }

    // Validate responders: each must have required fields
    for (const responder of cud.responders as Record<string, unknown>[]) {
      if (
        typeof responder.responseId !== 'string' ||
        !Array.isArray(responder.discoveredBy) ||
        typeof responder.firstSeenBy !== 'string' ||
        typeof responder.confirmedByPhysical !== 'boolean' ||
        typeof responder.confidence !== 'string' ||
        responder.ecuName !== null ||
        responder.ecuType !== null ||
        typeof responder.protocol !== 'string'
      ) {
        return false;
      }
    }
  }

  return true;
}
