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

type Mg = {
  id: number;
  garantia_id?: number | null;
  fecha_programada?: string | null;
  fecha_realizada?: string | null;
  confirmado?: number | null;
  costo?: number | null;
  pagado?: number | null;
  notas?: string | null;
  modelo_maquina?: string | null;
  razon_social?: string | null;
  cliente_nombre?: string | null;
};

export default function MantenimientosPage() {
  const q = useQuery({
    queryKey: ["mantenimientos-garantia"],
    queryFn: () => apiFetch<Mg[]>("/api/mantenimientos-garantia"),
  });

  const columns = useMemo<ColumnDef<Mg>[]>(
    () => [
      { accessorKey: "id", header: "ID" },
      { accessorKey: "cliente_nombre", header: "Cliente", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "modelo_maquina", header: "Equipo", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "fecha_programada",
        header: "Programado",
        cell: ({ getValue }) => formatDateMx(String(getValue())),
      },
      {
        accessorKey: "fecha_realizada",
        header: "Realizado",
        cell: ({ getValue }) => (getValue() ? formatDateMx(String(getValue())) : "—"),
      },
      {
        id: "estado",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant={row.original.confirmado ? "secondary" : "outline"}>
            {row.original.confirmado ? "Completado" : "Pendiente"}
          </Badge>
        ),
      },
      {
        accessorKey: "costo",
        header: "Costo",
        cell: ({ getValue }) => formatMoneyMxn(Number(getValue()) || 0),
      },
      {
        accessorKey: "notas",
        header: "Notas",
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
    const rows = (q.data ?? []).map((r) => [
      r.id,
      r.cliente_nombre,
      r.modelo_maquina,
      r.fecha_programada,
      r.fecha_realizada,
      r.confirmado,
      r.costo,
    ]);
    downloadText(
      `mantenimientos-garantia-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["id", "cliente", "modelo", "programado", "realizado", "confirmado", "costo"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Mantenimientos de garantía</h2>
        <p className="text-sm text-muted-foreground">Preventivos programados y costos</p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
