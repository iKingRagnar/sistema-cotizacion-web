"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { downloadText, formatDateMx, formatMoneyMxn, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

type Bono = {
  id: number;
  tecnico: string;
  tipo_capacitacion?: string | null;
  monto_bono?: number | null;
  monto_total?: number | null;
  fecha?: string | null;
  pagado?: number | null;
  reporte_folio?: string | null;
};

export default function BonosPage() {
  const q = useQuery({ queryKey: ["bonos"], queryFn: () => apiFetch<Bono[]>("/api/bonos") });

  const columns = useMemo<ColumnDef<Bono>[]>(
    () => [
      { accessorKey: "id", header: "ID" },
      { accessorKey: "tecnico", header: "Empleado" },
      { accessorKey: "tipo_capacitacion", header: "Concepto", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "fecha",
        header: "Fecha",
        cell: ({ getValue }) => formatDateMx(String(getValue())),
      },
      {
        accessorKey: "monto_total",
        header: "Monto",
        cell: ({ row }) =>
          formatMoneyMxn(Number(row.original.monto_total ?? row.original.monto_bono) || 0),
      },
      {
        id: "pago",
        header: "Pagado",
        cell: ({ row }) => (
          <Badge variant={row.original.pagado ? "secondary" : "outline"}>
            {row.original.pagado ? "Sí" : "Pendiente"}
          </Badge>
        ),
      },
      { accessorKey: "reporte_folio", header: "Reporte", cell: ({ getValue }) => getValue() || "—" },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((b) => [
      b.id,
      b.tecnico,
      b.tipo_capacitacion,
      b.fecha,
      b.monto_total ?? b.monto_bono,
      b.pagado,
      b.reporte_folio,
    ]);
    downloadText(
      `bonos-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["id", "tecnico", "concepto", "fecha", "monto", "pagado", "reporte"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Bonos</h2>
        <p className="text-sm text-muted-foreground">Capacitaciones y bonos por empleado</p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
