"use client";

import { motion } from "framer-motion";

/** Fondo vivo: blobs difuminados + grano sutil (sin canvas pesado). */
export function AmbientBackdrop() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-30%,rgba(52,211,153,0.14),transparent_55%)] dark:bg-[radial-gradient(ellipse_90%_60%_at_50%_-25%,rgba(16,185,129,0.12),transparent_55%)]" />
      <motion.div
        className="absolute -left-1/4 top-1/4 h-[min(80vw,520px)] w-[min(80vw,520px)] rounded-full bg-emerald-500/10 blur-[100px] dark:bg-emerald-400/8"
        animate={{ x: [0, 40, 0], y: [0, 20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-1/4 bottom-0 h-[min(70vw,420px)] w-[min(70vw,420px)] rounded-full bg-sky-500/10 blur-[90px] dark:bg-sky-500/8"
        animate={{ x: [0, -30, 0], y: [0, -25, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/3 top-1/2 h-[min(50vw,400px)] w-[min(50vw,400px)] rounded-full bg-violet-500/6 blur-[80px] dark:bg-violet-400/5"
        animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.22]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
