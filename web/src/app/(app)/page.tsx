"use client";

import type { ReactNode } from "react";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { formatMoneyMxn } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Activity, ClipboardList, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Periodo = {
  etiqueta: string;
  cotizaciones: { count: number; monto: number };
  incidentes: { count: number };
  bitacoras: { count: number; horas: number };
};

type DashboardStats = {
  periodos: Record<string, Periodo>;
};

type AlertasRes = {
  items: { id: string; tipo: string; severidad: string; titulo: string; detalle: string }[];
};

export default function DashboardPage() {
  const statsQ = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch<DashboardStats>("/api/dashboard-stats"),
  });
  const alertasQ = useQuery({
    queryKey: ["alertas"],
    queryFn: () => apiFetch<AlertasRes>("/api/alertas"),
  });

  if (statsQ.isError) {
    return (
      <ErrorState
        message={statsQ.error instanceof Error ? statsQ.error.message : "Error al cargar tablero"}
        onRetry={() => statsQ.refetch()}
      />
    );
  }

  const p = statsQ.data?.periodos;
  const mes = p?.mes_actual;
  const mesAnt = p?.mes_anterior;
  const año = p?.año_actual;

  const chartData = p
    ? [
        { name: p.semana_actual?.etiqueta ?? "Sem. act.", monto: p.semana_actual?.cotizaciones.monto ?? 0 },
        { name: p.mes_actual?.etiqueta ?? "Mes act.", monto: p.mes_actual?.cotizaciones.monto ?? 0 },
        { name: p.mes_anterior?.etiqueta ?? "Mes ant.", monto: p.mes_anterior?.cotizaciones.monto ?? 0 },
        { name: p.año_actual?.etiqueta ?? "Año", monto: p.año_actual?.cotizaciones.monto ?? 0 },
      ]
    : [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight font-heading">Tablero ejecutivo</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Indicadores consolidados · cotizaciones, incidentes y bitácora
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Cotizaciones (mes)"
          loading={statsQ.isLoading}
          value={mes ? formatMoneyMxn(mes.cotizaciones.monto) : "—"}
          sub={mes ? `${mes.cotizaciones.count} folios` : undefined}
          icon={<TrendingUp className="size-4 text-emerald-400" />}
          delay={0}
        />
        <StatCard
          title="vs mes anterior"
          loading={statsQ.isLoading}
          value={
            mes && mesAnt
              ? `${mes.cotizaciones.monto >= mesAnt.cotizaciones.monto ? "+" : ""}${(
                  ((mes.cotizaciones.monto - mesAnt.cotizaciones.monto) /
                    Math.max(1, mesAnt.cotizaciones.monto)) *
                  100
                ).toFixed(1)}% monto`
              : "—"
          }
          sub={mesAnt ? formatMoneyMxn(mesAnt.cotizaciones.monto) + " anterior" : undefined}
          icon={<Activity className="size-4 text-cyan-400" />}
          delay={0.05}
        />
        <StatCard
          title="Incidentes abiertos (mes)"
          loading={statsQ.isLoading}
          value={mes ? String(mes.incidentes.count) : "—"}
          sub="Según periodo seleccionado en API"
          icon={<ClipboardList className="size-4 text-amber-400" />}
          delay={0.1}
        />
        <StatCard
          title="Horas bitácora (año)"
          loading={statsQ.isLoading}
          value={año ? `${año.bitacoras.horas.toFixed(1)} h` : "—"}
          sub={año ? `${año.bitacoras.count} registros` : undefined}
          icon={<Activity className="size-4 text-violet-400" />}
          delay={0.15}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2 p-4 md:p-6">
          <h3 className="text-sm font-medium mb-4 font-heading">Monto cotizaciones por periodo</h3>
          {statsQ.isLoading ? (
            <Skeleton className="h-72 w-full rounded-lg" />
          ) : (
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height={288}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) =>
                      new Intl.NumberFormat("es-MX", { notation: "compact" }).format(Number(v))
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    formatter={(value) => [formatMoneyMxn(Number(value) || 0), "Monto"]}
                  />
                  <Bar dataKey="monto" fill="#34d399" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-4 md:p-6 flex flex-col">
          <h3 className="text-sm font-medium mb-3 font-heading">Alertas</h3>
          {alertasQ.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : alertasQ.isError ? (
            <p className="text-xs text-muted-foreground">No se pudieron cargar alertas.</p>
          ) : (
            <ul className="space-y-3 flex-1 overflow-y-auto max-h-80 pr-1">
              {(alertasQ.data?.items ?? []).slice(0, 12).map((a) => (
                <motion.li
                  key={a.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium leading-snug">{a.titulo}</span>
                    <Badge variant={a.severidad === "danger" ? "destructive" : "secondary"} className="shrink-0 text-[10px]">
                      {a.tipo}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 leading-relaxed">{a.detalle}</p>
                </motion.li>
              ))}
              {(alertasQ.data?.items?.length ?? 0) === 0 && (
                <li className="text-sm text-muted-foreground text-center py-8">Sin alertas activas.</li>
              )}
            </ul>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
  icon,
  loading,
  delay,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  loading?: boolean;
  delay: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {title}
          </CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <div className="text-2xl font-semibold tracking-tight font-heading">{value}</div>
          )}
          {sub && !loading && <CardDescription className="mt-1">{sub}</CardDescription>}
        </CardContent>
      </Card>
    </motion.div>
  );
}
