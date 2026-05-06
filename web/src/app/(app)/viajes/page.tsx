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
import { motion } from "framer-motion";
import { Plane } from "lucide-react";
import { useMemo } from "react";

type Viaje = {
  id: number;
  tecnico?: string | null;
  razon_social?: string | null;
  cliente_nombre?: string | null;
  actividad?: string | null;
  estado?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  dias?: number | null;
  monto_viaticos?: number | null;
  liquidado?: number | null;
};

export default function ViajesPage() {
  const q = useQuery({
    queryKey: ["viajes"],
    queryFn: () => apiFetch<Viaje[]>("/api/viajes"),
  });

  const columns = useMemo<ColumnDef<Viaje>[]>(
    () => [
      { accessorKey: "id", header: "ID" },
      { accessorKey: "tecnico", header: "Técnico", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "cliente_nombre",
        header: "Cliente",
        cell: ({ row }) => row.original.cliente_nombre || row.original.razon_social || "—",
      },
      { accessorKey: "actividad", header: "Actividad", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "fecha_inicio",
        header: "Inicio",
        cell: ({ getValue }) => formatDateMx(String(getValue() || "")),
      },
      {
        accessorKey: "fecha_fin",
        header: "Fin",
        cell: ({ getValue }) => formatDateMx(String(getValue() || "")),
      },
      { accessorKey: "dias", header: "Días", cell: ({ getValue }) => String(getValue() ?? "—") },
      {
        accessorKey: "monto_viaticos",
        header: "Viáticos",
        cell: ({ getValue }) => formatMoneyMxn(Number(getValue()) || 0),
      },
      {
        id: "liq",
        header: "Liquidado",
        cell: ({ row }) => (
          <Badge variant={row.original.liquidado ? "secondary" : "outline"}>
            {row.original.liquidado ? "Sí" : "No"}
          </Badge>
        ),
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((r) => [
      r.id,
      r.tecnico,
      r.cliente_nombre || r.razon_social,
      r.actividad,
      r.fecha_inicio,
      r.fecha_fin,
      r.dias,
      r.monto_viaticos,
    ]);
    downloadText(
      `viajes-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["id", "tecnico", "cliente", "actividad", "inicio", "fin", "dias", "viaticos_mxn"], rows)
    );
  };

  const totalMes = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7);
    return (q.data ?? [])
      .filter((v) => (v.fecha_inicio || "").startsWith(mes))
      .reduce((s, v) => s + (Number(v.monto_viaticos) || 0), 0);
  }, [q.data]);

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
        <div className="rounded-xl border border-border/60 bg-gradient-to-br from-sky-500/10 to-emerald-500/5 p-3">
          <Plane className="size-7 text-sky-400" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight font-heading">Viajes (viáticos)</h2>
          <p className="text-sm text-muted-foreground mt-1">
            $1,000 MXN por día · enlazable a reportes y liquidación mensual
          </p>
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-3">
        <GlassCard className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Registros</p>
          <p className="text-2xl font-semibold font-heading mt-1">{q.data?.length ?? 0}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Viáticos mes actual</p>
          <p className="text-2xl font-semibold font-heading mt-1 text-emerald-300">{formatMoneyMxn(totalMes)}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Tarifa diaria</p>
          <p className="text-2xl font-semibold font-heading mt-1">$1,000 MXN</p>
        </GlassCard>
      </div>

      <GlassCard className="p-4 md:p-6">
        <PageToolbar onExportCsv={exportCsv}>
          <h3 className="text-sm font-semibold font-heading">Historial</h3>
        </PageToolbar>
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
