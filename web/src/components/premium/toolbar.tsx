"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { ReactNode } from "react";

export function PageToolbar({
  children,
  onExportCsv,
  exportLabel = "Exportar CSV",
}: {
  children?: ReactNode;
  onExportCsv?: () => void;
  exportLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="min-w-0">{children}</div>
      {onExportCsv && (
        <Button variant="outline" size="sm" className="shrink-0 border-border/60" onClick={onExportCsv}>
          <Download className="size-4 mr-2" />
          {exportLabel}
        </Button>
      )}
    </div>
  );
}
