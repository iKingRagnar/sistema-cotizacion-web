"use client";

import { motion, useScroll, useSpring } from "framer-motion";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-teal-500 via-emerald-400 to-indigo-500 shadow-[0_0_12px_rgba(45,212,191,0.45)]"
      style={{ scaleX }}
      aria-hidden
    />
  );
}
