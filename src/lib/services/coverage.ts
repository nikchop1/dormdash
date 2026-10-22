import "server-only";
import { q, q1 } from "@/lib/db";
import { coverageMap, nextCoveredWindow } from "@/lib/domain/runners";
import { DAY_NAMES, hourLabel, nyParts } from "@/lib/domain/time";

export async function runnersOnShift(): Promise<number> {
  const r = await q1<{ n: number }>(
    "select count(*)::int as n from public.profiles where runner_status = 'approved' and on_shift and status = 'active'",
  );
  return r?.n ?? 0;
}

export async function shiftCoverage() {
  const rows = await q<{ runner_id: string; day_of_week: number; start_hour: number }>(
    `select s.runner_id, s.day_of_week, s.start_hour from public.shifts s
     join public.profiles p on p.id = s.runner_id
     where p.runner_status = 'approved' and p.status = 'active'`,
  );
  return coverageMap(rows.map((r) => ({ runnerId: r.runner_id, day: r.day_of_week, hour: r.start_hour })));
}

export type CoverageStatus = {
  onShift: number;
  next: { label: string; day: number; startHour: number; hours: number; daysAhead: number } | null;
};

/** "Who can run right now, and if nobody, when's the next crew?" */
export async function coverageStatus(now = new Date()): Promise<CoverageStatus> {
  const [onShift, cov] = await Promise.all([runnersOnShift(), shiftCoverage()]);
  const p = nyParts(now);
  // Start looking from the next hour so "now" doesn't count when nobody is actually on.
  const wraps = p.hour === 23;
  const w = nextCoveredWindow(cov, { weekday: wraps ? (p.weekday + 1) % 7 : p.weekday, hour: (p.hour + 1) % 24 });
  let next: CoverageStatus["next"] = null;
  if (w) {
    const daysAhead = w.daysAhead + (wraps ? 1 : 0);
    const dayLabel = daysAhead === 0 ? "Today" : daysAhead === 1 ? "Tomorrow" : DAY_NAMES[w.day];
    const end = (w.startHour + w.hours) % 24;
    next = { ...w, daysAhead, label: `${dayLabel} ${hourLabel(w.startHour)} to ${hourLabel(end)}` };
  }
  return { onShift, next };
}
