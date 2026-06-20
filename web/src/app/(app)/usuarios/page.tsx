"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mainNav } from "@/config/nav";
import { apiFetch } from "@/lib/api";
import { getStoredUser } from "@/lib/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type AppUser = {
  id: number;
  username: string;
  role: string;
  display_name?: string | null;
  activo?: number | null;
  creado_en?: string | null;
  tab_permissions?: Record<string, boolean> | string | null;
  column_permissions?: Record<string, string[]> | string | null;
};

const ROLES = [
  { value: "invitado", label: "Invitado (solo ver)" },
  { value: "consulta", label: "Consulta (solo ver)" },
  { value: "usuario", label: "Usuario (cotizar y reportes)" },
  { value: "operador", label: "Operador (igual que usuario)" },
  { value: "admin", label: "Administrador" },
];

export default function UsuariosPage() {
  const qc = useQueryClient();
  const [allowed, setAllowed] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", display_name: "", role: "invitado" });
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [tabPermissions, setTabPermissions] = useState<Record<string, boolean>>({});
  const [columnsRaw, setColumnsRaw] = useState("{}");

  useEffect(() => {
    setAllowed(getStoredUser()?.role === "admin");
  }, []);

  const q = useQuery({
    queryKey: ["app-users"],
    queryFn: () => apiFetch<AppUser[]>("/api/app-users"),
    enabled: allowed,
  });

  const createM = useMutation({
    mutationFn: () =>
      apiFetch<AppUser>("/api/app-users", {
        method: "POST",
        body: JSON.stringify({
          username: form.username.trim().toLowerCase(),
          password: form.password,
          display_name: form.display_name.trim() || form.username.trim().toLowerCase(),
          role: form.role,
        }),
      }),
    onSuccess: () => {
      toast.success("Usuario creado");
      setForm({ username: "", password: "", display_name: "", role: "invitado" });
      qc.invalidateQueries({ queryKey: ["app-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchM = useMutation({
    mutationFn: (payload: { id: number; body: Record<string, unknown> }) =>
      apiFetch<AppUser>(`/api/app-users/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload.body),
      }),
    onSuccess: () => {
      toast.success("Usuario actualizado");
      qc.invalidateQueries({ queryKey: ["app-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accessM = useMutation({
    mutationFn: (payload: { id: number; body: Record<string, unknown> }) =>
      apiFetch<AppUser>(`/api/app-users/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload.body),
      }),
    onSuccess: () => {
      toast.success("Permisos actualizados");
      qc.invalidateQueries({ queryKey: ["app-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function parseJsonObject<T>(value: unknown, fallback: T): T {
    if (!value) return fallback;
    if (typeof value === "object") return value as T;
    if (typeof value !== "string") return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  useEffect(() => {
    const users = q.data ?? [];
    if (!users.length) return;
    const current = selectedUserId ? users.find((u) => u.id === selectedUserId) : users[0];
    if (!current) return;
    if (selectedUserId == null) setSelectedUserId(current.id);
    const tabs = parseJsonObject<Record<string, boolean>>(current.tab_permissions, {});
    setTabPermissions(tabs);
    const cols = parseJsonObject<Record<string, string[]>>(current.column_permissions, {});
    setColumnsRaw(JSON.stringify(cols, null, 2));
  }, [q.data, selectedUserId]);

  const columns = useMemo<ColumnDef<AppUser>[]>(
    () => [
      { accessorKey: "username", header: "Usuario" },
      { accessorKey: "display_name", header: "Nombre", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "role",
        header: "Rol",
        cell: ({ row }) => (
          <select
            className="h-8 max-w-[200px] rounded-md border border-input bg-background px-2 text-xs capitalize"
            value={row.original.role}
            onChange={(e) =>
              patchM.mutate({
                id: row.original.id,
                body: { role: e.target.value },
              })
            }
            aria-label={`Rol de ${row.original.username}`}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        ),
      },
      {
        accessorKey: "activo",
        header: "Activo",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={!!row.original.activo}
              onCheckedChange={(c) =>
                patchM.mutate({
                  id: row.original.id,
                  body: { activo: c === true },
                })
              }
              aria-label="Activo"
            />
            <Badge variant={row.original.activo ? "secondary" : "outline"}>
              {row.original.activo ? "Sí" : "No"}
            </Badge>
          </div>
        ),
      },
    ],
    [patchM]
  );

  if (!allowed) {
    return (
      <GlassCard className="p-8 max-w-lg mx-auto mt-8">
        <p className="text-sm text-muted-foreground">
          Solo el administrador puede gestionar cuentas. Si necesitas acceso, pide al administrador del sistema.
        </p>
      </GlassCard>
    );
  }

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageToolbar>
        <div>
          <h2 className="text-xl font-semibold font-heading">Usuarios del sistema</h2>
          <p className="text-sm text-muted-foreground">
            Crear cuentas con rol invitado (solo lectura) o usuario (cotizaciones y reportes). Solo el administrador
            ve este apartado.
          </p>
        </div>
      </PageToolbar>

      <GlassCard className="p-4 md:p-6 space-y-4">
        <h3 className="text-sm font-medium">Nuevo usuario</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nu">Usuario (minúsculas)</Label>
            <Input
              id="nu"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="ej. maria.perez"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np">Contraseña inicial</Label>
            <Input
              id="np"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nd">Nombre para mostrar</Label>
            <Input
              id="nd"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="Nombre completo"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nr">Rol</Label>
            <select
              id="nr"
              className="flex h-9 w-full rounded-md border border-input bg-muted/30 px-3 py-1 text-sm shadow-sm"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => createM.mutate()}
          disabled={createM.isPending || !form.username.trim() || !form.password}
        >
          Crear usuario
        </Button>
      </GlassCard>

      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>

      <GlassCard className="p-4 md:p-6 space-y-4">
        <h3 className="text-sm font-medium">Permisos por pestaña y columnas</h3>
        <p className="text-sm text-muted-foreground">
          Activa o desactiva pestañas por usuario. Para columnas, usa JSON por ruta con nombres de columna
          (accessorKey, id o header). Ejemplo: {`{"/ventas":["folio","total"]}`}.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="perm-user">Usuario</Label>
          <select
            id="perm-user"
            className="flex h-9 w-full rounded-md border border-input bg-muted/30 px-3 py-1 text-sm shadow-sm"
            value={selectedUserId ?? ""}
            onChange={(e) => setSelectedUserId(Number(e.target.value))}
          >
            {(q.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} ({u.role})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {mainNav.map((item) => (
            <label key={item.href} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={tabPermissions[item.href] !== false}
                onCheckedChange={(v) =>
                  setTabPermissions((prev) => ({
                    ...prev,
                    [item.href]: v === true,
                  }))
                }
              />
              <span>{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.href}</span>
            </label>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="columns-json">Columnas visibles por ruta (JSON)</Label>
          <textarea
            id="columns-json"
            className="min-h-40 w-full rounded-md border border-input bg-muted/20 px-3 py-2 text-xs font-mono"
            value={columnsRaw}
            onChange={(e) => setColumnsRaw(e.target.value)}
            spellCheck={false}
          />
        </div>
        <Button
          type="button"
          disabled={!selectedUserId || accessM.isPending}
          onClick={() => {
            try {
              const parsed = JSON.parse(columnsRaw || "{}") as Record<string, string[]>;
              accessM.mutate({
                id: selectedUserId as number,
                body: {
                  tab_permissions: tabPermissions,
                  column_permissions: parsed,
                },
              });
            } catch {
              toast.error("JSON de columnas inválido");
            }
          }}
        >
          Guardar permisos
        </Button>
      </GlassCard>
    </div>
  );
}
