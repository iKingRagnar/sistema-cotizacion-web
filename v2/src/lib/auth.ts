/**
 * Gestión del token + usuario actual.
 * Token en localStorage como backup; cookie httpOnly es fuente principal.
 */
import type { UserPublic, LoginResponse } from '@shared/types';

const TOKEN_KEY = 'v2-auth-token';
const USER_KEY = 'v2-auth-user';

export function getAuthToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getCurrentUser(): UserPublic | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserPublic) : null;
  } catch { return null; }
}

export function saveAuth(res: LoginResponse): void {
  try {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  } catch { /* ignorar quota errors */ }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}
