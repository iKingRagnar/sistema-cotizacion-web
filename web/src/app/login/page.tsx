"use client";

import { AmbientBackdrop } from "@/components/premium/ambient-backdrop";
import { GlassCard } from "@/components/premium/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setStoredToken } from "@/lib/api";
import { setStoredUser } from "@/lib/session";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const cfgRes = await fetch("/api/config");
      const cfg = cfgRes.ok ? await cfgRes.json() : {};
      if (cfg.authRequired === false) {
        router.replace(next.startsWith("/") ? next : "/");
        return;
      }
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "No se pudo iniciar sesión");
        return;
      }
      if (!data.token || !data.user) {
        setErr("Respuesta inválida del servidor");
        return;
      }
      setStoredToken(data.token);
      setStoredUser({
        id: data.user.id,
        username: data.user.username,
        role: data.user.role,
        displayName: data.user.displayName || data.user.username,
      });
      router.replace(next.startsWith("/") ? next : "/");
    } catch {
      setErr("Error de red. ¿Está corriendo la API?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AmbientBackdrop />
      <GlassCard className="relative z-10 w-full max-w-md p-8 border-border/60 shadow-2xl">
        <h1 className="text-xl font-semibold font-[family-name:var(--font-heading)] tracking-tight">
          Gestor administrativo
        </h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6">Inicia sesión para continuar</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user">Usuario</Label>
            <Input
              id="user"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-muted/30"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pass">Contraseña</Label>
            <Input
              id="pass"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-muted/30"
              required
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </GlassCard>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <GlassCard className="relative z-10 w-full max-w-md p-8 border-border/60">
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </GlassCard>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
