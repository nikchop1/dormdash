import { nyParts } from "./time";

export type DistanceTier = { maxMiles: number; addCents: number };
export type FloorTier = { maxFloor: number | null; addCents: number };
export type SizeTier = { maxCents: number | null; addCents: number };
export type LevelTier = { minDeliveries: number; maxFoodCents: number | null };

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
  sizeTiers: SizeTier[];
  bagFeeCents: number;
  maxBags: number;
  guaranteeCents: number;
  doorCountdownSeconds: number;
  runnerAbsentGraceSeconds: number;
  presentWindowAfterSeconds: number;
  pinClaimWindowSeconds: number;
  missingDeliveryMinutes: number;
  headingHomeRadiusMiles: number;
  levelTiers: LevelTier[];
  noShowWarnCount: number;
  noShowReviewCount: number;
  noShowWindowDays: number;
  patternWindowDays: number;
  patternCounterparties: number;
  noShowRatePct: number;
  noShowRateMinOrders: number;
  freeProblemReportsPer30d: number;
  caseResponseHours: number;
  refundTargetHours: number;
  appealDays: number;
  evidenceRetentionDays: number;
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
  sizeTiers: [
    { maxCents: 1500, addCents: 0 },
    { maxCents: 3000, addCents: 50 },
    { maxCents: 5000, addCents: 100 },
    { maxCents: null, addCents: 150 },
  ],
  bagFeeCents: 50,
  maxBags: 4,
  guaranteeCents: 10,
  doorCountdownSeconds: 180,
  runnerAbsentGraceSeconds: 180,
  presentWindowAfterSeconds: 300,
  pinClaimWindowSeconds: 300,
  missingDeliveryMinutes: 45,
  headingHomeRadiusMiles: 0.15,
  levelTiers: [
    { minDeliveries: 0, maxFoodCents: 2000 },
    { minDeliveries: 10, maxFoodCents: 4000 },
    { minDeliveries: 30, maxFoodCents: null },
  ],
  noShowWarnCount: 2,
  noShowReviewCount: 3,
  noShowWindowDays: 30,
  patternWindowDays: 60,
  patternCounterparties: 3,
  noShowRatePct: 20,
  noShowRateMinOrders: 10,
  freeProblemReportsPer30d: 1,
  caseResponseHours: 24,
  refundTargetHours: 24,
  appealDays: 7,
  evidenceRetentionDays: 90,
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

/** Order-size add-on from the food total the customer entered. */
export function sizeAddon(foodValueCents: number, s: PricingSettings): number {
  const tiers = [...s.sizeTiers].sort((a, b) => (a.maxCents ?? Infinity) - (b.maxCents ?? Infinity));
  for (const t of tiers) if (t.maxCents === null || foodValueCents <= t.maxCents) return t.addCents;
  return tiers.at(-1)?.addCents ?? 0;
}

/** +bagFee per bag after the first. */
export function bagAddon(bags: number, s: PricingSettings): number {
  const n = Math.min(Math.max(1, Math.floor(bags)), s.maxBags);
  return (n - 1) * s.bagFeeCents;
}

export type Quote = {
  distanceMiles: number;
  baseFeeCents: number;
  distanceFeeCents: number;
  /** 0 for lobby handoffs. */
  floorFeeCents: number;
  sizeFeeCents: number;
  bagFeeCents: number;
  surgeMultiplier: number;
  surgeLabel: string | null;
  surgeFeeCents: number;
  /** (base + distance + floor + size) x surge, then + bags. */
  deliveryFeeCents: number;
  tipCents: number;
  /** Delivery guarantee: separate line, never surged, goes to the Guarantee Fund. */
  guaranteeCents: number;
  /** Everything the order costs before credits. */
  totalCents: number;
  /** Dormdash credit applied (fees and tips only). Funded by the platform. */
  creditAppliedCents: number;
  /** What actually gets charged to the card. */
  chargeCents: number;
  platformFeeCents: number;
  /** Runner's share of the delivery fee (excludes tip). Credits never reduce it. */
  runnerFeeCents: number;
  /** Everything the runner earns on a completed delivery: fee share + 100% of tip. */
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
  foodValueCents?: number;
  bags?: number;
  /** Lobby handoff: no floor add-on. */
  lobby?: boolean;
  /** Credit balance available and whether the customer wants it applied. */
  creditBalanceCents?: number;
  useCredit?: boolean;
}): Quote | QuoteError {
  const { distanceMiles, floor, settings: s } = input;
  const dist = distanceAddon(distanceMiles, s);
  if (dist === null) return { error: "out_of_range", maxRadiusMiles: s.maxRadiusMiles };
  const floorFee = input.lobby ? 0 : floorAddon(Math.max(1, Math.floor(floor)), s);
  const sizeFee = sizeAddon(Math.max(0, input.foodValueCents ?? 0), s);
  const bagFee = bagAddon(input.bags ?? 1, s);
  const subtotal = s.baseFeeCents + dist + floorFee + sizeFee;
  const multiplier = input.surge && input.surge.multiplier > 1 ? input.surge.multiplier : 1;
  const surged = Math.round(subtotal * multiplier);
  const deliveryFee = surged + bagFee;
  const tip = Math.max(0, Math.round(input.tipCents));
  const guarantee = s.guaranteeCents;
  const total = deliveryFee + tip + guarantee;
  const credit = applyCredit({ feesAndTipsCents: deliveryFee + tip, balanceCents: input.creditBalanceCents ?? 0, useCredit: input.useCredit ?? true });
  const platformFee = Math.round(deliveryFee * s.platformFeePct);
  const runnerFee = deliveryFee - platformFee;
  return {
    distanceMiles,
    baseFeeCents: s.baseFeeCents,
    distanceFeeCents: dist,
    floorFeeCents: floorFee,
    sizeFeeCents: sizeFee,
    bagFeeCents: bagFee,
    surgeMultiplier: multiplier,
    surgeLabel: multiplier > 1 ? input.surge!.label : null,
    surgeFeeCents: surged - subtotal,
    deliveryFeeCents: deliveryFee,
    tipCents: tip,
    guaranteeCents: guarantee,
    totalCents: total,
    creditAppliedCents: credit,
    chargeCents: total - credit,
    platformFeeCents: platformFee,
    runnerFeeCents: runnerFee,
    runnerPayoutCents: runnerFee + tip,
  };
}

/** Credits pay for delivery fees and tips only (never the guarantee), up to the balance. */
export function applyCredit(i: { feesAndTipsCents: number; balanceCents: number; useCredit: boolean }): number {
  if (!i.useCredit) return 0;
  return Math.max(0, Math.min(i.balanceCents, i.feesAndTipsCents));
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
