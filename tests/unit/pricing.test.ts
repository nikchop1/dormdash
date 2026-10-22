import { describe, expect, it } from "vitest";
import {
  activeSurge,
  DEFAULT_PRICING,
  distanceAddon,
  estimateMinutes,
  floorAddon,
  formatCents,
  inSurgeWindow,
  isQuoteError,
  quoteDelivery,
  type SurgeWindow,
} from "@/lib/domain/pricing";
import { fromNyWallClock } from "@/lib/domain/time";

const S = DEFAULT_PRICING;

describe("distance add-on tiers", () => {
  it.each([
    [0, 0],
    [0.05, 0],
    [0.051, 50],
    [0.1, 50],
    [0.15, 100],
    [0.2, 100],
    [0.21, 150],
    [0.25, 150],
  ])("%s mi -> %s cents", (mi, cents) => expect(distanceAddon(mi, S)).toBe(cents));

  it("refuses anything past the max radius", () => {
    expect(distanceAddon(0.26, S)).toBeNull();
  });
});

describe("floor add-on tiers", () => {
  it.each([
    [1, 0],
    [5, 0],
    [6, 50],
    [10, 50],
    [11, 100],
    [16, 100],
    [40, 100],
  ])("floor %s -> %s cents", (floor, cents) => expect(floorAddon(floor, S)).toBe(cents));
});

describe("quoteDelivery", () => {
  it("adds base + distance + floor, platform takes 25% of the fee only", () => {
    const q = quoteDelivery({ distanceMiles: 0.15, floor: 14, tipCents: 200, surge: null, settings: S });
    if (isQuoteError(q)) throw new Error("unexpected");
    expect(q.baseFeeCents).toBe(100);
    expect(q.distanceFeeCents).toBe(100);
    expect(q.floorFeeCents).toBe(100);
    expect(q.deliveryFeeCents).toBe(300);
    expect(q.platformFeeCents).toBe(75);
    expect(q.runnerFeeCents).toBe(225);
    expect(q.tipCents).toBe(200);
    expect(q.totalCents).toBe(510); // + $0.10 delivery guarantee
    expect(q.runnerPayoutCents).toBe(425); // 100% of tip to the runner
  });

  it("applies surge to the delivery fee and never to the tip", () => {
    const q = quoteDelivery({ distanceMiles: 0.04, floor: 3, tipCents: 100, surge: { multiplier: 1.5, label: "Rush", source: "window" }, settings: S });
    if (isQuoteError(q)) throw new Error("unexpected");
    expect(q.deliveryFeeCents).toBe(150);
    expect(q.surgeFeeCents).toBe(50);
    expect(q.tipCents).toBe(100);
    expect(q.totalCents).toBe(260);
    expect(q.platformFeeCents).toBe(38); // round(150 * .25) = 37.5 -> 38
    expect(q.runnerFeeCents + q.platformFeeCents).toBe(q.deliveryFeeCents);
    expect(q.surgeLabel).toBe("Rush");
  });

  it("returns an error past the radius", () => {
    const q = quoteDelivery({ distanceMiles: 0.3, floor: 1, tipCents: 0, surge: null, settings: S });
    expect(isQuoteError(q)).toBe(true);
  });

  it("clamps negative tips to zero", () => {
    const q = quoteDelivery({ distanceMiles: 0.01, floor: 1, tipCents: -500, surge: null, settings: S });
    if (isQuoteError(q)) throw new Error("unexpected");
    expect(q.tipCents).toBe(0);
    expect(q.totalCents).toBe(110);
  });

  it("respects a configured platform fee", () => {
    const q = quoteDelivery({ distanceMiles: 0.01, floor: 1, tipCents: 0, surge: null, settings: { ...S, platformFeePct: 0.1 } });
    if (isQuoteError(q)) throw new Error("unexpected");
    expect(q.platformFeeCents).toBe(10);
  });
});

describe("surge windows (New York time)", () => {
  const weeknight: SurgeWindow = { label: "Weeknight rush", days: [0, 1, 2, 3, 4], startMinute: 21 * 60, endMinute: 60, multiplier: 1.5, active: true };
  // 2026-10-20 is a Tuesday.
  const ny = (d: number, h: number, m = 0) => fromNyWallClock(2026, 10, d, h, m);

  it("is on Tuesday 9pm through Wednesday 12:59am", () => {
    expect(inSurgeWindow(weeknight, ny(20, 21, 0))).toBe(true);
    expect(inSurgeWindow(weeknight, ny(20, 23, 59))).toBe(true);
    expect(inSurgeWindow(weeknight, ny(21, 0, 30))).toBe(true);
    expect(inSurgeWindow(weeknight, ny(21, 1, 0))).toBe(false);
    expect(inSurgeWindow(weeknight, ny(20, 20, 59))).toBe(false);
  });

  it("Friday night belongs to Thursday's window until 1am, then stops", () => {
    // 2026-10-23 is Friday. 12:30am Friday is Thursday night's window.
    expect(inSurgeWindow(weeknight, ny(23, 0, 30))).toBe(true);
    // 9pm Friday is not a weeknight.
    expect(inSurgeWindow(weeknight, ny(23, 21, 0))).toBe(false);
  });

  it("weather surge applies and the strongest multiplier wins", () => {
    const at = ny(20, 14, 0);
    expect(activeSurge(at, [weeknight], S)).toBeNull();
    const w = activeSurge(at, [weeknight], { ...S, weatherSurgeOn: true, weatherMultiplier: 1.25 });
    expect(w).toEqual({ multiplier: 1.25, label: "Bad weather", source: "weather" });
    const night = activeSurge(ny(20, 22), [weeknight], { ...S, weatherSurgeOn: true, weatherMultiplier: 1.25 });
    expect(night?.multiplier).toBe(1.5);
  });

  it("ignores paused windows", () => {
    expect(inSurgeWindow({ ...weeknight, active: false }, ny(20, 22))).toBe(false);
  });
});

describe("helpers", () => {
  it("formats cents", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(1050)).toBe("$10.50");
    expect(formatCents(-75)).toBe("−$0.75");
    expect(formatCents(50, { sign: true })).toBe("+$0.50");
  });
  it("estimates minutes with floors and batches", () => {
    const single = estimateMinutes(0.2, 14);
    expect(single).toBeGreaterThanOrEqual(8);
    expect(estimateMinutes(0.2, 14, 3)).toBeGreaterThan(single);
    expect(estimateMinutes(0.2, 16)).toBeGreaterThanOrEqual(estimateMinutes(0.2, 2));
  });
});
