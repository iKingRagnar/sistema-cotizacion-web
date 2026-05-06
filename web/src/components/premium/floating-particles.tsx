"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

/** Partículas livianas (divs) — sin canvas, bajo costo. */
export function FloatingParticles({ count = 28 }: { count?: number }) {
  const items = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${(i * 37 + 13) % 100}%`,
      top: `${(i * 53 + 7) % 100}%`,
      duration: 14 + (i % 9) * 2,
      delay: (i % 7) * 0.4,
      size: 1 + (i % 3),
    }));
  }, [count]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full bg-teal-400/20 dark:bg-teal-300/15"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
          }}
          animate={{
            y: [0, -18, 0],
            opacity: [0.15, 0.55, 0.15],
            scale: [1, 1.4, 1],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: p.delay,
          }}
        />
      ))}
    </div>
  );
}
