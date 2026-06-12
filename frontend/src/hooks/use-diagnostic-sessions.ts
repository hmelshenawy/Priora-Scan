'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../lib/api-client';
import {
  createDiagnosticSession,
  fetchDiagnosticSession,
  fetchVehicleDiagnosticSessions,
  updateDiagnosticSession,
  CreateDiagnosticSessionInput,
  UpdateDiagnosticSessionInput,
  DiagnosticSession,
} from '../lib/api-client';

interface VehicleSummary {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  plateNumber: string | null;
}

interface PaginatedVehiclesResponse {
  data: VehicleSummary[];
}

interface FaultCodeListResponse {
  data: unknown[];
}

export interface DiagnosticSessionListItem extends DiagnosticSession {
  vehicle: VehicleSummary;
  vehicleLabel: string;
  faultCount: number | null;
}

async function fetchDiagnosticSessionList(): Promise<DiagnosticSessionListItem[]> {
  const vehiclesResponse = await apiClient.get<PaginatedVehiclesResponse>(
    '/api/v1/vehicles',
    {
      params: { page: 1, limit: 100 },
    },
  );

  const vehicles = vehiclesResponse.data.data ?? [];
  const sessionsByVehicle = await Promise.all(
    vehicles.map(async (vehicle) => {
      try {
        const sessions = await fetchVehicleDiagnosticSessions(
          vehicle.id,
          1,
          25,
        );
        return { vehicle, sessions };
      } catch {
        return { vehicle, sessions: [] as DiagnosticSession[] };
      }
    }),
  );

  const rows = sessionsByVehicle.flatMap(({ vehicle, sessions }) =>
    sessions.map((session) => ({
      ...session,
      vehicle,
      vehicleLabel: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      faultCount: null,
    })),
  );

  const rowsWithCounts = await Promise.all(
    rows.map(async (row) => {
      try {
        const response = await apiClient.get<FaultCodeListResponse>(
          `/obd/scans/sessions/${row.id}/results`,
        );
        return {
          ...row,
          faultCount: response.data.data?.length ?? 0,
        };
      } catch {
        return row;
      }
    }),
  );

  return rowsWithCounts.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function useVehicleSessions(
  vehicleId: string,
  page = 1,
  limit = 25,
) {
  return useQuery<DiagnosticSession[]>({
    queryKey: ['vehicleSessions', vehicleId, page, limit],
    queryFn: () => fetchVehicleDiagnosticSessions(vehicleId, page, limit),
    enabled: !!vehicleId,
  });
}

export function useDiagnosticSession(sessionId: string) {
  return useQuery<DiagnosticSession>({
    queryKey: ['diagnosticSession', sessionId],
    queryFn: () => fetchDiagnosticSession(sessionId),
    enabled: !!sessionId,
  });
}

export function useDiagnosticSessionList() {
  return useQuery<DiagnosticSessionListItem[]>({
    queryKey: ['diagnosticSessions', 'global'],
    queryFn: fetchDiagnosticSessionList,
    staleTime: 30 * 1000,
  });
}

export function useCreateDiagnosticSession(vehicleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateDiagnosticSessionInput) =>
      createDiagnosticSession(vehicleId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicleSessions', vehicleId] });
    },
  });
}

export function useUpdateDiagnosticSession(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateDiagnosticSessionInput) =>
      updateDiagnosticSession(sessionId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diagnosticSession', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['vehicleSessions'] });
    },
  });
}
