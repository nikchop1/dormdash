// Runs: several orders on one trip. Pure helpers for suggesting runs, the
// "heading home" filter, and the order of stops on the run screen.
import { haversineMiles } from "./geo";
import { formatCents } from "./pricing";

export type RunJob = {
  id: string;
  spotId: string;
  spotName: string;
  spotLat: number;
  spotLng: number;
  buildingId: string;
  floor: number;
  payCents: number;
  foodValueCents: number;
  createdAt: Date;
};

export type SuggestedRun<J extends RunJob = RunJob> = {
  key: string;
  buildingId: string;
  jobs: J[];
  pickups: number;
  payCents: number;
  label: string;
};

export function runLabel(jobs: { spotId: string; payCents: number }[]) {
  const pickups = new Set(jobs.map((j) => j.spotId)).size;
  const pay = jobs.reduce((s, j) => s + j.payCents, 0);
  return `${jobs.length} ${jobs.length === 1 ? "order" : "orders"} · ${pickups} ${pickups === 1 ? "pickup" : "pickups"} · ${formatCents(pay)}`;
}

/** Sort for a run: grouped by pickup spot (most orders first), then destination floor ascending. */
export function sortForRun<J extends RunJob>(jobs: J[]): J[] {
  const bySpot = new Map<string, J[]>();
  for (const j of jobs) bySpot.set(j.spotId, [...(bySpot.get(j.spotId) ?? []), j]);
  const spots = [...bySpot.values()].sort((a, b) => b.length - a.length || a[0].spotName.localeCompare(b[0].spotName));
  return spots.flatMap((g) => [...g].sort((a, b) => a.floor - b.floor));
}

/**
 * Suggested runs: one per destination building, orders grouped by pickup spot then
 * floor, capped at the runner's remaining capacity (and food-value cap if any).
 * Single orders are included too: a run of one is still a run.
 */
export function suggestRuns<J extends RunJob>(
  jobs: J[],
  opts: { capacity: number; foodCapCents: number | null; activeFoodCents: number },
): SuggestedRun<J>[] {
  if (opts.capacity < 1) return [];
  const byBuilding = new Map<string, J[]>();
  for (const j of jobs) byBuilding.set(j.buildingId, [...(byBuilding.get(j.buildingId) ?? []), j]);
  const runs: SuggestedRun<J>[] = [];
  for (const [buildingId, list] of byBuilding) {
    const picked: J[] = [];
    let food = opts.activeFoodCents;
    for (const j of sortForRun(list)) {
      if (picked.length >= opts.capacity) break;
      if (opts.foodCapCents !== null && food + j.foodValueCents > opts.foodCapCents) continue;
      picked.push(j);
      food += j.foodValueCents;
    }
    if (picked.length === 0) continue;
    const ordered = sortForRun(picked);
    runs.push({
      key: ordered.map((j) => j.id).sort().join("+"),
      buildingId,
      jobs: ordered,
      pickups: new Set(ordered.map((j) => j.spotId)).size,
      payCents: ordered.reduce((s, j) => s + j.payCents, 0),
      label: runLabel(ordered),
    });
  }
  return runs.sort((a, b) => b.jobs.length - a.jobs.length || b.payCents - a.payCents);
}

/** Heading home: pickups near where the runner is now, going to the building they're headed to. */
export function headingHomeFilter<J extends RunJob>(jobs: J[], here: { lat: number; lng: number }, buildingId: string, radiusMiles: number): J[] {
  return jobs.filter((j) => j.buildingId === buildingId && haversineMiles(here, { lat: j.spotLat, lng: j.spotLng }) <= radiusMiles);
}

export type StopOrder = { id: string; status: string; spotId: string; spotName: string; floor: number; room: string };

export type Stop =
  | { kind: "pickup"; spotId: string; spotName: string; orders: StopOrder[]; done: boolean }
  | { kind: "delivery"; order: StopOrder; done: boolean };

const DELIVERED = new Set(["delivered", "customer_no_show", "cancelled"]);

/** The run checklist: pickups first (grouped by restaurant), then deliveries by floor ascending (elevator order). */
export function runStops(orders: StopOrder[]): Stop[] {
  const live = orders.filter((o) => o.status !== "cancelled");
  const bySpot = new Map<string, StopOrder[]>();
  for (const o of live) bySpot.set(o.spotId, [...(bySpot.get(o.spotId) ?? []), o]);
  const pickups: Stop[] = [...bySpot.values()].map((g) => ({
    kind: "pickup" as const,
    spotId: g[0].spotId,
    spotName: g[0].spotName,
    orders: g,
    done: g.every((o) => o.status !== "claimed"),
  }));
  const deliveries: Stop[] = [...live]
    .sort((a, b) => a.floor - b.floor || a.room.localeCompare(b.room, undefined, { numeric: true }))
    .map((o) => ({ kind: "delivery" as const, order: o, done: DELIVERED.has(o.status) }));
  return [...pickups, ...deliveries];
}

/** The stop the runner should be looking at now. */
export function currentStopIndex(stops: Stop[]): number {
  const i = stops.findIndex((s) => !s.done);
  return i === -1 ? stops.length : i;
}
