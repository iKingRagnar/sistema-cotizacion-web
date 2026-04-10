"use client";

import { CatalogSelect } from "@/components/catalogo/catalog-select";
import { DataTable } from "@/components/data-table/data-table";
import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api";
import { CATALOGO } from "@/lib/catalog-keys";
import { downloadText, formatMoneyMxn, rowsToCsv } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Tecnico = {
  id: number;
  nombre: string;
  rol?: string | null;
  puesto?: string | null;
  departamento?: string | null;
  profesion?: string | null;
  habilidades?: string | null;
  es_vendedor?: number | null;
  ocupado?: number | null;
  comision_maquinas_pct?: number | null;
  comision_refacciones_pct?: number | null;
};

type BonoRes = { tecnico: string; total_bonos?: number | null; cantidad?: number | null; pagado?: number | null };

const SUCURSALES = ["Monterrey", "Saltillo", "CDMX", "León", "Querétaro"];

function emptyForm() {
  return {
    id: null as number | null,
    nombre: "",
    rol: "",
    puesto: "",
    departamento: "",
    profesion: "",
    habilidades: "",
    es_vendedor: false,
    comision_maquinas_pct: "",
    comision_refacciones_pct: "",
  };
}

export default function PersonalPage() {
  const qc = useQueryClient();
  const tec = useQuery({ queryKey: ["tecnicos"], queryFn: () => apiFetch<Tecnico[]>("/api/tecnicos") });
  const br = useQuery({ queryKey: ["bonos-resumen"], queryFn: () => apiFetch<BonoRes[]>("/api/bonos-resumen") });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

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

  const saveMut = useMutation({
    mutationFn: async () => {
      const nombre = form.nombre.trim();
      if (!nombre) throw new Error("Nombre requerido");
      const body = {
        nombre,
        rol: form.rol || null,
        puesto: form.puesto || null,
        departamento: form.departamento || null,
        profesion: form.profesion || null,
        habilidades: form.habilidades || null,
        es_vendedor: form.es_vendedor,
        comision_maquinas_pct: Number(form.comision_maquinas_pct) || 0,
        comision_refacciones_pct: Number(form.comision_refacciones_pct) || 0,
        ocupado: 0,
      };
      if (form.id != null) {
        return apiFetch<Tecnico>(`/api/tecnicos/${form.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, activo: 1 }),
        });
      }
      return apiFetch<Tecnico>("/api/tecnicos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tecnicos"] });
      setSheetOpen(false);
      setForm(emptyForm());
      toast.success("Colaborador guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setForm(emptyForm());
    setSheetOpen(true);
  };

  const openEdit = (t: Tecnico) => {
    setForm({
      id: t.id,
      nombre: t.nombre,
      rol: t.rol || "",
      puesto: t.puesto || "",
      departamento: t.departamento || "",
      profesion: t.profesion || "",
      habilidades: t.habilidades || "",
      es_vendedor: !!t.es_vendedor,
      comision_maquinas_pct: t.comision_maquinas_pct != null ? String(t.comision_maquinas_pct) : "",
      comision_refacciones_pct: t.comision_refacciones_pct != null ? String(t.comision_refacciones_pct) : "",
    });
    setSheetOpen(true);
  };

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
      { accessorKey: "profesion", header: "Profesión", cell: ({ getValue }) => getValue() || "—" },
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
      {
        id: "acciones",
        header: "",
        cell: ({ row }) => (
          <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(row.original)} title="Editar">
            <Pencil className="size-4" />
          </Button>
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
      r.profesion,
      r.sucursal,
      r.salario,
      r.bonos,
      r.ocupado,
    ]);
    downloadText(
      `personal-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(
        ["nombre", "rol", "puesto", "depto", "profesion", "sucursal", "salario_ref", "bonos", "ocupado"],
        data
      )
    );
  };

  if (tec.isError) {
    return <ErrorState message={(tec.error as Error).message} onRetry={() => tec.refetch()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <PageToolbar onExportCsv={exportCsv}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between w-full">
          <div>
            <h2 className="text-xl font-semibold font-heading">Personal / Técnicos</h2>
            <p className="text-sm text-muted-foreground">
              Rol, puesto, departamento y profesión salen de{" "}
              <Link href="/catalogos" className="text-primary underline-offset-2 hover:underline">
                Catálogos
              </Link>{" "}
              (valores fijos). Comentarios y habilidades siguen siendo texto libre.
            </p>
          </div>
          <Button type="button" onClick={openNew} className="shrink-0">
            Nuevo colaborador
          </Button>
        </div>
      </PageToolbar>
      <GlassCard className="p-4 md:p-6">
        <DataTable columns={columns} data={rows} />
      </GlassCard>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto border-border/60 bg-card/95 backdrop-blur-xl">
          <SheetHeader>
            <SheetTitle className="font-heading">{form.id ? "Editar colaborador" : "Nuevo colaborador"}</SheetTitle>
            <SheetDescription>
              Usa listas cerradas para datos estructurados; evita variaciones como &quot;vendedor&quot; vs
              &quot;Vendedor&quot;.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 py-6">
            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre completo</Label>
              <Input
                id="nombre"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre y apellidos"
              />
            </div>
            <CatalogSelect
              clave={CATALOGO.ROL}
              label="Rol"
              value={form.rol}
              onChange={(rol) => setForm((f) => ({ ...f, rol }))}
              id="rol"
            />
            <CatalogSelect
              clave={CATALOGO.PUESTO}
              label="Puesto"
              value={form.puesto}
              onChange={(puesto) => setForm((f) => ({ ...f, puesto }))}
              id="puesto"
            />
            <CatalogSelect
              clave={CATALOGO.DEPARTAMENTO}
              label="Departamento"
              value={form.departamento}
              onChange={(departamento) => setForm((f) => ({ ...f, departamento }))}
              id="departamento"
            />
            <CatalogSelect
              clave={CATALOGO.PROFESION}
              label="Profesión"
              value={form.profesion}
              onChange={(profesion) => setForm((f) => ({ ...f, profesion }))}
              id="profesion"
            />
            <div className="space-y-1.5">
              <Label htmlFor="hab">Habilidades / notas (texto libre)</Label>
              <textarea
                id="hab"
                className="flex min-h-[88px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                value={form.habilidades}
                onChange={(e) => setForm((f) => ({ ...f, habilidades: e.target.value }))}
                placeholder="PLC, Fanuc, ventas B2B…"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ev"
                checked={form.es_vendedor}
                onCheckedChange={(c) => setForm((f) => ({ ...f, es_vendedor: c === true }))}
              />
              <Label htmlFor="ev" className="text-sm font-normal cursor-pointer">
                Es vendedor (comisiona)
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cm">% comisión máquinas</Label>
                <Input
                  id="cm"
                  inputMode="decimal"
                  value={form.comision_maquinas_pct}
                  onChange={(e) => setForm((f) => ({ ...f, comision_maquinas_pct: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cr">% comisión refacciones</Label>
                <Input
                  id="cr"
                  inputMode="decimal"
                  value={form.comision_refacciones_pct}
                  onChange={(e) => setForm((f) => ({ ...f, comision_refacciones_pct: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <SheetFooter className="gap-2 sm:justify-end border-t border-border/50 pt-4">
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              Guardar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
