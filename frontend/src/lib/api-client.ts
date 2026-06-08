import axios from 'axios';
import { getCsrfTokenFromCookie } from './csrf';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3101',
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
let refreshSubscribers: Array<(token: string) => void> = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function redirectToLogin() {
  if (typeof window !== 'undefined') {
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
        return new Promise((resolve) => {
          addRefreshSubscriber((token: string) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await axios.post(
          `${apiClient.defaults.baseURL}/auth/refresh`,
          {},
          { withCredentials: true },
        );

        const newToken = refreshResponse.data.access_token;
        isRefreshing = false;
        onRefreshed(newToken);

        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch {
        isRefreshing = false;
        refreshSubscribers = [];
        redirectToLogin();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
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
): Promise<DiagnosticSession[]> {
  const response = await apiClient.get<DiagnosticSession[]>(
    `/api/v1/vehicles/${vehicleId}/diagnostic-sessions`,
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
