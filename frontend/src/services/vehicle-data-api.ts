'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import apiClient from '../lib/api-client';

/**
 * Vehicle data point shape — matches API contract.
 */
export interface VehicleDataPoint {
  value: string | number | Record<string, unknown> | unknown[] | null;
  unit?: string;
  supported: boolean;
  details?: Record<string, unknown>;
}

/**
 * Readiness monitor status for a single monitor.
 */
export interface ReadinessMonitor {
  supported: boolean;
  complete: boolean | null;
}

/**
 * Extended PID data point — a single extended PID result from vehicle health.
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
 * Control Unit Discovery result stored under VehicleDataJson.
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
 * Full vehicle data shape returned by the API.
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
 * Response from GET /vehicle-data
 */
export interface VehicleDataResponse {
  sessionId: string;
  vehicleData: VehicleDataJson | null;
  readAt: string | null;
}

/**
 * Response from POST /vehicle-data/read
 */
export interface VehicleDataReadResponse {
  sessionId: string;
  status: string;
  message: string;
}

/**
 * Trigger a vehicle data read for a session.
 * POST /api/v1/diagnostic-sessions/:sessionId/vehicle-data/read
 */
async function readVehicleData(sessionId: string): Promise<VehicleDataReadResponse> {
  const response = await apiClient.post<VehicleDataReadResponse>(
    `/api/v1/diagnostic-sessions/${sessionId}/vehicle-data/read`,
    {},
  );
  return response.data;
}

/**
 * Fetch vehicle data for a session.
 * GET /api/v1/diagnostic-sessions/:sessionId/vehicle-data
 */
async function getVehicleData(sessionId: string): Promise<VehicleDataResponse> {
  const response = await apiClient.get<VehicleDataResponse>(
    `/api/v1/diagnostic-sessions/${sessionId}/vehicle-data`,
  );
  return response.data;
}

/**
 * Hook to fetch vehicle data for a diagnostic session.
 */
export function useVehicleData(sessionId: string | null) {
  return useQuery<VehicleDataResponse>({
    queryKey: ['vehicle-data', sessionId],
    queryFn: () => getVehicleData(sessionId!),
    enabled: sessionId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Hook to trigger a vehicle data read.
 * After mutation, invalidates the vehicle-data query to refetch.
 */
export function useReadVehicleData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: readVehicleData,
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({
        queryKey: ['vehicle-data', sessionId],
      });
    },
  });
}
