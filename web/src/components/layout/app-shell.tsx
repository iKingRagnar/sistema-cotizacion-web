"use client";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AmbientBackdrop } from "@/components/premium/ambient-backdrop";
import { ScrollProgress } from "@/components/premium/scroll-progress";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <AmbientBackdrop />
      <ScrollProgress />
      <AppSidebar />
      <div className="lg:pl-64">
        <AppHeader />
        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="relative p-4 md:p-6"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
