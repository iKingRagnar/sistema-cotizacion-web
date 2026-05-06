"use client";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AmbientBackdrop } from "@/components/premium/ambient-backdrop";
import { CursorSpotlight } from "@/components/premium/cursor-spotlight";
import { ScrollProgress } from "@/components/premium/scroll-progress";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <AmbientBackdrop />
      <CursorSpotlight />
      <ScrollProgress />
      <AppSidebar />
      <div className="relative z-10 lg:pl-64">
        <AppHeader />
        <motion.main
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 p-4 md:p-6"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
