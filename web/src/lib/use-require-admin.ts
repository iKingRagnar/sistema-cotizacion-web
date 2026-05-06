"use client";

import { getStoredUser } from "@/lib/session";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Con AUTH desactivada en servidor: permite ver la página.
 * Con AUTH activa: solo admin; si no, redirige a /.
 */
export function useRequireAdminRedirect(): boolean | null {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/config");
        const cfg = r.ok ? await r.json() : {};
        if (cfg.authRequired === false) {
          if (!cancelled) setAllowed(true);
          return;
        }
      } catch {
        /* sigue con sesión */
      }
      const u = getStoredUser();
      if (cancelled) return;
      if (u?.role === "admin") setAllowed(true);
      else {
        setAllowed(false);
        router.replace("/");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return allowed;
}
