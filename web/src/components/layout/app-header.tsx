"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { mainNav } from "@/config/nav";
import { cn } from "@/lib/utils";
import { Menu, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function AppHeader() {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const title = mainNav.find((n) => n.href === pathname)?.label ?? "Gestor Administrativo";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú" />
          }
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 flex flex-col bg-sidebar/95">
          <div className="border-b border-border/50 p-4 text-sm font-semibold">Navegación</div>
          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {mainNav.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                    active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold tracking-tight truncate font-[family-name:var(--font-heading)]">
          {title}
        </h1>
        <p className="text-xs text-muted-foreground hidden sm:block">Gestor Administrativo V4 · México</p>
      </div>

      <div className="relative hidden sm:block w-full max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar en la app… (próximamente)"
          className="h-9 pl-9 bg-muted/40 border-border/60"
          disabled
        />
      </div>

      <Button
        variant="outline"
        size="icon"
        className="shrink-0 border-border/60"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label="Cambiar tema"
      >
        {!mounted ? (
          <span className="size-4" />
        ) : theme === "dark" ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
      </Button>
    </header>
  );
}
