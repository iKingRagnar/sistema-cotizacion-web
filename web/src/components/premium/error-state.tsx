"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <AlertTriangle className="size-10 text-destructive mb-3" />
      <p className="text-sm font-medium text-foreground max-w-md">{message}</p>
      <p className="text-xs text-muted-foreground mt-2 max-w-md">
        Asegúrate de que el servidor Express esté en ejecución (puerto 3456) y que la sesión sea válida si
        AUTH_ENABLED=1.
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
