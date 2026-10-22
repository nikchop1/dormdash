"use client";

import { useEffect, useState } from "react";

/** "in 8 min" / "3 min late" counting toward `to`, or elapsed "12 min" since `since`. */
export function Countdown({ to, since }: { to?: string; since?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  // Before the clock starts (server render), show a neutral, deterministic value.
  if (now === null) return <span className="tnum">{since ? "a few min" : "soon"}</span>;
  if (since) {
    const mins = Math.max(1, Math.round((now - new Date(since).getTime()) / 60000));
    return <span className="tnum">{mins} min</span>;
  }
  const mins = Math.round((new Date(to!).getTime() - now) / 60000);
  return <span className="tnum">{mins > 1 ? `in ${mins} min` : mins >= -1 ? "any minute now" : `${-mins} min past ETA`}</span>;
}
