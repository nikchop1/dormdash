"use client";

import { useEffect, useState } from "react";

/** "in 8 min" / "3 min late" counting toward `to`, or elapsed "12 min" since `since`. */
export function Countdown({ to, since }: { to?: string; since?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  // Render a stable value on the server, then tick on the client.
  const n = now ?? new Date(to ?? since ?? Date.now()).getTime() - (to ? 5 * 60000 : -60000);
  if (since) {
    const mins = Math.max(1, Math.round((n - new Date(since).getTime()) / 60000));
    return <span className="tnum" suppressHydrationWarning>{mins} min</span>;
  }
  const mins = Math.round((new Date(to!).getTime() - n) / 60000);
  return (
    <span className="tnum" suppressHydrationWarning>
      {mins > 1 ? `in ${mins} min` : mins >= -1 ? "any minute now" : `${-mins} min past ETA`}
    </span>
  );
}
