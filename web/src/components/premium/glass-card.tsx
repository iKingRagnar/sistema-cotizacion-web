"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function GlassCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={false}
      whileHover={{ y: -2, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
      className={cn(
        "rounded-2xl border border-white/10 bg-card/55 backdrop-blur-xl shadow-[0_8px_40px_-14px_rgba(0,0,0,0.45)] transition-[box-shadow] duration-300 hover:border-teal-500/20 hover:shadow-[0_16px_48px_-12px_rgba(20,184,166,0.12)] dark:border-white/[0.08] dark:bg-card/45 dark:hover:border-teal-400/15",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
