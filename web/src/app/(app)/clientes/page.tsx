"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { downloadText, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

type Cliente = {
  id: number;
  codigo?: string | null;
  nombre: string;
  rfc?: string | null;
  ciudad?: string | null;
  telefono?: string | null;
  email?: string | null;
};

export default function ClientesPage() {
  const q = useQuery({ queryKey: ["clientes"], queryFn: () => apiFetch<Cliente[]>("/api/clientes") });

  const columns = useMemo<ColumnDef<Cliente>[]>(
    () => [
      { accessorKey: "codigo", header: "Código", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "nombre", header: "Nombre" },
      { accessorKey: "ciudad", header: "Ciudad", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "telefono", header: "Teléfono", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "email", header: "Email", cell: ({ getValue }) => getValue() || "—" },
      {
        id: "rfc",
        header: "RFC",
        cell: ({ row }) => <Badge variant="secondary">{row.original.rfc || "—"}</Badge>,
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((c) => [
      c.codigo,
      c.nombre,
      c.ciudad,
      c.telefono,
      c.email,
      c.rfc,
    ]);
    downloadText(
      `clientes-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["codigo", "nombre", "ciudad", "telefono", "email", "rfc"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Clientes</h2>
        <p className="text-sm text-muted-foreground">Catálogo de razones sociales y contacto</p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
