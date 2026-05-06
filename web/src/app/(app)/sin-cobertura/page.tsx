"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { apiFetch } from "@/lib/api";
import { downloadText, formatDateMx, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

type Gar = {
  id: number;
  razon_social: string;
  modelo_maquina: string;
  numero_serie?: string | null;
  tipo_maquina?: string | null;
  fecha_entrega: string;
  cliente_nombre?: string | null;
};

export default function SinCoberturaPage() {
  const q = useQuery({
    queryKey: ["garantias-sin-cobertura"],
    queryFn: () => apiFetch<Gar[]>("/api/garantias/sin-cobertura"),
  });

  const columns = useMemo<ColumnDef<Gar>[]>(
    () => [
      { accessorKey: "id", header: "ID" },
      { accessorKey: "cliente_nombre", header: "Cliente", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "modelo_maquina", header: "Modelo" },
      { accessorKey: "tipo_maquina", header: "Tipo", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "numero_serie", header: "Serie", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "fecha_entrega",
        header: "Entrega",
        cell: ({ getValue }) => formatDateMx(String(getValue())),
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((g) => [
      g.id,
      g.cliente_nombre,
      g.modelo_maquina,
      g.tipo_maquina,
      g.numero_serie,
      g.fecha_entrega,
    ]);
    downloadText(
      `sin-cobertura-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["id", "cliente", "modelo", "tipo", "serie", "fecha_entrega"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Sin cobertura</h2>
        <p className="text-sm text-muted-foreground">Garantías dadas de baja o fuera de vigencia</p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
