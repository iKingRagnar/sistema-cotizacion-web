/**
 * Tipos compartidos entre frontend y backend.
 * Re-export de schemas inferidos + tipos de respuestas API.
 */
export type { Role, LoginInput, UserPublic } from './schemas.js';

export interface ApiError {
  error: string;
  detail?: string;
  issues?: Array<{ path: string; message: string }>;
}

export interface LoginResponse {
  ok: true;
  user: import('./schemas.js').UserPublic;
  token: string;
}

export interface MeResponse {
  user: import('./schemas.js').UserPublic;
}
