"use client";

import { motion } from "framer-motion";
import { FloatingParticles } from "@/components/premium/floating-particles";

/** Fondo vivo: blobs teal/indigo + partículas + grano (COVIA / 2BI). */
export function AmbientBackdrop() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_-20%,rgba(45,212,191,0.11),transparent_50%)] dark:bg-[radial-gradient(ellipse_90%_55%_at_50%_-15%,rgba(20,184,166,0.14),transparent_52%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_100%_50%,rgba(99,102,241,0.07),transparent_45%)] dark:bg-[radial-gradient(ellipse_60%_45%_at_100%_40%,rgba(79,70,229,0.1),transparent_48%)]" />
      <motion.div
        className="absolute -left-1/4 top-1/4 h-[min(80vw,520px)] w-[min(80vw,520px)] rounded-full bg-teal-500/12 blur-[100px] dark:bg-teal-400/10"
        animate={{ x: [0, 36, 0], y: [0, 18, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-1/4 bottom-0 h-[min(70vw,420px)] w-[min(70vw,420px)] rounded-full bg-indigo-500/10 blur-[95px] dark:bg-indigo-500/12"
        animate={{ x: [0, -28, 0], y: [0, -22, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/3 top-1/2 h-[min(50vw,380px)] w-[min(50vw,380px)] rounded-full bg-emerald-500/8 blur-[85px] dark:bg-emerald-400/8"
        animate={{ scale: [1, 1.06, 1], opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <FloatingParticles count={32} />
      <div
        className="absolute inset-0 opacity-[0.32] dark:opacity-[0.2]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.055'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
