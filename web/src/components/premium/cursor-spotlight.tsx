"use client";

import { useEffect, useState } from "react";

/** Resalte sutil que sigue al cursor (estilo 2BI / COVIA). */
export function CursorSpotlight() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setReady(true);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  if (!ready) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[0] transition-opacity duration-500"
      aria-hidden
      style={{
        background: `
          radial-gradient(520px circle at ${pos.x}px ${pos.y}px, rgba(45,212,191,0.09), transparent 42%),
          radial-gradient(380px circle at ${pos.x - 80}px ${pos.y + 40}px, rgba(79,70,229,0.06), transparent 45%)
        `,
      }}
    />
  );
}
