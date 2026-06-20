"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, useMotionValue, useSpring } from "framer-motion";
import type { ComponentProps, ReactNode } from "react";
import { useRef } from "react";

const spring = { stiffness: 280, damping: 22, mass: 0.4 };

type MagneticButtonProps = ComponentProps<typeof Button> & { children: ReactNode };

/** Botón con micro-desplazamiento hacia el cursor (magnetic). */
export function MagneticButton({ className, children, ...props }: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, spring);
  const sy = useSpring(y, spring);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - r.left - r.width / 2) * 0.12);
    y.set((e.clientY - r.top - r.height / 2) * 0.12);
  };

  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className="inline-flex"
      style={{ x: sx, y: sy }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <Button
        className={cn(
          "relative shadow-[0_8px_32px_-12px_rgba(15,118,110,0.35)] hover:shadow-[0_12px_40px_-10px_rgba(45,212,191,0.25)]",
          className
        )}
        {...props}
      >
        {children}
      </Button>
    </motion.div>
  );
}
