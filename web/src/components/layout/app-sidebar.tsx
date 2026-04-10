"use client";

import { mainNav } from "@/config/nav";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-40 border-r border-border/60 bg-sidebar/80 backdrop-blur-xl",
        className
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b border-border/50 px-5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 ring-1 ring-emerald-500/30">
          <Sparkles className="size-5 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-foreground truncate font-[family-name:var(--font-heading)]">
            Gestor V4
          </p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Operaciones</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
        {mainNav.map((item, i) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02, duration: 0.2 }}
            >
              <Link
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-transform group-hover:scale-105",
                    active && "text-emerald-400"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>
      <div className="border-t border-border/50 p-4">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Panel premium · datos en tiempo real vía API interna.
        </p>
      </div>
    </aside>
  );
}
