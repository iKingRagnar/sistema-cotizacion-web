"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { MagneticButton } from "@/components/premium/magnetic-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { downloadText, formatDateMx, rowsToCsv } from "@/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Bot,
  Download,
  Filter,
  LayoutGrid,
  MapPinned,
  Radar,
  Search,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";

const ProspectMap = dynamic(() => import("@/components/prospectos/prospect-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-[min(52vh,440px)] w-full rounded-xl" />,
});

type Prospecto = {
  id: number;
  empresa: string;
  zona?: string | null;
  lat?: number | null;
  lng?: number | null;
  tipo_interes?: string | null;
  industria?: string | null;
  potencial_usd?: number | null;
  ultimo_contacto?: string | null;
  score_ia?: number | null;
  estado?: string | null;
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
};

export default function ProspectosPage() {
  const q = useQuery({ queryKey: ["prospectos"], queryFn: () => apiFetch<Prospecto[]>("/api/prospectos") });
  const [chatIn, setChatIn] = useState("");
  const [chatLog, setChatLog] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("todos");

  const chatMut = useMutation({
    mutationFn: async (payload: { message: string; history: { role: "user" | "assistant"; text: string }[] }) => {
      const top = (q.data ?? [])
        .slice(0, 12)
        .map((p) => `${p.empresa} (${p.zona}) USD ${p.potencial_usd} score ${p.score_ia}`)
        .join("; ");
      const enriched = `Contexto prospectos (no inventes fuera de esto): ${top || "sin datos"}. Pregunta del usuario: ${payload.message}`;
      return apiFetch<{ reply?: string; error?: string }>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: enriched,
          messages: payload.history.slice(-10).map((m) => ({ role: m.role, content: m.text })),
        }),
      });
    },
    onSuccess: (data) => {
      if (data?.reply) setChatLog((l) => [...l, { role: "assistant", text: data.reply! }]);
    },
    onError: (e: Error) => {
      setChatLog((l) => [
        ...l,
        {
          role: "assistant",
          text:
            e.message ||
            "Configura OPENAI_API_KEY en el servidor para el asistente. Mientras tanto usa el mapa y la tabla.",
        },
      ]);
    },
  });

  const estadosOpts = useMemo(() => {
    const s = new Set<string>();
    for (const r of q.data ?? []) {
      if (r.estado) s.add(String(r.estado));
    }
    return Array.from(s).sort();
  }, [q.data]);

  const filtrados = useMemo(() => {
    let rows = q.data ?? [];
    const t = search.trim().toLowerCase();
    if (t) {
      rows = rows.filter(
        (r) =>
          r.empresa.toLowerCase().includes(t) ||
          (r.zona || "").toLowerCase().includes(t) ||
          (r.tipo_interes || "").toLowerCase().includes(t) ||
          (r.industria || "").toLowerCase().includes(t)
      );
    }
    if (estadoFiltro !== "todos") {
      rows = rows.filter((r) => (r.estado || "") === estadoFiltro);
    }
    return rows;
  }, [q.data, search, estadoFiltro]);

  const kpis = useMemo(() => {
    const rows = filtrados;
    const n = rows.length;
    const vol = rows.reduce((s, r) => s + (Number(r.potencial_usd) || 0), 0);
    const score = n ? rows.reduce((s, r) => s + (Number(r.score_ia) || 0), 0) / n : 0;
    const porZona = new Map<string, number>();
    for (const r of rows) {
      const z = r.zona || "—";
      porZona.set(z, (porZona.get(z) ?? 0) + 1);
    }
    const segment = Array.from(porZona.entries())
      .map(([name, value]) => ({ name: name.slice(0, 14), value }))
      .slice(0, 8);
    const scores = rows.map((r) => Number(r.score_ia) || 0).filter((x) => x > 0);
    const pots = rows.map((r) => Number(r.potencial_usd) || 0).filter((x) => x > 0);
    const medS = scores.length ? [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)] : 50;
    const medP = pots.length ? [...pots].sort((a, b) => a - b)[Math.floor(pots.length / 2)] : 50000;
    let q1 = 0,
      q2 = 0,
      q3 = 0,
      q4 = 0;
    for (const r of rows) {
      const m = (r.ultimo_contacto || "").slice(5, 7);
      const mo = parseInt(m, 10);
      if (!mo || Number.isNaN(mo)) {
        q4++;
        continue;
      }
      if (mo <= 3) q1++;
      else if (mo <= 6) q2++;
      else if (mo <= 9) q3++;
      else q4++;
    }
    const mat = { aa: 0, ab: 0, ba: 0, bb: 0 };
    for (const r of rows) {
      const s = Number(r.score_ia) || 0;
      const p = Number(r.potencial_usd) || 0;
      const hiS = s >= medS;
      const hiP = p >= medP;
      if (hiS && hiP) mat.aa++;
      else if (hiS && !hiP) mat.ab++;
      else if (!hiS && hiP) mat.ba++;
      else mat.bb++;
    }
    return { n, vol, score, segment, medS, medP, mat, pipeline: [{ name: "Q1", v: q1 }, { name: "Q2", v: q2 }, { name: "Q3", v: q3 }, { name: "Q4", v: q4 }] };
  }, [filtrados]);

  const columns = useMemo<ColumnDef<Prospecto>[]>(
    () => [
      { accessorKey: "empresa", header: "Empresa" },
      { accessorKey: "zona", header: "Zona", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "tipo_interes", header: "Interés", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "potencial_usd",
        header: "Potencial USD",
        cell: ({ getValue }) =>
          `USD ${Number(getValue() || 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`,
      },
      {
        accessorKey: "ultimo_contacto",
        header: "Último contacto",
        cell: ({ getValue }) => (getValue() ? formatDateMx(String(getValue())) : "—"),
      },
      {
        accessorKey: "score_ia",
        header: "Score IA",
        cell: ({ row }) => (
          <span className="tabular-nums font-semibold text-teal-400">{Math.round(row.original.score_ia || 0)}</span>
        ),
      },
      {
        accessorKey: "estado",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize border-teal-500/30 bg-teal-500/5">
            {row.original.estado || "—"}
          </Badge>
        ),
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = filtrados.map((r) => [
      r.empresa,
      r.zona,
      r.tipo_interes,
      r.potencial_usd,
      r.ultimo_contacto,
      r.score_ia,
      r.estado,
    ]);
    downloadText(
      `prospectos-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["empresa", "zona", "interes", "usd", "contacto", "score", "estado"], rows)
    );
  };

  const mapPoints = useMemo(
    () =>
      filtrados.map((p) => ({
        id: p.id,
        lat: p.lat ?? 0,
        lng: p.lng ?? 0,
        empresa: p.empresa,
        zona: p.zona,
        potencial_usd: p.potencial_usd,
        score_ia: p.score_ia,
        estado: p.estado,
      })),
    [filtrados]
  );

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-teal-500/15 bg-gradient-to-br from-teal-500/[0.07] via-card/40 to-indigo-600/[0.08] p-6 md:p-8 backdrop-blur-md"
      >
        <div className="absolute -right-20 -top-20 size-64 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-4">
          <div className="rounded-xl border border-white/10 bg-card/50 p-3 shadow-lg ring-1 ring-teal-500/20">
            <MapPinned className="size-8 text-teal-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight font-heading text-balance">
              Prospectos · mapa comercial
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
              Estilo COVIA: KPIs en vivo, segmentos, matriz de oportunidad, pipeline por trimestre y asistente
              comercial. Filtros para reducir ruido en listas grandes.
            </p>
          </div>
        </div>
      </motion.div>

      <GlassCard className="p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa, zona, industria, tipo de interés…"
              className="h-11 pl-10 bg-muted/25 border-border/60"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="size-4 text-muted-foreground shrink-0" />
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className="h-11 rounded-lg border border-border/60 bg-muted/25 px-3 text-sm min-w-[140px]"
            >
              <option value="todos">Todos los estados</option>
              {estadosOpts.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <Badge variant="secondary" className="tabular-nums">
              {filtrados.length} / {q.data?.length ?? 0}
            </Badge>
          </div>
        </div>
      </GlassCard>

      <motion.ul
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.li variants={item}>
          <GlassCard className="p-5 h-full border-teal-500/10">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Leads potenciales</p>
            <p className="text-3xl font-bold font-heading mt-2 tabular-nums">{kpis.n}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="size-3 text-teal-400" />
              Filtrados en vista
            </p>
          </GlassCard>
        </motion.li>
        <motion.li variants={item}>
          <GlassCard className="p-5 h-full border-emerald-500/10">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Volumen estimado USD</p>
            <p className="text-3xl font-bold font-heading mt-2 tabular-nums text-teal-300">
              {kpis.vol.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
            </p>
          </GlassCard>
        </motion.li>
        <motion.li variants={item}>
          <GlassCard className="p-5 h-full border-indigo-500/10">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Score IA promedio</p>
            <p className="text-3xl font-bold font-heading mt-2 tabular-nums">{kpis.score.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Radio competitivo vs. mediana</p>
          </GlassCard>
        </motion.li>
        <motion.li variants={item}>
          <GlassCard className="p-5 h-full flex flex-col justify-center border-amber-500/10">
            <Sparkles className="size-6 text-amber-400 mb-2" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              IA predictiva: prioriza alto score + alto potencial; refina con filtros y matriz.
            </p>
          </GlassCard>
        </motion.li>
      </motion.ul>

      <div className="grid gap-6 xl:grid-cols-3">
        <GlassCard className="p-4 md:p-5 xl:col-span-2 overflow-hidden">
          <h3 className="text-sm font-semibold font-heading mb-3 flex items-center gap-2">
            <MapPinned className="size-4 text-teal-400" />
            Mapa interactivo (Leaflet)
          </h3>
          <ProspectMap points={mapPoints} />
        </GlassCard>
        <GlassCard className="p-4 md:p-5 flex flex-col min-h-[min(52vh,440px)] border-indigo-500/10">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="size-4 text-indigo-400" />
            <h3 className="text-sm font-semibold font-heading">Asistente comercial</h3>
          </div>
          <ScrollArea className="flex-1 min-h-[200px] rounded-xl border border-border/50 bg-muted/15 p-3 mb-3">
            {chatLog.length === 0 ? (
              <p className="text-xs text-muted-foreground p-1 leading-relaxed">
                Ej.: «¿Quién es el mejor prospecto para tornos CNC en Nuevo León?» · «Predicción de cierre Q2»
              </p>
            ) : (
              <ul className="space-y-2 text-xs">
                {chatLog.map((m, i) => (
                  <li
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-4 rounded-lg bg-teal-500/15 border border-teal-500/20 px-3 py-2"
                        : "mr-4 rounded-lg bg-muted/50 border border-border/50 px-3 py-2"
                    }
                  >
                    {m.text}
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
          <form
            className="flex gap-2 mt-auto"
            onSubmit={(e) => {
              e.preventDefault();
              const t = chatIn.trim();
              if (!t) return;
              const next = [...chatLog, { role: "user" as const, text: t }];
              setChatLog(next);
              setChatIn("");
              chatMut.mutate({ message: t, history: next });
            }}
          >
            <Input
              value={chatIn}
              onChange={(e) => setChatIn(e.target.value)}
              placeholder="Pregunta comercial…"
              className="h-10 bg-muted/25 border-border/60"
            />
            <Button type="submit" size="icon" className="h-10 shrink-0" disabled={chatMut.isPending}>
              <Send className="size-4" />
            </Button>
          </form>
        </GlassCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <LayoutGrid className="size-4 text-teal-400" />
            <h3 className="text-sm font-semibold font-heading">Matriz de oportunidad</h3>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Eje Y: score IA vs mediana ({Math.round(kpis.medS)}). Eje X: potencial USD vs mediana. Ideal: arriba-derecha.
          </p>
          <div className="grid grid-cols-2 gap-3 text-center text-sm">
            <div className="rounded-xl border border-teal-500/25 bg-teal-500/10 p-4">
              <p className="text-[10px] uppercase text-muted-foreground">Alto score · Alto $</p>
              <p className="text-2xl font-heading font-bold text-teal-300 mt-1">{kpis.mat.aa}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p className="text-[10px] uppercase text-muted-foreground">Alto score · Bajo $</p>
              <p className="text-2xl font-heading font-bold mt-1">{kpis.mat.ab}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p className="text-[10px] uppercase text-muted-foreground">Bajo score · Alto $</p>
              <p className="text-2xl font-heading font-bold mt-1">{kpis.mat.ba}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/15 p-4">
              <p className="text-[10px] uppercase text-muted-foreground">Bajo score · Bajo $</p>
              <p className="text-2xl font-heading font-bold mt-1">{kpis.mat.bb}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Radar className="size-4 text-indigo-400" />
            <h3 className="text-sm font-semibold font-heading">Pipeline por trimestre</h3>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">Distribución por mes de último contacto (aprox.).</p>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kpis.pipeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "10px",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="v" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {kpis.pipeline.map((_, i) => (
                    <Cell key={i} fill={["#2dd4bf", "#14b8a6", "#6366f1", "#818cf8"][i % 4]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4 md:p-6">
        <p className="text-sm font-semibold font-heading mb-4">Leads por zona (segmento)</p>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height={224}>
            <BarChart data={kpis.segment} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "10px",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="#2dd4bf" radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard className="p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold font-heading">Tabla de prospectos</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Exporta CSV con los filtros activos</p>
          </div>
          <div className="flex gap-2">
            <MagneticButton type="button" variant="outline" size="sm" className="gap-2" onClick={exportCsv}>
              <Download className="size-4" />
              CSV
            </MagneticButton>
          </div>
        </div>
        <DataTable columns={columns} data={filtrados} />
      </GlassCard>
    </div>
  );
}
