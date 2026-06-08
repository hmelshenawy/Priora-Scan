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

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 403 && error.response?.data?.code?.startsWith('CSRF')) {
      window.location.reload();
    }
    return Promise.reject(error);
  },
);

export default apiClient;
