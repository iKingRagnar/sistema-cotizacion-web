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

type Bit = {
  id: number;
  fecha: string;
  tecnico?: string | null;
  actividades?: string | null;
  tiempo_horas?: number | null;
  incidente_folio?: string | null;
  cotizacion_folio?: string | null;
};

export default function BitacoraPage() {
  const q = useQuery({ queryKey: ["bitacoras"], queryFn: () => apiFetch<Bit[]>("/api/bitacoras") });

  const columns = useMemo<ColumnDef<Bit>[]>(
    () => [
      { accessorKey: "id", header: "ID" },
      {
        accessorKey: "fecha",
        header: "Fecha",
        cell: ({ getValue }) => formatDateMx(String(getValue())),
      },
      { accessorKey: "tecnico", header: "Técnico", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "tiempo_horas",
        header: "Horas",
        cell: ({ getValue }) => Number(getValue() ?? 0).toFixed(1),
      },
      { accessorKey: "incidente_folio", header: "Incidente", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "cotizacion_folio", header: "Cotización", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "actividades",
        header: "Actividades",
        cell: ({ getValue }) => (
          <span className="max-w-[280px] truncate block" title={String(getValue() || "")}>
            {String(getValue() || "—")}
          </span>
        ),
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((b) => [
      b.id,
      b.fecha,
      b.tecnico,
      b.tiempo_horas,
      b.incidente_folio,
      b.cotizacion_folio,
      b.actividades,
    ]);
    downloadText(
      `bitacoras-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["id", "fecha", "tecnico", "horas", "incidente", "cotizacion", "actividades"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Bitácora de horas</h2>
        <p className="text-sm text-muted-foreground">Servicio en campo y taller ligado a incidentes o cotizaciones</p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
