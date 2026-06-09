'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import apiClient from '../lib/api-client';

export type ScanJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'NEEDS_VEHICLE_CONFIRMATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ScanJob {
  id: string;
  status: ScanJobStatus;
  vehicleId?: string;
  diagnosticSessionId?: string;
  vin?: string;
  adapterType?: string;
  adapterProtocol?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface FaultCode {
  id: string;
  code: string;
  status: string;
  ecu?: string;
  source: string;
  importedAt: string;
}

export interface ConfirmVehicleInput {
  make: string;
  model: string;
  year: number;
  vin: string;
  plateNumber?: string;
}

async function startScan(agentId: string): Promise<ScanJob> {
  const response = await apiClient.post<ScanJob>(
    `/obd/scans?agentId=${encodeURIComponent(agentId)}`,
    {},
  );
  return response.data;
}

async function fetchScanJob(id: string): Promise<ScanJob> {
  const response = await apiClient.get<ScanJob>(`/obd/scans/${id}`);
  return response.data;
}

async function cancelScan(id: string): Promise<ScanJob> {
  const response = await apiClient.post<ScanJob>(`/obd/scans/${id}/cancel`, {});
  return response.data;
}

async function confirmVehicle(
  id: string,
  input: ConfirmVehicleInput,
): Promise<ScanJob> {
  const response = await apiClient.post<ScanJob>(
    `/obd/scans/${id}/confirm-vehicle`,
    input,
  );
  return response.data;
}

async function fetchScanResults(id: string): Promise<{ data: FaultCode[] }> {
  const response = await apiClient.get<{ data: FaultCode[] }>(
    `/obd/scans/${id}/results`,
  );
  return response.data;
}

export function useScanJob(id: string | null) {
  const isActive =
    id !== null;

  return useQuery<ScanJob>({
    queryKey: ['obd', 'scan', id],
    queryFn: () => fetchScanJob(id!),
    enabled: isActive,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (
        status === 'PENDING' ||
        status === 'RUNNING' ||
        status === 'NEEDS_VEHICLE_CONFIRMATION'
      ) {
        return 2000;
      }
      return false;
    },
    staleTime: 1000,
  });
}

export function useStartScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obd', 'agents'] });
    },
  });
}

export function useCancelScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obd', 'scan'] });
    },
  });
}

export function useConfirmVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConfirmVehicleInput }) =>
      confirmVehicle(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obd', 'scan'] });
    },
  });
}

async function fetchSessionFaultCodes(
  sessionId: string,
): Promise<{ data: FaultCode[] }> {
  const response = await apiClient.get<{ data: FaultCode[] }>(
    `/obd/scans/sessions/${sessionId}/results`,
  );
  return response.data;
}

export function useScanResults(id: string | null) {
  return useQuery<{ data: FaultCode[] }>({
    queryKey: ['obd', 'scan', id, 'results'],
    queryFn: () => fetchScanResults(id!),
    enabled: id !== null,
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

export function useSessionFaultCodes(sessionId: string | null) {
  return useQuery<{ data: FaultCode[] }>({
    queryKey: ['obd', 'session', sessionId, 'fault-codes'],
    queryFn: () => fetchSessionFaultCodes(sessionId!),
    enabled: sessionId !== null,
  });
}
