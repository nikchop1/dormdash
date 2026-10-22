// New-runner order limits. Levels unlock bigger orders as runners prove themselves.
import type { LevelTier } from "./pricing";

export type RunnerLevel = {
  level: number;
  /** null = no cap (top level). */
  maxFoodCents: number | null;
  /** Deliveries counted toward levels (completed minus any demotion offset). */
  progress: number;
  /** Deliveries needed for the next level, null at the top. */
  nextAt: number | null;
  remaining: number | null;
};

const sorted = (tiers: LevelTier[]) => [...tiers].sort((a, b) => a.minDeliveries - b.minDeliveries);

export function runnerLevel(completedDeliveries: number, levelOffset: number, tiers: LevelTier[]): RunnerLevel {
  const t = sorted(tiers);
  const progress = Math.max(0, completedDeliveries - levelOffset);
  let i = 0;
  for (let k = 0; k < t.length; k++) if (progress >= t[k].minDeliveries) i = k;
  const next = t[i + 1];
  return {
    level: i + 1,
    maxFoodCents: t[i].maxFoodCents,
    progress,
    nextAt: next ? next.minDeliveries : null,
    remaining: next ? next.minDeliveries - progress : null,
  };
}

/** An upheld case drops the runner back one level: the new offset puts them at the start of the previous level. */
export function demotedOffset(completedDeliveries: number, levelOffset: number, tiers: LevelTier[]): number {
  const t = sorted(tiers);
  const now = runnerLevel(completedDeliveries, levelOffset, tiers);
  const target = t[Math.max(0, now.level - 2)];
  return Math.max(levelOffset, completedDeliveries - target.minDeliveries);
}

/** Can this runner take an order with this food value? */
export function withinLimit(foodValueCents: number, lvl: RunnerLevel) {
  return lvl.maxFoodCents === null || foodValueCents <= lvl.maxFoodCents;
}

/** Total active food value can't exceed 2x the per-order limit (no cap at the top level). */
export function activeFoodCap(lvl: RunnerLevel): number | null {
  return lvl.maxFoodCents === null ? null : lvl.maxFoodCents * 2;
}

export function unlockCopy(lvl: RunnerLevel, foodValueCents: number, tiers: LevelTier[]): string | null {
  if (withinLimit(foodValueCents, lvl)) return null;
  const t = sorted(tiers);
  const unlock = t.find((x) => x.maxFoodCents === null || foodValueCents <= x.maxFoodCents);
  if (!unlock) return null;
  const more = Math.max(1, unlock.minDeliveries - lvl.progress);
  return `Unlocks after ${more} more ${more === 1 ? "delivery" : "deliveries"}`;
}
