"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { apiFetch } from "@/lib/api";
import { downloadText, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

type AuditRow = {
  id: number;
  username?: string | null;
  role?: string | null;
  action?: string | null;
  method?: string | null;
  path?: string | null;
  detail?: string | null;
  ip?: string | null;
  creado_en?: string | null;
};

type AuditRes = { rows: AuditRow[]; total: number };

export default function AuditoriaPage() {
  const q = useQuery({
    queryKey: ["audit"],
    queryFn: () => apiFetch<AuditRes>("/api/audit?limit=200"),
  });

  const columns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      { accessorKey: "id", header: "ID" },
      { accessorKey: "creado_en", header: "Fecha/Hora", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "username", header: "Usuario", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "role", header: "Rol", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "method", header: "Método", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "path", header: "Ruta", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "action",
        header: "Acción",
        cell: ({ getValue }) => (
          <span className="max-w-[200px] truncate block" title={String(getValue() || "")}>
            {String(getValue() || "—")}
          </span>
        ),
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data?.rows ?? []).map((r) => [
      r.id,
      r.creado_en,
      r.username,
      r.role,
      r.method,
      r.path,
      r.action,
    ]);
    downloadText(
      `auditoria-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["id", "fecha", "usuario", "rol", "metodo", "ruta", "accion"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Auditoría</h2>
        <p className="text-sm text-muted-foreground">
          Registro de mutaciones · Total: {q.data?.total ?? "—"} (muestra {q.data?.rows?.length ?? 0})
        </p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data?.rows ?? []} />
      </GlassCard>
    </div>
  );
}
