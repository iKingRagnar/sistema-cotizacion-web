"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
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
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bot, MapPinned, Send, Sparkles } from "lucide-react";
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

export default function ProspectosPage() {
  const q = useQuery({ queryKey: ["prospectos"], queryFn: () => apiFetch<Prospecto[]>("/api/prospectos") });
  const [chatIn, setChatIn] = useState("");
  const [chatLog, setChatLog] = useState<{ role: "user" | "assistant"; text: string }[]>([]);

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

  const kpis = useMemo(() => {
    const rows = q.data ?? [];
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
    return { n, vol, score, segment };
  }, [q.data]);

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
          <span className="tabular-nums font-medium text-emerald-300">{Math.round(row.original.score_ia || 0)}</span>
        ),
      },
      {
        accessorKey: "estado",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.estado || "—"}
          </Badge>
        ),
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((r) => [
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
      (q.data ?? []).map((p) => ({
        id: p.id,
        lat: p.lat ?? 0,
        lng: p.lng ?? 0,
        empresa: p.empresa,
        zona: p.zona,
        potencial_usd: p.potencial_usd,
        score_ia: p.score_ia,
        estado: p.estado,
      })),
    [q.data]
  );

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-start gap-4">
        <div className="rounded-xl border border-border/60 bg-gradient-to-br from-violet-500/10 to-emerald-500/5 p-3">
          <MapPinned className="size-7 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight font-heading">Prospectos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Mapa de oportunidades, scoring heurístico y asistente comercial (requiere OPENAI_API_KEY en el servidor)
          </p>
        </div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-4">
        <GlassCard className="p-4 lg:col-span-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Leads activos</p>
          <p className="text-3xl font-semibold font-heading mt-1">{kpis.n}</p>
        </GlassCard>
        <GlassCard className="p-4 lg:col-span-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Volumen estimado (USD)</p>
          <p className="text-3xl font-semibold font-heading mt-1 text-emerald-300">
            {kpis.vol.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
          </p>
        </GlassCard>
        <GlassCard className="p-4 lg:col-span-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Score promedio</p>
          <p className="text-3xl font-semibold font-heading mt-1">{kpis.score.toFixed(0)}</p>
        </GlassCard>
        <GlassCard className="p-4 lg:col-span-1 flex items-center gap-2">
          <Sparkles className="size-5 text-amber-400 shrink-0" />
          <p className="text-xs text-muted-foreground">
            IA predictiva: prioriza prospectos con mayor score y potencial; sincroniza con pipeline de ventas.
          </p>
        </GlassCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <GlassCard className="p-4 md:p-5 xl:col-span-2 overflow-hidden">
          <h3 className="text-sm font-semibold font-heading mb-3">Mapa de prospectos (México)</h3>
          <ProspectMap points={mapPoints} />
        </GlassCard>
        <GlassCard className="p-4 md:p-5 flex flex-col min-h-[min(52vh,440px)]">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="size-4 text-sky-400" />
            <h3 className="text-sm font-semibold font-heading">Covia-style · asistente</h3>
          </div>
          <ScrollArea className="flex-1 min-h-[200px] rounded-lg border border-border/50 bg-muted/20 p-2 mb-2">
            {chatLog.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">
                Ej.: «¿Quién es el mejor prospecto para tornos CNC en Nuevo León?»
              </p>
            ) : (
              <ul className="space-y-2 text-xs">
                {chatLog.map((m, i) => (
                  <li
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-4 rounded-lg bg-primary/15 px-2 py-1.5"
                        : "mr-4 rounded-lg bg-muted/60 px-2 py-1.5"
                    }
                  >
                    {m.text}
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
          <form
            className="flex gap-2"
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
              className="h-9 bg-muted/30"
            />
            <Button type="submit" size="icon" className="h-9 shrink-0" disabled={chatMut.isPending}>
              <Send className="size-4" />
            </Button>
          </form>
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
                  borderRadius: "8px",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard className="p-4 md:p-6">
        <PageToolbar onExportCsv={exportCsv}>
          <h3 className="text-sm font-semibold font-heading">Tabla de prospectos</h3>
        </PageToolbar>
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
