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
import Link from "next/link";
import { useMemo } from "react";

type Cotizacion = {
  id: number;
  folio: string;
  fecha: string;
  tipo?: string | null;
  estado?: string | null;
  total?: number | null;
  cliente_id?: number | null;
  cliente_nombre?: string | null;
};

export default function CotizacionesPage() {
  const q = useQuery({ queryKey: ["cotizaciones"], queryFn: () => apiFetch<Cotizacion[]>("/api/cotizaciones") });

  const columns = useMemo<ColumnDef<Cotizacion>[]>(
    () => [
      { accessorKey: "folio", header: "Folio" },
      {
        accessorKey: "fecha",
        header: "Fecha",
        cell: ({ getValue }) => formatDateMx(String(getValue())),
      },
      { accessorKey: "cliente_nombre", header: "Cliente", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "tipo", header: "Tipo", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "estado",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.estado || "—"}
          </Badge>
        ),
      },
      {
        accessorKey: "total",
        header: "Total",
        cell: ({ getValue }) => formatMoneyMxn(Number(getValue()) || 0),
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((c) => [
      c.folio,
      c.fecha,
      c.cliente_nombre,
      c.tipo,
      c.estado,
      c.total,
    ]);
    downloadText(
      `cotizaciones-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["folio", "fecha", "cliente", "tipo", "estado", "total"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <div>
          <h2 className="text-xl font-semibold font-heading">Cotizaciones</h2>
          <p className="text-sm text-muted-foreground">
            Folios, estados y montos. Tipos y estados deben alinearse a{" "}
            <Link href="/catalogos" className="text-primary underline-offset-2 hover:underline">
              Catálogos
            </Link>{" "}
            (tipo de cotización, estado); las notas siguen siendo texto libre.
          </p>
        </div>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
