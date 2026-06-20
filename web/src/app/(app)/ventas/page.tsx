"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { downloadText, formatDateMx, formatMoneyMxn, formatMoneyUsd, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

type Venta = {
  id: number;
  folio: string;
  fecha_aprobacion?: string | null;
  fecha?: string | null;
  cliente_nombre?: string | null;
  estado?: string | null;
  total?: number | null;
  moneda?: string | null;
  tipo_cambio?: number | null;
};

type Tc = { valor: number };

export default function VentasPage() {
  const ventas = useQuery({ queryKey: ["ventas"], queryFn: () => apiFetch<Venta[]>("/api/ventas") });
  const tc = useQuery({ queryKey: ["tipo-cambio"], queryFn: () => apiFetch<Tc>("/api/tipo-cambio") });

  const tipo = tc.data?.valor ?? 17;

  const columns = useMemo<ColumnDef<Venta>[]>(
    () => [
      { accessorKey: "folio", header: "Folio" },
      {
        id: "fecha",
        header: "Fecha",
        cell: ({ row }) =>
          formatDateMx(row.original.fecha_aprobacion || row.original.fecha || ""),
      },
      { accessorKey: "cliente_nombre", header: "Cliente", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "estado",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant="secondary" className="capitalize">
            {row.original.estado || "—"}
          </Badge>
        ),
      },
      {
        id: "mxn",
        header: "Total MXN",
        cell: ({ row }) => formatMoneyMxn(Number(row.original.total) || 0),
      },
      {
        id: "usd",
        header: `Equiv. USD (@${tipo.toFixed(2)})`,
        cell: ({ row }) => {
          const mxn = Number(row.original.total) || 0;
          const usd = mxn / tipo;
          return formatMoneyUsd(usd);
        },
      },
    ],
    [tipo]
  );

  const exportCsv = () => {
    const rows = (ventas.data ?? []).map((v) => {
      const mxn = Number(v.total) || 0;
      return [v.folio, v.fecha_aprobacion || v.fecha, v.cliente_nombre, v.estado, mxn, mxn / tipo];
    });
    downloadText(
      `ventas-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["folio", "fecha", "cliente", "estado", "total_mxn", "equiv_usd"], rows)
    );
  };

  if (ventas.isError) {
    return <ErrorState message={(ventas.error as Error).message} onRetry={() => ventas.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Ventas</h2>
        <p className="text-sm text-muted-foreground">
          Cotizaciones aplicadas · TC referencia:{" "}
          <span className="text-foreground font-medium">{tipo.toFixed(4)} MXN/USD</span> · Conversión:{" "}
          {formatMoneyMxn(tipo)} por 1 USD
        </p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={ventas.data ?? []} />
      </GlassCard>
    </div>
  );
}
