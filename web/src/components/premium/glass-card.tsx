import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function GlassCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 bg-card/50 backdrop-blur-md shadow-[0_8px_40px_-12px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      {children}
    </div>
  );
}
