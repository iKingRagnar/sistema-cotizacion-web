"use client";

import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { CATALOGO, CATALOGO_LABELS } from "@/lib/catalog-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Row = { id: number; clave: string; valor: string; orden?: number | null };

const TAB_KEYS = [
  CATALOGO.ROL,
  CATALOGO.PUESTO,
  CATALOGO.DEPARTAMENTO,
  CATALOGO.PROFESION,
  CATALOGO.COTIZACION_TIPO,
  CATALOGO.COTIZACION_ESTADO,
] as const;

export default function CatalogosPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>(TAB_KEYS[0]);
  const [addOpen, setAddOpen] = useState(false);
  const [nuevo, setNuevo] = useState("");

  const q = useQuery({
    queryKey: ["catalogos", "all"],
    queryFn: () => apiFetch<Record<string, Row[]>>("/api/catalogos"),
  });

  const addMut = useMutation({
    mutationFn: (valor: string) =>
      apiFetch<Row>("/api/catalogos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: tab, valor }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogos"] });
      setAddOpen(false);
      setNuevo("");
      toast.success("Valor guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/catalogos/${id}`, { method: "DELETE" }) as Promise<{ ok: boolean }>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogos"] });
      toast.success("Valor desactivado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageToolbar>
        <div>
          <h2 className="text-xl font-semibold font-heading">Catálogos del sistema</h2>
          <p className="text-sm text-muted-foreground">
            Valores permitidos para rol, puesto, departamento, cotizaciones, etc. Agrega entradas aquí; en
            formularios solo se elige de la lista (menos errores de captura).
          </p>
        </div>
      </PageToolbar>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/40 p-1 border border-border/50">
          {TAB_KEYS.map((k) => (
            <TabsTrigger key={k} value={k} className="text-xs sm:text-sm">
              {CATALOGO_LABELS[k] ?? k}
            </TabsTrigger>
          ))}
        </TabsList>

        {TAB_KEYS.map((k) => {
          const list = (q.data || {})[k] ?? [];
          return (
            <TabsContent key={k} value={k} className="space-y-3">
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
                  Agregar valor
                </Button>
              </div>
              <GlassCard className="p-4 md:p-6">
                {q.isLoading ? (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin valores. Agrega el primero.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {list.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span className="text-sm font-medium">{r.valor}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          title="Quitar del catálogo"
                          onClick={() => {
                            if (confirm(`¿Desactivar "${r.valor}"? Seguirá en registros ya guardados.`)) {
                              delMut.mutate(r.id);
                            }
                          }}
                          disabled={delMut.isPending}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </GlassCard>
            </TabsContent>
          );
        })}
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md border-border/60 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-base">
              Nuevo valor — {CATALOGO_LABELS[tab] ?? tab}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="cat-val">Texto exacto</Label>
            <Input
              id="cat-val"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const t = nuevo.trim();
                  if (t) addMut.mutate(t);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!nuevo.trim() || addMut.isPending}
              onClick={() => addMut.mutate(nuevo.trim())}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
