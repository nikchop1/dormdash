import { nyParts } from "./time";

export type DistanceTier = { maxMiles: number; addCents: number };
export type FloorTier = { maxFloor: number | null; addCents: number };

export type PricingSettings = {
  baseFeeCents: number;
  distanceTiers: DistanceTier[];
  floorTiers: FloorTier[];
  maxRadiusMiles: number;
  weatherSurgeOn: boolean;
  weatherMultiplier: number;
  platformFeePct: number;
  cancelFeeCents: number;
  lateGraceMinutes: number;
  unclaimedPingMinutes: number;
  unclaimedCancelMinutes: number;
  strikeThreshold: number;
  maxActiveOrders: number;
  freeUnclaimsPerWeek: number;
  tipPresets: number[];
  payoutHoldHours: number;
  minPayoutCents: number;
};

export const DEFAULT_PRICING: PricingSettings = {
  baseFeeCents: 100,
  distanceTiers: [
    { maxMiles: 0.05, addCents: 0 },
    { maxMiles: 0.1, addCents: 50 },
    { maxMiles: 0.2, addCents: 100 },
    { maxMiles: 0.25, addCents: 150 },
  ],
  floorTiers: [
    { maxFloor: 5, addCents: 0 },
    { maxFloor: 10, addCents: 50 },
    { maxFloor: null, addCents: 100 },
  ],
  maxRadiusMiles: 0.25,
  weatherSurgeOn: false,
  weatherMultiplier: 1.5,
  platformFeePct: 0.25,
  cancelFeeCents: 50,
  lateGraceMinutes: 15,
  unclaimedPingMinutes: 10,
  unclaimedCancelMinutes: 20,
  strikeThreshold: 3,
  maxActiveOrders: 4,
  freeUnclaimsPerWeek: 1,
  tipPresets: [0, 50, 100, 200],
  payoutHoldHours: 24,
  minPayoutCents: 100,
};

export type SurgeWindow = {
  id?: string;
  label: string;
  days: number[]; // 0 = Sunday, New York time
  startMinute: number;
  endMinute: number; // < startMinute means the window crosses midnight
  multiplier: number;
  active: boolean;
};

export type ActiveSurge = { multiplier: number; label: string; source: "window" | "weather" };

/** Is `now` inside this window? Windows crossing midnight belong to the day they start. */
export function inSurgeWindow(w: SurgeWindow, now: Date): boolean {
  if (!w.active) return false;
  const p = nyParts(now);
  const m = p.minuteOfDay;
  if (w.endMinute > w.startMinute) {
    return w.days.includes(p.weekday) && m >= w.startMinute && m < w.endMinute;
  }
  // Crosses midnight: either late on a listed day, or early on the day after a listed day.
  const yesterday = (p.weekday + 6) % 7;
  return (w.days.includes(p.weekday) && m >= w.startMinute) || (w.days.includes(yesterday) && m < w.endMinute);
}

/** The strongest surge in effect right now, or null. */
export function activeSurge(now: Date, windows: SurgeWindow[], settings: PricingSettings): ActiveSurge | null {
  let best: ActiveSurge | null = null;
  for (const w of windows) {
    if (inSurgeWindow(w, now) && w.multiplier > 1 && (!best || w.multiplier > best.multiplier)) {
      best = { multiplier: w.multiplier, label: w.label, source: "window" };
    }
  }
  if (settings.weatherSurgeOn && settings.weatherMultiplier > 1 && (!best || settings.weatherMultiplier >= best.multiplier)) {
    best = { multiplier: settings.weatherMultiplier, label: "Bad weather", source: "weather" };
  }
  return best;
}

export function distanceAddon(miles: number, s: PricingSettings): number | null {
  if (miles > s.maxRadiusMiles + 1e-9) return null;
  const tiers = [...s.distanceTiers].sort((a, b) => a.maxMiles - b.maxMiles);
  for (const t of tiers) if (miles <= t.maxMiles + 1e-9) return t.addCents;
  return null;
}

export function floorAddon(floor: number, s: PricingSettings): number {
  const tiers = [...s.floorTiers].sort((a, b) => (a.maxFloor ?? Infinity) - (b.maxFloor ?? Infinity));
  for (const t of tiers) if (t.maxFloor === null || floor <= t.maxFloor) return t.addCents;
  return tiers.at(-1)?.addCents ?? 0;
}

export type Quote = {
  distanceMiles: number;
  baseFeeCents: number;
  distanceFeeCents: number;
  floorFeeCents: number;
  surgeMultiplier: number;
  surgeLabel: string | null;
  surgeFeeCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  totalCents: number;
  platformFeeCents: number;
  /** Runner's share of the delivery fee (excludes tip). */
  runnerFeeCents: number;
  /** Everything the runner earns on this order: fee share + 100% of tip. */
  runnerPayoutCents: number;
};

export type QuoteError = { error: "out_of_range"; maxRadiusMiles: number };

/**
 * The single source of truth for what an order costs. Always called server-side;
 * the client only ever displays what this returns.
 */
export function quoteDelivery(input: {
  distanceMiles: number;
  floor: number;
  tipCents: number;
  surge: ActiveSurge | null;
  settings: PricingSettings;
}): Quote | QuoteError {
  const { distanceMiles, floor, settings: s } = input;
  const dist = distanceAddon(distanceMiles, s);
  if (dist === null) return { error: "out_of_range", maxRadiusMiles: s.maxRadiusMiles };
  const floorFee = floorAddon(Math.max(1, Math.floor(floor)), s);
  const subtotal = s.baseFeeCents + dist + floorFee;
  const multiplier = input.surge && input.surge.multiplier > 1 ? input.surge.multiplier : 1;
  const deliveryFee = Math.round(subtotal * multiplier);
  const tip = Math.max(0, Math.round(input.tipCents));
  const platformFee = Math.round(deliveryFee * s.platformFeePct);
  const runnerFee = deliveryFee - platformFee;
  return {
    distanceMiles,
    baseFeeCents: s.baseFeeCents,
    distanceFeeCents: dist,
    floorFeeCents: floorFee,
    surgeMultiplier: multiplier,
    surgeLabel: multiplier > 1 ? input.surge!.label : null,
    surgeFeeCents: deliveryFee - subtotal,
    deliveryFeeCents: deliveryFee,
    tipCents: tip,
    totalCents: deliveryFee + tip,
    platformFeeCents: platformFee,
    runnerFeeCents: runnerFee,
    runnerPayoutCents: runnerFee + tip,
  };
}

export const isQuoteError = (q: Quote | QuoteError): q is QuoteError => "error" in q;

export function formatCents(cents: number, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  if (neg) return `−${s}`;
  return opts.sign ? `+${s}` : s;
}

/** Rough minutes from claim to door: walk to the spot, wait, walk back, ride up. */
export function estimateMinutes(distanceMiles: number, floor: number, batchSize = 1): number {
  const walk = (distanceMiles / 3) * 60 * 2;
  const pickupWait = 4;
  const elevator = 2 + Math.ceil(floor / 4);
  const batchExtra = (batchSize - 1) * 3;
  return Math.max(8, Math.ceil(walk + pickupWait + elevator + batchExtra + 3));
}
