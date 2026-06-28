"use client";

import { useEffect, useState } from "react";
import { msUntilNextUtcMidnight } from "@/lib/daily";

function format(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function Countdown() {
  // Start null so server and first client render match (avoids hydration
  // mismatch); the real value fills in after mount.
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setMs(msUntilNextUtcMidnight());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="text-center text-sm text-zinc-500">
      <span className="block text-xs uppercase tracking-wide">Next puzzle in</span>
      <span className="font-mono text-lg tabular-nums">
        {ms === null ? "--:--:--" : format(ms)}
      </span>
    </div>
  );
}
