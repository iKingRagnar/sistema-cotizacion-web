"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { downloadText, formatDateMx, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, FileSignature } from "lucide-react";
import { useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type Reporte = {
  id: number;
  folio?: string | null;
  tipo_reporte?: string | null;
  subtipo?: string | null;
  estatus?: string | null;
  fecha?: string | null;
  fecha_programada?: string | null;
  tecnico?: string | null;
  cliente_nombre?: string | null;
  maquina_nombre?: string | null;
  descripcion?: string | null;
  finalizado?: number | null;
  archivo_firmado_nombre?: string | null;
};

const COLORS = ["#34d399", "#22d3ee", "#a78bfa", "#fbbf24", "#fb7185", "#94a3b8"];

export default function ReportesPage() {
  const q = useQuery({ queryKey: ["reportes"], queryFn: () => apiFetch<Reporte[]>("/api/reportes") });
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewQ = useQuery({
    queryKey: ["reporte", previewId],
    queryFn: () => apiFetch<Reporte>(`/api/reportes/${previewId}`),
    enabled: previewOpen && previewId != null,
  });

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
      {
        accessorKey: "folio",
        header: "Folio",
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left font-mono text-xs text-primary hover:underline underline-offset-2"
            onClick={() => {
              setPreviewId(row.original.id);
              setPreviewOpen(true);
            }}
          >
            {row.original.folio || "—"}
          </button>
        ),
      },
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
      {
        accessorKey: "maquina_nombre",
        header: "Máquina",
        cell: ({ getValue }) => {
          const v = getValue();
          const s = v == null || v === "" ? "—" : String(v);
          return (
            <span className="max-w-[160px] truncate block" title={s}>
              {s}
            </span>
          );
        },
      },
      {
        id: "finalizado",
        header: "Firma",
        cell: ({ row }) =>
          row.original.finalizado ? (
            <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
              <CheckCircle2 className="size-3.5" />
              OK
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
              <FileSignature className="size-3.5" />
              Pendiente
            </span>
          ),
      },
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
        <div>
          <h2 className="text-xl font-semibold font-heading">Reportes de servicio y venta</h2>
          <p className="text-sm text-muted-foreground">
            Orden automático: garantías → instalaciones → servicios → ventas. Vista previa al pulsar folio.
          </p>
        </div>
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

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg border-border/60 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-heading font-mono text-sm">
              {previewQ.data?.folio ?? "Vista previa"}
            </DialogTitle>
          </DialogHeader>
          {previewQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : previewQ.data ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{previewQ.data.tipo_reporte || "—"}</Badge>
                <Badge variant="secondary">{previewQ.data.subtipo || "—"}</Badge>
                <Badge
                  variant={previewQ.data.estatus === "cerrado" ? "default" : "outline"}
                  className="capitalize"
                >
                  {previewQ.data.estatus || "—"}
                </Badge>
              </div>
              <p>
                <span className="text-muted-foreground">Cliente: </span>
                {previewQ.data.cliente_nombre || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Máquina: </span>
                {previewQ.data.maquina_nombre || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Técnico: </span>
                {previewQ.data.tecnico || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Fecha: </span>
                {formatDateMx(String(previewQ.data.fecha || ""))}
              </p>
              {previewQ.data.fecha_programada ? (
                <p>
                  <span className="text-muted-foreground">Programada: </span>
                  {formatDateMx(String(previewQ.data.fecha_programada))}
                </p>
              ) : null}
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-muted-foreground leading-relaxed">
                {previewQ.data.descripcion || "Sin descripción."}
              </div>
              <p className="text-xs text-muted-foreground">
                Firma digital: {previewQ.data.finalizado ? "Registrada" : "Pendiente"}
                {previewQ.data.archivo_firmado_nombre
                  ? ` · ${previewQ.data.archivo_firmado_nombre}`
                  : ""}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
