'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDiagnosticSession,
  fetchDiagnosticSession,
  fetchVehicleDiagnosticSessions,
  updateDiagnosticSession,
  CreateDiagnosticSessionInput,
  UpdateDiagnosticSessionInput,
  DiagnosticSession,
} from '../lib/api-client';

export function useVehicleSessions(vehicleId: string) {
  return useQuery<DiagnosticSession[]>({
    queryKey: ['vehicleSessions', vehicleId],
    queryFn: () => fetchVehicleDiagnosticSessions(vehicleId),
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
