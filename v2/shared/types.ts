/**
 * Re-export de schemas inferidos + tipos de respuestas API.
 */
export type * from './schemas.js';

export interface ApiError {
  error: string;
  detail?: string;
  issues?: Array<{ path: string; message: string }>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LoginResponse {
  ok: true;
  user: import('./schemas.js').UserPublic;
  token: string;
}

export interface MeResponse {
  user: import('./schemas.js').UserPublic;
}
