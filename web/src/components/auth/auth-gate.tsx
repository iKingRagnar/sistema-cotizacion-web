"use client";

import { apiFetch, getStoredToken } from "@/lib/api";
import { setStoredUser } from "@/lib/session";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type Config = { authRequired?: boolean };

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let cfg: Config = { authRequired: true };
      try {
        const r = await fetch("/api/config");
        if (r.ok) cfg = await r.json();
      } catch {
        /* red a API */
      }
      if (!cfg.authRequired) {
        if (!cancelled) setOk(true);
        return;
      }
      const tok = getStoredToken();
      if (!tok) {
        const next = typeof window !== "undefined" ? window.location.pathname || "/" : "/";
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      try {
        const me = await apiFetch<{ user: { id: number; username: string; role: string; displayName: string } }>(
          "/api/auth/me"
        );
        if (cancelled) return;
        setStoredUser(me.user);
        setOk(true);
      } catch {
        if (cancelled) return;
        const next = typeof window !== "undefined" ? window.location.pathname || "/" : "/";
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (ok === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Verificando sesión…
      </div>
    );
  }
  return <>{children}</>;
}
