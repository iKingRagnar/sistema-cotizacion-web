"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { downloadText, formatMoneyMxn, rowsToCsv } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

type Tecnico = {
  id: number;
  nombre: string;
  rol?: string | null;
  puesto?: string | null;
  departamento?: string | null;
  habilidades?: string | null;
  es_vendedor?: number | null;
  ocupado?: number | null;
};

type BonoRes = { tecnico: string; total_bonos?: number | null; cantidad?: number | null; pagado?: number | null };

const SUCURSALES = ["Monterrey", "Saltillo", "CDMX", "León", "Querétaro"];

export default function PersonalPage() {
  const tec = useQuery({ queryKey: ["tecnicos"], queryFn: () => apiFetch<Tecnico[]>("/api/tecnicos") });
  const br = useQuery({ queryKey: ["bonos-resumen"], queryFn: () => apiFetch<BonoRes[]>("/api/bonos-resumen") });

  const bonosMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of br.data ?? []) {
      m.set(b.tecnico, Number(b.total_bonos) || 0);
    }
    return m;
  }, [br.data]);

  type Row = Tecnico & { sucursal: string; salario: number; bonos: number };

  const rows: Row[] = useMemo(() => {
    return (tec.data ?? []).map((t, i) => ({
      ...t,
      sucursal: SUCURSALES[i % SUCURSALES.length],
      salario: 28000 + (i % 12) * 1800 + (t.es_vendedor ? 8000 : 0),
      bonos: bonosMap.get(t.nombre) ?? 0,
    }));
  }, [tec.data, bonosMap]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "avatar",
        header: "",
        cell: ({ row }) => (
          <Avatar className="size-9 ring-1 ring-border/60">
            <AvatarImage
              src={`https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(row.original.nombre)}`}
              alt=""
            />
            <AvatarFallback>{row.original.nombre.slice(0, 2)}</AvatarFallback>
          </Avatar>
        ),
      },
      { accessorKey: "nombre", header: "Nombre" },
      { accessorKey: "rol", header: "Rol", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "puesto", header: "Puesto", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "departamento", header: "Depto.", cell: ({ getValue }) => getValue() || "—" },
      { accessorKey: "sucursal", header: "Sucursal" },
      {
        accessorKey: "es_vendedor",
        header: "Ventas",
        cell: ({ row }) => (
          <Badge variant={row.original.es_vendedor ? "secondary" : "outline"}>
            {row.original.es_vendedor ? "Vende" : "No"}
          </Badge>
        ),
      },
      {
        accessorKey: "salario",
        header: "Salario ref.",
        cell: ({ getValue }) => formatMoneyMxn(Number(getValue()) || 0),
      },
      {
        accessorKey: "bonos",
        header: "Bonos acum.",
        cell: ({ getValue }) => formatMoneyMxn(Number(getValue()) || 0),
      },
      {
        accessorKey: "ocupado",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant={row.original.ocupado ? "outline" : "secondary"}>
            {row.original.ocupado ? "En campo" : "Disponible"}
          </Badge>
        ),
      },
    ],
    []
  );

  const exportCsv = () => {
    const data = rows.map((r) => [
      r.nombre,
      r.rol,
      r.puesto,
      r.departamento,
      r.sucursal,
      r.salario,
      r.bonos,
      r.ocupado,
    ]);
    downloadText(
      `personal-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(["nombre", "rol", "puesto", "depto", "sucursal", "salario_ref", "bonos", "ocupado"], data)
    );
  };

  if (tec.isError) {
    return <ErrorState message={(tec.error as Error).message} onRetry={() => tec.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Personal</h2>
        <p className="text-sm text-muted-foreground">
          Equipo técnico y ventas · salario referencia demo · bonos desde API
        </p>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={rows} />
      </GlassCard>
    </div>
  );
}
