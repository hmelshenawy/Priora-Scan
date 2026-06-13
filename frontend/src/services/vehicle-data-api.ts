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