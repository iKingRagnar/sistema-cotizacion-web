"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { downloadText, formatMoneyMxn, formatMoneyUsd, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

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

type RefaccionDetail = Refaccion & {
  imagen_url?: string | null;
  manual_url?: string | null;
  numero_parte_manual?: string | null;
  unidad?: string | null;
  subcategoria?: string | null;
};

export default function RefaccionesPage() {
  const q = useQuery({ queryKey: ["refacciones"], queryFn: () => apiFetch<Refaccion[]>("/api/refacciones") });
  const [detailOpen, setDetailOpen] = useState(false);
  const [selId, setSelId] = useState<number | null>(null);
  const detailQ = useQuery({
    queryKey: ["refaccion", selId],
    queryFn: () => apiFetch<RefaccionDetail>(`/api/refacciones/${selId}`),
    enabled: detailOpen && selId != null,
  });

  const columns = useMemo<ColumnDef<Refaccion>[]>(
    () => [
      {
        accessorKey: "codigo",
        header: "Código",
        cell: ({ row }) => (
          <button
            type="button"
            className="font-mono text-xs text-primary hover:underline underline-offset-2"
            onClick={() => {
              setSelId(row.original.id);
              setDetailOpen(true);
            }}
          >
            {row.original.codigo}
          </button>
        ),
      },
      { accessorKey: "descripcion", header: "Descripción" },
      { accessorKey: "categoria", header: "Categoría", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "zona", header: "Zona (rack)", cell: ({ getValue }) => getValue() || "—" },
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-border/60 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {detailQ.data?.codigo ?? "Refacción"}
            </DialogTitle>
          </DialogHeader>
          {detailQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : detailQ.data ? (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground leading-relaxed">{detailQ.data.descripcion}</p>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Nº parte (manual)</span>
                  <p className="font-mono mt-0.5">{detailQ.data.numero_parte_manual || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Categoría / sub</span>
                  <p>
                    {detailQ.data.categoria || "—"} · {detailQ.data.subcategoria || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Zona almacén</span>
                  <p>{detailQ.data.zona || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Stock / mínimo</span>
                  <p>
                    {detailQ.data.stock ?? 0} / {detailQ.data.stock_minimo ?? "—"}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Diagrama / vista (placeholder demo)</p>
                  {detailQ.data.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URLs externas demo (picsum)
                    <img
                      src={detailQ.data.imagen_url}
                      alt="Diagrama"
                      className="w-full rounded-lg border border-border/50 object-cover max-h-48"
                    />
                  ) : (
                    <div className="h-32 rounded-lg bg-muted/40 border border-dashed border-border/60" />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Manual / ensamble (placeholder demo)</p>
                  {detailQ.data.manual_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URLs externas demo (picsum)
                    <img
                      src={detailQ.data.manual_url}
                      alt="Manual"
                      className="w-full rounded-lg border border-border/50 object-cover max-h-48"
                    />
                  ) : (
                    <div className="h-32 rounded-lg bg-muted/40 border border-dashed border-border/60" />
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                <span>
                  <span className="text-muted-foreground">USD </span>
                  {formatMoneyUsd(Number(detailQ.data.precio_usd) || 0)}
                </span>
                <span>
                  <span className="text-muted-foreground">MXN </span>
                  {formatMoneyMxn(Number(detailQ.data.precio_unitario) || 0)}
                </span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
