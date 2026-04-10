"use client";

import { GarantiaCalendar } from "@/components/mantenimientos/garantia-calendar";
import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { downloadText, formatDateMx, formatMoneyMxn, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { motion } from "framer-motion";
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
  alerta_vencida?: number | null;
};

type Taller = {
  id: number;
  tipo?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  descripcion_falla?: string | null;
  tecnico?: string | null;
  horas_invertidas?: number | null;
  costo_total?: number | null;
  maquina_nombre?: string | null;
  maquina_modelo?: string | null;
  cliente_nombre?: string | null;
};

export default function MantenimientosPage() {
  const qGar = useQuery({
    queryKey: ["mantenimientos-garantia"],
    queryFn: () => apiFetch<Mg[]>("/api/mantenimientos-garantia"),
  });
  const qTal = useQuery({
    queryKey: ["mantenimientos-taller"],
    queryFn: () => apiFetch<Taller[]>("/api/mantenimientos-taller"),
  });

  const columnsGar = useMemo<ColumnDef<Mg>[]>(
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

  const columnsTal = useMemo<ColumnDef<Taller>[]>(
    () => [
      { accessorKey: "id", header: "ID" },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ row }) => (
          <Badge variant={row.original.tipo === "correctivo" ? "destructive" : "default"} className="capitalize">
            {row.original.tipo || "—"}
          </Badge>
        ),
      },
      { accessorKey: "cliente_nombre", header: "Cliente", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "maquina_modelo", header: "Modelo", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "fecha_inicio",
        header: "Inicio",
        cell: ({ getValue }) => formatDateMx(String(getValue() || "")),
      },
      { accessorKey: "tecnico", header: "Técnico", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "costo_total",
        header: "Costo",
        cell: ({ getValue }) => formatMoneyMxn(Number(getValue()) || 0),
      },
      {
        accessorKey: "descripcion_falla",
        header: "Detalle",
        cell: ({ getValue }) => (
          <span className="max-w-[220px] truncate block" title={String(getValue() || "")}>
            {String(getValue() || "—")}
          </span>
        ),
      },
    ],
    []
  );

  const exportGar = () => {
    const rows = (qGar.data ?? []).map((r) => [
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

  const exportTal = () => {
    const rows = (qTal.data ?? []).map((r) => [
      r.id,
      r.tipo,
      r.cliente_nombre,
      r.maquina_modelo,
      r.fecha_inicio,
      r.tecnico,
      r.costo_total,
    ]);
    downloadText(
      `mantenimientos-taller-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["id", "tipo", "cliente", "modelo", "inicio", "tecnico", "costo"], rows)
    );
  };

  const vencidos = (qGar.data ?? []).filter(
    (r) => !r.confirmado && r.fecha_programada && new Date(String(r.fecha_programada) + "T12:00:00") < new Date()
  ).length;
  const prox30 = (qGar.data ?? []).filter((r) => {
    if (r.confirmado || !r.fecha_programada) return false;
    const t = new Date(String(r.fecha_programada) + "T12:00:00").getTime();
    const now = Date.now();
    return t >= now && t <= now + 30 * 86400000;
  }).length;

  if (qGar.isError) {
    return <ErrorState message={(qGar.error as Error).message} onRetry={() => qGar.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-semibold tracking-tight font-heading">Mantenimientos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Taller (preventivo/correctivo) y calendario de garantía con prioridades
        </p>
      </motion.div>

      <Tabs defaultValue="garantia" className="space-y-4">
        <TabsList className="grid w-full max-w-lg grid-cols-2 h-11 bg-muted/40">
          <TabsTrigger value="garantia" className="font-medium">
            Por garantía
          </TabsTrigger>
          <TabsTrigger value="taller" className="font-medium">
            Taller
          </TabsTrigger>
        </TabsList>

        <TabsContent value="garantia" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-rose-500/40 text-rose-200">
              Vencidos sin confirmar: {vencidos}
            </Badge>
            <Badge variant="outline" className="border-amber-500/40 text-amber-200">
              Próximos 30 días: {prox30}
            </Badge>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <GlassCard className="p-4 md:p-5 lg:col-span-1">
              <GarantiaCalendar items={qGar.data ?? []} />
            </GlassCard>
            <GlassCard className="p-4 md:p-6 lg:col-span-2">
              <PageToolbar onExportCsv={exportGar}>
                <h3 className="text-sm font-semibold font-heading">Listado detallado</h3>
              </PageToolbar>
              <DataTable columns={columnsGar} data={qGar.data ?? []} />
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="taller" className="space-y-4">
          <GlassCard className="p-4 md:p-6">
            <PageToolbar onExportCsv={exportTal}>
              <div>
                <h3 className="text-sm font-semibold font-heading">Registros de taller</h3>
                <p className="text-xs text-muted-foreground">Preventivos y correctivos en planta cliente</p>
              </div>
            </PageToolbar>
            {qTal.isError ? (
              <ErrorState message={(qTal.error as Error).message} onRetry={() => qTal.refetch()} />
            ) : (
              <DataTable columns={columnsTal} data={qTal.data ?? []} />
            )}
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
