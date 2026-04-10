"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

export type MgCalEvent = {
  id: number;
  fecha_programada?: string | null;
  modelo_maquina?: string | null;
  razon_social?: string | null;
  confirmado?: number | null;
  alerta_vencida?: number | null;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function GarantiaCalendar({ items }: { items: MgCalEvent[] }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const { grid, label } = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startPad = (first.getDay() + 6) % 7; // Monday=0
    const daysInMonth = last.getDate();
    const cells: ({ day: number; dateStr: string } | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, dateStr: ds });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    const monthLabel = first.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
    return { grid: rows, label: monthLabel };
  }, [cursor]);

  const dateMap = useMemo(() => {
    const map = new Map<string, MgCalEvent[]>();
    const today = new Date().toISOString().slice(0, 10);
    for (const ev of items) {
      const fd = ev.fecha_programada ? String(ev.fecha_programada).slice(0, 10) : "";
      if (!fd) continue;
      if (!map.has(fd)) map.set(fd, []);
      map.get(fd)!.push(ev);
    }
    return { map, today };
  }, [items]);

  function priorityClass(ev: MgCalEvent): string {
    const fd = ev.fecha_programada ? String(ev.fecha_programada).slice(0, 10) : "";
    if (!fd) return "bg-muted";
    const t = new Date(fd + "T12:00:00").getTime();
    const now = Date.now();
    const d30 = 30 * 86400000;
    if (!ev.confirmado && t < now) return "bg-rose-500/25 border-rose-500/40 text-rose-100";
    if (!ev.confirmado && t >= now && t <= now + d30) return "bg-amber-500/20 border-amber-500/35 text-amber-100";
    return "bg-emerald-500/15 border-emerald-500/30 text-emerald-50";
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium font-heading capitalize">{label}</h3>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground text-center pb-1">
        {DOW.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="space-y-1">
        {grid.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 gap-1">
            {row.map((cell, ci) => {
              if (!cell) return <div key={`e-${ci}`} className="min-h-[72px] rounded-md bg-muted/20" />;
              const list = dateMap.map.get(cell.dateStr) ?? [];
              const isToday = cell.dateStr === dateMap.today;
              return (
                <div
                  key={cell.dateStr}
                  className={cn(
                    "min-h-[72px] rounded-lg border border-border/50 p-1 text-left transition-colors",
                    isToday && "ring-1 ring-primary/50 bg-primary/5"
                  )}
                >
                  <div className="text-[11px] font-medium text-muted-foreground">{cell.day}</div>
                  <div className="mt-0.5 space-y-0.5 max-h-[52px] overflow-y-auto">
                    {list.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className={cn("truncate rounded px-0.5 text-[9px] border", priorityClass(ev))}
                        title={`${ev.razon_social || ""} · ${ev.modelo_maquina || ""}`}
                      >
                        {ev.modelo_maquina || "Mtto."}
                      </div>
                    ))}
                    {list.length > 3 && (
                      <div className="text-[9px] text-muted-foreground">+{list.length - 3}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Leyenda: <span className="text-rose-300">vencido sin confirmar</span> ·{" "}
        <span className="text-amber-300">próximos 30 días</span> · <span className="text-emerald-300">resto</span>
      </p>
    </div>
  );
}
