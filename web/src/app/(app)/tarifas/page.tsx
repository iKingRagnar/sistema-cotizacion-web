"use client";

import { ErrorState } from "@/components/premium/error-state";
import { GlassCard } from "@/components/premium/glass-card";
import { PageToolbar } from "@/components/premium/toolbar";
import { apiFetch } from "@/lib/api";
import { downloadText, rowsToCsv } from "@/lib/format";
import { useRequireAdminRedirect } from "@/lib/use-require-admin";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

export default function TarifasPage() {
  const allowed = useRequireAdminRedirect();
  const q = useQuery({
    queryKey: ["tarifas"],
    queryFn: () => apiFetch<Record<string, string>>("/api/tarifas"),
    enabled: allowed === true,
  });

  const exportCsv = () => {
    const entries = Object.entries(q.data ?? {});
    downloadText(
      `tarifas-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(
        ["clave", "valor"],
        entries.map(([k, v]) => [k, v])
      )
    );
  };

  if (allowed === null) {
    return <p className="text-sm text-muted-foreground p-6">Verificando acceso…</p>;
  }
  if (!allowed) return null;

  if (q.isError) {
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  }

  const entries = Object.entries(q.data ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="max-w-5xl mx-auto space-y-2">
      <PageToolbar onExportCsv={exportCsv}>
        <h2 className="text-xl font-semibold font-heading">Tarifas y parámetros</h2>
        <p className="text-sm text-muted-foreground">Valores editables por administración en el servidor</p>
      </PageToolbar>
      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(([k, v], i) => (
          <motion.div
            key={k}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.015 }}
          >
            <GlassCard className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{k}</p>
              <p className="mt-1 text-sm font-mono text-foreground break-all">{v}</p>
            </GlassCard>
          </motion.div>
        ))}
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
    </div>
  );
}
