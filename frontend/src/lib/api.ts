// src/lib/api.ts
// ─────────────────────────────────────────────────────────────
// Axios API Client — MyLocalBazaar Frontend
// Auto-attaches JWT, handles token refresh, parses responses
// ─────────────────────────────────────────────────────────────

import axios, {
  AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig,
} from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
const hasBrowserStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const api: AxiosInstance = axios.create({
  baseURL:         BASE_URL,
  timeout:         15000,
  withCredentials: false,
  headers: {
    'Content-Type': 'application/json',
    Accept:         'application/json',
  },
});

// ── Request interceptor: attach JWT ───────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (hasBrowserStorage()) {
    const token = window.localStorage.getItem('mlb_access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ── Response interceptor: handle 401 → refresh ────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      if (!hasBrowserStorage()) return Promise.reject(error);
      try {
        const refreshToken = window.localStorage.getItem('mlb_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/auth/customer/refresh`, {
          refresh_token: refreshToken,
        });

        window.localStorage.setItem('mlb_access_token',  data.data.tokens.access_token);
        window.localStorage.setItem('mlb_refresh_token', data.data.tokens.refresh_token);

        originalRequest.headers.Authorization = `Bearer ${data.data.tokens.access_token}`;
        return api(originalRequest);
      } catch {
        window.localStorage.removeItem('mlb_access_token');
        window.localStorage.removeItem('mlb_refresh_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ── Pagination type ────────────────────────────────────────────
export interface PaginationMeta {
  total: number;
  page:  number;
  limit: number;
  pages: number;
}

// ── Token storage helpers ──────────────────────────────────────
// Centralises the localStorage keys so they stay in sync with the
// request interceptor above (which reads 'mlb_access_token').
export const tokenStorage = {
  setAccess:  (token: string) => {
    if (hasBrowserStorage()) window.localStorage.setItem('mlb_access_token', token);
  },
  setRefresh: (token: string) => {
    if (hasBrowserStorage()) window.localStorage.setItem('mlb_refresh_token', token);
  },
  getAccess:  () => (hasBrowserStorage() ? window.localStorage.getItem('mlb_access_token') : null),
  getRefresh: () => (hasBrowserStorage() ? window.localStorage.getItem('mlb_refresh_token') : null),
  clear:      ()              => {
    if (!hasBrowserStorage()) return;
    window.localStorage.removeItem('mlb_access_token');
    window.localStorage.removeItem('mlb_refresh_token');
  },
};

// ── Error message extractor ────────────────────────────────────
// Pulls the most human-readable string out of an Axios error or
// any unknown thrown value.
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (
      err.response?.data?.message ||
      err.response?.data?.error   ||
      err.message                 ||
      'Something went wrong'
    );
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

// ── Typed helper wrappers ──────────────────────────────────────
export const apiGet = <T>(url: string, config?: AxiosRequestConfig) =>
  api.get<{ success: boolean; data: T; message: string }>(url, config)
    .then((r) => r.data);

export const apiPost = <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
  api.post<{ success: boolean; data: T; message: string }>(url, body, config)
    .then((r) => r.data);

export const apiPatch = <T>(url: string, body?: unknown) =>
  api.patch<{ success: boolean; data: T; message: string }>(url, body)
    .then((r) => r.data);

export const apiDelete = <T>(url: string, config?: AxiosRequestConfig) =>
  api.delete<{ success: boolean; data: T; message: string }>(url, config)
    .then((r) => r.data);

export const apiPostForm = <T>(url: string, form: FormData, config?: AxiosRequestConfig) =>
  api.post<{ success: boolean; data: T; message: string }>(url, form, {
    ...config,
    headers: { ...config?.headers, 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export default api;
