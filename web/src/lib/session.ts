import { setStoredToken } from "@/lib/api";

const USER_KEY = "ga_auth_user";

export type SessionUser = {
  id: number;
  username: string;
  role: string;
  displayName: string;
  tabPermissions?: Record<string, boolean> | null;
  columnPermissions?: Record<string, string[]> | null;
};

export function getStoredUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem(USER_KEY);
    if (!s) return null;
    return JSON.parse(s) as SessionUser;
  } catch {
    return null;
  }
}

export function setStoredUser(u: SessionUser | null) {
  if (typeof window === "undefined") return;
  if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
  else localStorage.removeItem(USER_KEY);
}

export function clearSession() {
  setStoredToken(null);
  setStoredUser(null);
}
