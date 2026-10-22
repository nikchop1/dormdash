// Strikes, suspension, batching, and shift coverage. Pure functions.

export type StrikeReason = "late" | "dispute" | "unclaim" | "manual";

/** A runner is auto-suspended once their active strikes reach the threshold. */
export function shouldSuspend(activeStrikes: number, threshold: number): boolean {
  return threshold > 0 && activeStrikes >= threshold;
}

/**
 * Unclaiming happens. Doing it repeatedly doesn't. `unclaimsThisWeek` includes the
 * unclaim being evaluated; the first `freePerWeek` are free, every one after is a strike.
 */
export function unclaimEarnsStrike(unclaimsThisWeek: number, freePerWeek: number): boolean {
  return unclaimsThisWeek > freePerWeek;
}

// ---------- batching ----------

export type Job = {
  id: string;
  spotId: string;
  spotLat: number;
  spotLng: number;
  buildingId: string;
  floor: number;
  createdAt: Date;
};

export type BatchSuggestion<J extends Job = Job> = { key: string; buildingId: string; jobs: J[] };

const NEARBY_SPOT_MILES = 0.06;

function close(a: Job, b: Job, haversine: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number) {
  return a.spotId === b.spotId || haversine({ lat: a.spotLat, lng: a.spotLng }, { lat: b.spotLat, lng: b.spotLng }) <= NEARBY_SPOT_MILES;
}

/**
 * Group open jobs a single runner could reasonably carry together: same destination
 * building, pickup spots that are the same or a block apart. Within a batch, jobs are
 * ordered by floor so the runner rides the elevator up once. Only groups of 2+ are
 * returned, capped at `maxSize`.
 */
export function suggestBatches<J extends Job>(
  jobs: J[],
  maxSize: number,
  haversine: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number,
): BatchSuggestion<J>[] {
  if (maxSize < 2) return [];
  const byBuilding = new Map<string, J[]>();
  for (const j of jobs) byBuilding.set(j.buildingId, [...(byBuilding.get(j.buildingId) ?? []), j]);

  const out: BatchSuggestion<J>[] = [];
  for (const [buildingId, list] of byBuilding) {
    const remaining = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    while (remaining.length > 1) {
      const anchor = remaining.shift()!;
      const group = [anchor];
      for (let i = 0; i < remaining.length && group.length < maxSize; ) {
        if (close(anchor, remaining[i], haversine)) group.push(remaining.splice(i, 1)[0]);
        else i++;
      }
      if (group.length > 1) {
        group.sort((a, b) => a.floor - b.floor);
        out.push({ key: group.map((g) => g.id).sort().join("+"), buildingId, jobs: group });
      }
    }
  }
  return out.sort((a, b) => b.jobs.length - a.jobs.length);
}

// ---------- shift coverage ----------

export type Slot = { day: number; hour: number };

/** Count runners per weekly slot. Key = `${day}-${hour}`. */
export function coverageMap(shifts: { runnerId: string; day: number; hour: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of shifts) m.set(`${s.day}-${s.hour}`, (m.get(`${s.day}-${s.hour}`) ?? 0) + 1);
  return m;
}

export const THIN_COVERAGE = 2;

/**
 * Next window (from `from`, New York wall clock) where at least one runner is
 * scheduled. Returns the start day/hour and how many consecutive hours it lasts.
 */
export function nextCoveredWindow(
  coverage: Map<string, number>,
  from: { weekday: number; hour: number },
): { day: number; startHour: number; hours: number; daysAhead: number } | null {
  for (let i = 0; i < 7 * 24; i++) {
    const absHour = from.hour + i;
    const day = (from.weekday + Math.floor(absHour / 24)) % 7;
    const hour = absHour % 24;
    if ((coverage.get(`${day}-${hour}`) ?? 0) > 0) {
      let hours = 1;
      while (hours < 24) {
        const h2 = absHour + hours;
        if ((coverage.get(`${(from.weekday + Math.floor(h2 / 24)) % 7}-${h2 % 24}`) ?? 0) === 0) break;
        hours++;
      }
      return { day, startHour: hour, hours, daysAhead: Math.floor(absHour / 24) };
    }
  }
  return null;
}
