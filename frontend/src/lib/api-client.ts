import axios from 'axios';
import { getCsrfTokenFromCookie } from './csrf';

export interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
}

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3101',
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase() || '';
  if (['post', 'patch', 'put', 'delete'].includes(method)) {
    const csrfToken = getCsrfTokenFromCookie();
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

let isRefreshing = false;
let refreshSubscribers: Array<{
  resolve: () => void;
  reject: (error: unknown) => void;
}> = [];

function onRefreshed() {
  refreshSubscribers.forEach(({ resolve }) => resolve());
  refreshSubscribers = [];
}

function onRefreshFailed(error: unknown) {
  refreshSubscribers.forEach(({ reject }) => reject(error));
  refreshSubscribers = [];
}

function addRefreshSubscriber(
  resolve: () => void,
  reject: (error: unknown) => void,
) {
  refreshSubscribers.push({ resolve, reject });
}

function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 403 &&
      error.response?.data?.code?.startsWith('CSRF')
    ) {
      window.location.reload();
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          addRefreshSubscriber(
            () => resolve(apiClient(originalRequest)),
            reject,
          );
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await axios.post(
          `${apiClient.defaults.baseURL}/api/v1/auth/refresh`,
          {},
          { withCredentials: true },
        );

        isRefreshing = false;
        onRefreshed();

        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        onRefreshFailed(refreshError);
        redirectToLogin();
        return Promise.reject(error);
      }
    }

    const normalizedError = new Error(
      error.response?.data?.message || error.message || 'An unexpected API error occurred.',
    ) as ApiError;

    normalizedError.status = error.response?.status;
    normalizedError.code = error.response?.data?.code;
    normalizedError.details = error.response?.data;

    return Promise.reject(normalizedError);
  },
);

export interface DiagnosticSession {
  id: string;
  organizationId: string;
  vehicleId: string;
  number: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  title?: string | null;
  description?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDiagnosticSessionInput {
  title?: string;
  description?: string;
}

export interface UpdateDiagnosticSessionInput {
  status?: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  title?: string;
  description?: string;
}

export async function createDiagnosticSession(
  vehicleId: string,
  payload: CreateDiagnosticSessionInput,
): Promise<DiagnosticSession> {
  const response = await apiClient.post<DiagnosticSession>(
    `/api/v1/vehicles/${vehicleId}/diagnostic-sessions`,
    payload,
  );
  return response.data;
}

export async function fetchVehicleDiagnosticSessions(
  vehicleId: string,
  page = 1,
  limit = 25,
): Promise<DiagnosticSession[]> {
  const response = await apiClient.get<DiagnosticSession[]>(
    `/api/v1/vehicles/${vehicleId}/diagnostic-sessions`,
    {
      params: {
        page,
        limit,
      },
    },
  );
  return response.data;
}

export async function fetchDiagnosticSession(
  sessionId: string,
): Promise<DiagnosticSession> {
  const response = await apiClient.get<DiagnosticSession>(
    `/api/v1/diagnostic-sessions/${sessionId}`,
  );
  return response.data;
}

export async function updateDiagnosticSession(
  sessionId: string,
  payload: UpdateDiagnosticSessionInput,
): Promise<DiagnosticSession> {
  const response = await apiClient.patch<DiagnosticSession>(
    `/api/v1/diagnostic-sessions/${sessionId}`,
    payload,
  );
  return response.data;
}

export default apiClient;
