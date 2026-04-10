"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { downloadText, formatMoneyMxn, formatMoneyUsd, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

type Refaccion = {
  id: number;
  codigo: string;
  descripcion: string;
  stock?: number | null;
  stock_minimo?: number | null;
  precio_unitario?: number | null;
  precio_usd?: number | null;
  categoria?: string | null;
  zona?: string | null;
};

export default function RefaccionesPage() {
  const q = useQuery({ queryKey: ["refacciones"], queryFn: () => apiFetch<Refaccion[]>("/api/refacciones") });

  const columns = useMemo<ColumnDef<Refaccion>[]>(
    () => [
      { accessorKey: "codigo", header: "Código" },
      { accessorKey: "descripcion", header: "Descripción" },
      { accessorKey: "categoria", header: "Categoría", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "stock",
        header: "Stock",
        cell: ({ row }) => {
          const low =
            (row.original.stock_minimo ?? 0) > 0 &&
            (row.original.stock ?? 0) <= (row.original.stock_minimo ?? 0);
          return (
            <span className={low ? "text-amber-400 font-medium" : ""}>
              {row.original.stock ?? 0}
              {low && " ⚠"}
            </span>
          );
        },
      },
      {
        accessorKey: "precio_unitario",
        header: "Precio MXN",
        cell: ({ getValue }) => formatMoneyMxn(Number(getValue()) || 0),
      },
      {
        id: "usd",
        header: "USD",
        cell: ({ row }) =>
          row.original.precio_usd != null ? formatMoneyUsd(Number(row.original.precio_usd)) : "—",
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((r) => [
      r.codigo,
      r.descripcion,
      r.categoria,
      r.stock,
      r.stock_minimo,
      r.precio_unitario,
      r.precio_usd,
    ]);
    downloadText(
      `refacciones-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(
        ["codigo", "descripcion", "categoria", "stock", "stock_minimo", "precio_unitario", "precio_usd"],
        rows
      )
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  const alertas = (q.data ?? []).filter(
    (r) => (r.stock_minimo ?? 0) > 0 && (r.stock ?? 0) <= (r.stock_minimo ?? 0)
  ).length;

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold font-heading">Refacciones</h2>
          {alertas > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              Stock bajo: {alertas}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Inventario activo y alertas de mínimo</p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
