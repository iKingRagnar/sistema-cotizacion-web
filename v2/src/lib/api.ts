/**
 * Cliente HTTP type-safe.
 * Centraliza fetch + manejo de errores + auto-attach del token.
 */
import type { ApiError } from '@shared/types';
import { getAuthToken, clearAuth } from './auth.js';

export class ApiException extends Error {
  status: number;
  detail?: string;
  issues?: ApiError['issues'];
  constructor(status: number, payload: ApiError) {
    super(payload.error || 'Error desconocido');
    this.status = status;
    this.detail = payload.detail;
    this.issues = payload.issues;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(path, location.origin);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers = new Headers(opts.headers);
  const token = getAuthToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (opts.body instanceof FormData) {
      body = opts.body;
    } else {
      body = JSON.stringify(opts.body);
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    }
  }

  const res = await fetch(url.toString(), {
    ...opts,
    headers,
    body,
    credentials: 'include',
  });

  if (res.status === 204) return undefined as T;

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    if (res.status === 401) clearAuth();
    throw new ApiException(res.status, typeof data === 'object' ? data : { error: String(data) });
  }
  return data as T;
}

export const api = {
  get:    <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'GET' }),
  post:   <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'POST', body }),
  put:    <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'PUT', body }),
  patch:  <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'DELETE' }),
};
