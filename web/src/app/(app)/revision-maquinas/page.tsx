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

type Rev = {
  id: number;
  categoria?: string | null;
  modelo?: string | null;
  numero_serie?: string | null;
  entregado?: string | null;
  prueba?: string | null;
  comentarios?: string | null;
  maquina_modelo?: string | null;
  maquina_categoria?: string | null;
};

export default function RevisionMaquinasPage() {
  const q = useQuery({
    queryKey: ["revision-maquinas"],
    queryFn: () => apiFetch<Rev[]>("/api/revision-maquinas"),
  });

  const columns = useMemo<ColumnDef<Rev>[]>(
    () => [
      { accessorKey: "id", header: "ID" },
      { accessorKey: "maquina_categoria", header: "Cat. máq.", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "modelo", header: "Modelo" },
      { accessorKey: "numero_serie", header: "Serie", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "entregado",
        header: "Entregado",
        cell: ({ row }) => (
          <Badge variant={row.original.entregado === "Sí" ? "default" : "secondary"}>
            {row.original.entregado || "—"}
          </Badge>
        ),
      },
      {
        accessorKey: "prueba",
        header: "Prueba",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.prueba || "—"}
          </Badge>
        ),
      },
      {
        accessorKey: "comentarios",
        header: "Observaciones",
        cell: ({ getValue }) => (
          <span className="max-w-[240px] truncate block" title={String(getValue() || "")}>
            {String(getValue() || "—")}
          </span>
        ),
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((r) => [
      r.id,
      r.maquina_categoria,
      r.modelo,
      r.numero_serie,
      r.entregado,
      r.prueba,
      r.comentarios,
    ]);
    downloadText(
      `revision-maquinas-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["id", "categoria", "modelo", "serie", "entregado", "prueba", "comentarios"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Revisión de máquinas</h2>
        <p className="text-sm text-muted-foreground">Checklist de entrega y pruebas (fotos en roadmap)</p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
