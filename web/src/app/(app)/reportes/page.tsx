"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { downloadText, formatDateMx, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type Reporte = {
  id: number;
  folio?: string | null;
  tipo_reporte?: string | null;
  subtipo?: string | null;
  estatus?: string | null;
  fecha?: string | null;
  tecnico?: string | null;
  cliente_nombre?: string | null;
  maquina_nombre?: string | null;
  descripcion?: string | null;
};

const COLORS = ["#34d399", "#22d3ee", "#a78bfa", "#fbbf24", "#fb7185", "#94a3b8"];

export default function ReportesPage() {
  const q = useQuery({ queryKey: ["reportes"], queryFn: () => apiFetch<Reporte[]>("/api/reportes") });

  const pieData = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of q.data ?? []) {
      const s = r.estatus || "—";
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [q.data]);

  const tipoData = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of q.data ?? []) {
      const s = r.tipo_reporte || "—";
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [q.data]);

  const columns = useMemo<ColumnDef<Reporte>[]>(
    () => [
      { accessorKey: "folio", header: "Folio" },
      {
        accessorKey: "fecha",
        header: "Fecha",
        cell: ({ getValue }) => formatDateMx(String(getValue())),
      },
      { accessorKey: "cliente_nombre", header: "Cliente", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "tipo_reporte", header: "Tipo", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "subtipo", header: "Subtipo", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "estatus",
        header: "Estatus",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.estatus || "—"}
          </Badge>
        ),
      },
      { accessorKey: "tecnico", header: "Técnico", cell: ({ getValue }) => getValue() || "—" },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((r) => [
      r.folio,
      r.fecha,
      r.cliente_nombre,
      r.tipo_reporte,
      r.subtipo,
      r.estatus,
      r.tecnico,
      r.descripcion,
    ]);
    downloadText(
      `reportes-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["folio", "fecha", "cliente", "tipo", "subtipo", "estatus", "tecnico", "descripcion"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Reportes de servicio y venta</h2>
        <p className="text-sm text-muted-foreground">Distribución por estatus y detalle filtrable</p>
      </PageToolbar>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Por estatus</CardTitle>
          </CardHeader>
          <CardContent className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height={256}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Por tipo de reporte</CardTitle>
          </CardHeader>
          <CardContent className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height={256}>
              <PieChart>
                <Pie
                  data={tipoData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {tipoData.map((_, i) => (
                    <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
