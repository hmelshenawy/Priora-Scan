'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import apiClient from '../lib/api-client';
import { CreateVehicleInput, UpdateVehicleInput } from '../lib/validators/vehicle.schema';

export interface Vehicle {
  id: string;
  organizationId: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  plateNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedVehicles {
  data: Vehicle[];
  pagination: PaginationMeta;
}

export interface VehicleFilters {
  search?: string;
  make?: string;
  model?: string;
  year?: string;
  page?: number;
  limit?: number;
}

async function createVehicle(data: CreateVehicleInput): Promise<Vehicle> {
  const response = await apiClient.post<Vehicle>('/api/v1/vehicles', data);
  return response.data;
}

async function updateVehicle({
  id,
  data,
}: {
  id: string;
  data: UpdateVehicleInput;
}): Promise<Vehicle> {
  const response = await apiClient.patch<Vehicle>(`/api/v1/vehicles/${id}`, data);
  return response.data;
}

async function fetchVehicles(filters: VehicleFilters = {}): Promise<PaginatedVehicles> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.make) params.set('make', filters.make);
  if (filters.model) params.set('model', filters.model);
  if (filters.year) params.set('year', filters.year);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const query = params.toString();
  const url = `/api/v1/vehicles${query ? `?${query}` : ''}`;

  const response = await apiClient.get<PaginatedVehicles>(url);
  return response.data;
}

async function fetchVehicle(id: string): Promise<Vehicle> {
  const response = await apiClient.get<Vehicle>(`/api/v1/vehicles/${id}`);
  return response.data;
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createVehicle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}

export function useUpdateVehicle(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateVehicleInput) => updateVehicle({ id, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle', id] });
    },
  });
}

export function useVehicles(filters: VehicleFilters = {}) {
  return useQuery({
    queryKey: ['vehicles', filters],
    queryFn: () => fetchVehicles(filters),
    placeholderData: keepPreviousData,
  });
}

export function useVehicle(id: string) {
  return useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => fetchVehicle(id),
    enabled: !!id,
  });
}
