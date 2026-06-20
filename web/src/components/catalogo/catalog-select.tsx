"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import type { CatalogoClave } from "@/lib/catalog-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export type CatalogoRow = { id: number; clave: string; valor: string; orden?: number | null };

type Props = {
  clave: CatalogoClave;
  label: string;
  value: string | null | undefined;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
};

const NONE = "__none__";

export function CatalogSelect({ clave, label, value, onChange, disabled, id }: Props) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [nuevo, setNuevo] = useState("");

  const q = useQuery({
    queryKey: ["catalogos", clave],
    queryFn: () => apiFetch<CatalogoRow[]>(`/api/catalogos?clave=${encodeURIComponent(clave)}`),
  });

  const addMut = useMutation({
    mutationFn: (valor: string) =>
      apiFetch<CatalogoRow>("/api/catalogos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, valor }),
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["catalogos", clave] });
      qc.invalidateQueries({ queryKey: ["catalogos"] });
      onChange(row.valor);
      setAddOpen(false);
      setNuevo("");
      toast.success("Valor agregado al catálogo");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar"),
  });

  const current = (value && String(value).trim()) || "";
  const selectValue = current || NONE;

  const rowsWithLegacy = useMemo(() => {
    const list = q.data ?? [];
    const vals = new Set(list.map((r) => r.valor));
    if (current && !vals.has(current)) {
      return [...list, { id: -1, clave, valor: current, orden: 0 } as CatalogoRow];
    }
    return list;
  }, [q.data, current, clave]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-2">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] gap-1 text-primary"
          disabled={disabled}
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-3" />
          Nuevo en catálogo
        </Button>
      </div>
      <Select
        value={selectValue}
        onValueChange={(v) => onChange(!v || v === NONE ? "" : v)}
        disabled={disabled || q.isLoading}
      >
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue placeholder={q.isLoading ? "Cargando…" : "Selecciona…"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">Sin definir</span>
          </SelectItem>
          {rowsWithLegacy.map((r) => (
            <SelectItem key={`${r.id}-${r.valor}`} value={r.valor}>
              {r.valor}
              {r.id < 0 ? " (actual, agrega al catálogo)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md border-border/60 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-base">Agregar a catálogo: {label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="nuevo-cat" className="text-xs">
              Nombre exacto (aparecerá en listas y reportes)
            </Label>
            <Input
              id="nuevo-cat"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              placeholder="Ej. Instrumentación"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const t = nuevo.trim();
                  if (t) addMut.mutate(t);
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!nuevo.trim() || addMut.isPending}
              onClick={() => addMut.mutate(nuevo.trim())}
            >
              Guardar y usar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
