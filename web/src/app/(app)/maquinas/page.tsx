"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { downloadText, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

type Maquina = {
  id: number;
  nombre: string;
  marca?: string | null;
  modelo?: string | null;
  numero_serie?: string | null;
  ubicacion?: string | null;
  categoria?: string | null;
  activo?: number | null;
  cliente_nombre?: string | null;
};

export default function MaquinasPage() {
  const q = useQuery({ queryKey: ["maquinas"], queryFn: () => apiFetch<Maquina[]>("/api/maquinas") });

  const columns = useMemo<ColumnDef<Maquina>[]>(
    () => [
      { accessorKey: "cliente_nombre", header: "Cliente", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "nombre", header: "Equipo" },
      { accessorKey: "marca", header: "Marca", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "modelo", header: "Modelo", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "numero_serie", header: "Serie", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "categoria", header: "Categoría", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "activo",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant={row.original.activo ? "secondary" : "outline"}>
            {row.original.activo ? "Activo" : "Baja"}
          </Badge>
        ),
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((m) => [
      m.nombre,
      m.marca,
      m.modelo,
      m.numero_serie,
      m.categoria,
      m.activo,
    ]);
    downloadText(
      `maquinas-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["nombre", "marca", "modelo", "numero_serie", "categoria", "activo"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Máquinas</h2>
        <p className="text-sm text-muted-foreground">Equipos por cliente y ubicación</p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>
    </div>
  );
}
