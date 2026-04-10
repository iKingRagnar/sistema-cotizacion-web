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
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Maquina = {
  id: number;
  nombre: string;
  modelo?: string | null;
  numero_serie?: string | null;
  ubicacion?: string | null;
  categoria?: string | null;
  activo?: number | null;
  cliente_nombre?: string | null;
};

export default function MaquinasPage() {
  const q = useQuery({ queryKey: ["maquinas"], queryFn: () => apiFetch<Maquina[]>("/api/maquinas") });
  const [printRow, setPrintRow] = useState<Maquina | null>(null);

  const columns = useMemo<ColumnDef<Maquina>[]>(
    () => [
      { accessorKey: "cliente_nombre", header: "Cliente", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "nombre",
        header: "Modelo / equipo",
        cell: ({ row }) => row.original.modelo || row.original.nombre || "—",
      },
      { accessorKey: "numero_serie", header: "Número de serie", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "categoria", header: "Categoría", cell: ({ getValue }) => getValue() || "—" },
      {
        accessorKey: "ubicacion",
        header: "Zona",
        cell: ({ getValue }) => getValue() || "—",
      },
      {
        accessorKey: "activo",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant={row.original.activo ? "secondary" : "outline"}>
            {row.original.activo ? "Activo" : "Baja"}
          </Badge>
        ),
      },
      {
        id: "ficha",
        header: "Ficha",
        cell: ({ row }) => (
          <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={() => setPrintRow(row.original)}>
            Ver / imprimir
          </Button>
        ),
      },
    ],
    []
  );

  const exportCsv = () => {
    const rows = (q.data ?? []).map((m) => [
      m.cliente_nombre,
      m.modelo || m.nombre,
      m.numero_serie,
      m.categoria,
      m.ubicacion,
      m.activo,
    ]);
    downloadText(
      `maquinas-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["cliente", "modelo_equipo", "numero_serie", "categoria", "zona", "activo"], rows)
    );
  };

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Máquinas</h2>
        <p className="text-sm text-muted-foreground">Equipos por cliente y zona (sin columna de marca en vista estándar)</p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={q.data ?? []} />
      </GlassCard>

      <Dialog open={!!printRow} onOpenChange={(o) => !o && setPrintRow(null)}>
        <DialogContent className="max-w-md print:shadow-none print:border-0">
          <DialogHeader>
            <DialogTitle className="font-heading">Ficha de máquina</DialogTitle>
          </DialogHeader>
          {printRow && (
            <div className="space-y-3 text-sm print:text-black">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
                <p className="text-xs text-muted-foreground print:text-gray-600">Cliente</p>
                <p className="font-medium">{printRow.cliente_nombre || "—"}</p>
                <p className="text-xs text-muted-foreground print:text-gray-600 mt-3">Modelo / equipo</p>
                <p className="font-medium">{printRow.modelo || printRow.nombre}</p>
                <p className="text-xs text-muted-foreground print:text-gray-600 mt-3">Número de serie</p>
                <p className="font-mono">{printRow.numero_serie || "—"}</p>
                <p className="text-xs text-muted-foreground print:text-gray-600 mt-3">Categoría</p>
                <p>{printRow.categoria || "—"}</p>
                <p className="text-xs text-muted-foreground print:text-gray-600 mt-3">Zona</p>
                <p>{printRow.ubicacion || "—"}</p>
                <p className="text-xs text-muted-foreground print:text-gray-600 mt-3">Estado</p>
                <Badge>{printRow.activo ? "Activo" : "Baja"}</Badge>
              </div>
              <Button type="button" className="w-full print:hidden" onClick={() => window.print()}>
                Imprimir
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
