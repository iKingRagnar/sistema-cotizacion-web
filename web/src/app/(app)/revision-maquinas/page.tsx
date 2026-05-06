"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { downloadText, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { motion } from "framer-motion";
import { Cpu, LayoutGrid, Table2 } from "lucide-react";
import { useMemo } from "react";

type Rev = {
  id: number;
  categoria?: string | null;
  modelo?: string | null;
  numero_serie?: string | null;
  entregado?: string | null;
  prueba?: string | null;
  comentarios?: string | null;
  maquina_modelo?: string | null;
  maquina_categoria?: string | null;
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function RevisionMaquinasPage() {
  const q = useQuery({
    queryKey: ["revision-maquinas"],
    queryFn: () => apiFetch<Rev[]>("/api/revision-maquinas"),
  });

  const columns = useMemo<ColumnDef<Rev>[]>(
    () => [
      { accessorKey: "id", header: "ID" },
      { accessorKey: "maquina_categoria", header: "Cat. máq.", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "modelo", header: "Modelo" },
      { accessorKey: "numero_serie", header: "Serie", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "entregado",
        header: "Entregado",
        cell: ({ row }) => (
          <Badge variant={row.original.entregado === "Sí" ? "default" : "secondary"}>
            {row.original.entregado || "—"}
          </Badge>
        ),
      },
      {
        accessorKey: "prueba",
        header: "Prueba",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.prueba || "—"}
          </Badge>
        ),
      },
      {
        accessorKey: "comentarios",
        header: "Observaciones",
        cell: ({ getValue }) => (
          <span className="max-w-[240px] truncate block" title={String(getValue() || "")}>
            {String(getValue() || "—")}
          </span>
        ),
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((r) => [
      r.id,
      r.maquina_categoria,
      r.modelo,
      r.numero_serie,
      r.entregado,
      r.prueba,
      r.comentarios,
    ]);
    downloadText(
      `revision-maquinas-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["id", "categoria", "modelo", "serie", "entregado", "prueba", "comentarios"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  const list = q.data ?? [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageToolbar onExportCsv={exportCsv}>
        <div>
          <h2 className="text-xl font-semibold font-heading">Revisión de máquinas</h2>
          <p className="text-sm text-muted-foreground">
            Vista premium: tarjetas animadas y tabla detallada. Estados de entrega y prueba en vivo.
          </p>
        </div>
      </PageToolbar>

      <Tabs defaultValue="cards" className="space-y-4">
        <TabsList className="bg-muted/40 border border-border/50">
          <TabsTrigger value="cards" className="gap-2 data-[state=active]:bg-background/80">
            <LayoutGrid className="size-4" />
            Tarjetas
          </TabsTrigger>
          <TabsTrigger value="table" className="gap-2 data-[state=active]:bg-background/80">
            <Table2 className="size-4" />
            Tabla
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="mt-4">
          <motion.ul
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            variants={container}
            initial="hidden"
            animate="show"
          >
            {list.map((r) => (
              <motion.li
                key={r.id}
                variants={item}
                className="group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card/90 to-card/40 p-5 shadow-sm backdrop-blur-md transition-[box-shadow,transform] hover:shadow-lg hover:border-primary/25 hover:-translate-y-0.5"
              >
                <div className="absolute -right-8 -top-8 size-24 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-100 opacity-60" />
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Cpu className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {r.maquina_categoria || "Categoría"}
                      </p>
                      <p className="font-heading font-semibold truncate">{r.modelo || "—"}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        SN {r.numero_serie || "—"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    #{r.id}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant={r.entregado === "Sí" ? "default" : "secondary"}>
                    Entregado: {r.entregado || "—"}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    Prueba: {r.prueba || "—"}
                  </Badge>
                </div>
                {r.comentarios ? (
                  <p className="mt-3 text-xs text-muted-foreground leading-relaxed line-clamp-3 border-t border-border/40 pt-3">
                    {r.comentarios}
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground/70 border-t border-border/40 pt-3 italic">
                    Sin comentarios
                  </p>
                )}
              </motion.li>
            ))}
          </motion.ul>
        </TabsContent>

        <TabsContent value="table">
          <GlassCard className="p-4 md:p-6">
            <DataTable columns={columns} data={list} />
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
