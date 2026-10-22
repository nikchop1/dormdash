import { describe, expect, it } from "vitest";
import {
  autoRejectClaim,
  canMarkNoShow,
  checkLocation,
  headsUpCopy,
  missingDeliveryDue,
  pinClaimAvailable,
  presentButtonVisible,
  runnerAbsentCaseDue,
  type HandoffState,
} from "@/lib/domain/handoff";
import { activeFoodCap, demotedOffset, runnerLevel, unlockCopy, withinLimit } from "@/lib/domain/levels";
import { currentStopIndex, headingHomeFilter, runLabel, runStops, suggestRuns, type RunJob } from "@/lib/domain/runs";
import { fundSplit, lostOrderRefund } from "@/lib/domain/refunds";
import { counterpartyPattern, noShowRateFlag, noShowStrikeLevel } from "@/lib/domain/patterns";
import { applyCredit, bagAddon, DEFAULT_PRICING as S, isQuoteError, quoteDelivery, sizeAddon } from "@/lib/domain/pricing";
import { runnerApplicationSchema } from "@/lib/validation";

const t0 = new Date("2026-10-22T22:00:00Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);

const door: HandoffState = {
  status: "on_the_way",
  atDoorAt: t0,
  doorPhotoId: "photo",
  doorLocation: "in_range",
  countdownEndsAt: at(180),
  runnerCalls: 1,
  customerPresentAt: null,
  pinEnteredAt: null,
};

describe("location check (one-time, no coordinates stored)", () => {
  const tower = { lat: 40.7339, lng: -73.9962 };
  it("in range inside the building radius, out of range beyond it", () => {
    expect(checkLocation({ status: "ok", lat: 40.7339, lng: -73.9963 }, tower, 75).status).toBe("in_range");
    const far = checkLocation({ status: "ok", lat: 40.7287, lng: -73.9967 }, tower, 75);
    expect(far.status).toBe("out_of_range");
    expect(far.distanceM).toBeGreaterThan(500);
  });
  it("denied or unavailable passes through with no distance", () => {
    expect(checkLocation({ status: "denied" }, tower, 75)).toEqual({ status: "denied", distanceM: null });
    expect(checkLocation({ status: "unavailable" }, tower, 75)).toEqual({ status: "unavailable", distanceM: null });
  });
});

describe("customer not here", () => {
  it("blocked until the countdown ends", () => {
    expect(canMarkNoShow(door, at(179)).ok).toBe(false);
    expect(canMarkNoShow(door, at(180))).toEqual({ ok: true, needsReview: false });
  });
  it("needs the door photo and at least one call", () => {
    expect(canMarkNoShow({ ...door, doorPhotoId: null }, at(200)).ok).toBe(false);
    const r = canMarkNoShow({ ...door, runnerCalls: 0 }, at(200));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Call the customer/);
  });
  it("blocked once the customer says they're at the door, or after the PIN", () => {
    expect(canMarkNoShow({ ...door, customerPresentAt: at(100) }, at(200)).ok).toBe(false);
    expect(canMarkNoShow({ ...door, pinEnteredAt: at(60) }, at(200)).ok).toBe(false);
    expect(canMarkNoShow({ ...door, status: "claimed" }, at(200)).ok).toBe(false);
  });
  it("an unverified location still allows it but holds the payout for review", () => {
    for (const loc of ["out_of_range", "denied", "unavailable"] as const) {
      expect(canMarkNoShow({ ...door, doorLocation: loc }, at(200))).toEqual({ ok: true, needsReview: true });
    }
  });
});

describe("time-based buttons", () => {
  it("'I'm at my door' shows from the door photo until 5 minutes after the countdown", () => {
    expect(presentButtonVisible(door, at(10), 300)).toBe(true);
    expect(presentButtonVisible(door, at(480), 300)).toBe(true);
    expect(presentButtonVisible(door, at(481), 300)).toBe(false);
    expect(presentButtonVisible({ ...door, atDoorAt: null }, at(10), 300)).toBe(false);
    expect(presentButtonVisible({ ...door, customerPresentAt: at(5) }, at(10), 300)).toBe(false);
  });
  it("runner-absent case opens after the grace period without a PIN", () => {
    const o = { customerPresentAt: t0, pinEnteredAt: null, status: "on_the_way" };
    expect(runnerAbsentCaseDue(o, at(179), 180)).toBe(false);
    expect(runnerAbsentCaseDue(o, at(180), 180)).toBe(true);
    expect(runnerAbsentCaseDue({ ...o, pinEnteredAt: at(100) }, at(400), 180)).toBe(false);
  });
  it("'gave my PIN, no food' only within 5 minutes of the PIN", () => {
    const o = { pinEnteredAt: t0, status: "delivered" };
    expect(pinClaimAvailable(o, at(300), 300)).toBe(true);
    expect(pinClaimAvailable(o, at(301), 300)).toBe(false);
    expect(pinClaimAvailable({ pinEnteredAt: null, status: "on_the_way" }, at(1), 300)).toBe(false);
  });
  it("missing delivery: picked up, never at the door, after N minutes", () => {
    const o = { status: "on_the_way", pickedUpAt: t0, atDoorAt: null, pinEnteredAt: null };
    expect(missingDeliveryDue(o, at(44 * 60), 45)).toBe(false);
    expect(missingDeliveryDue(o, at(45 * 60), 45)).toBe(true);
    expect(missingDeliveryDue({ ...o, atDoorAt: at(60) }, at(50 * 60), 45)).toBe(false);
  });
});

describe("claims on PIN-completed orders", () => {
  it("theft and never-received are auto-rejected once a PIN was entered", () => {
    const delivered = { status: "delivered", pinEnteredAt: t0 };
    expect(autoRejectClaim("stolen", delivered)).toBe(true);
    expect(autoRejectClaim("never_received", delivered)).toBe(true);
    expect(autoRejectClaim("wrong_items", delivered)).toBe(false);
    expect(autoRejectClaim("stolen", { status: "on_the_way", pinEnteredAt: null })).toBe(false);
  });
  it("heads-up copy matches the handoff", () => {
    expect(headsUpCopy("lobby").body).toMatch(/lobby/);
    expect(headsUpCopy("door").body).toMatch(/door with your PIN/);
  });
});

describe("runner levels", () => {
  const tiers = S.levelTiers;
  it("unlocks bigger orders with deliveries", () => {
    expect(runnerLevel(0, 0, tiers)).toMatchObject({ level: 1, maxFoodCents: 2000, nextAt: 10, remaining: 10 });
    expect(runnerLevel(10, 0, tiers)).toMatchObject({ level: 2, maxFoodCents: 4000 });
    expect(runnerLevel(30, 0, tiers)).toMatchObject({ level: 3, maxFoodCents: null, nextAt: null });
  });
  it("per-order limit and 2x active cap", () => {
    const l1 = runnerLevel(3, 0, tiers);
    expect(withinLimit(2000, l1)).toBe(true);
    expect(withinLimit(2001, l1)).toBe(false);
    expect(activeFoodCap(l1)).toBe(4000);
    expect(activeFoodCap(runnerLevel(40, 0, tiers))).toBeNull();
    expect(unlockCopy(l1, 2500, tiers)).toBe("Unlocks after 7 more deliveries");
  });
  it("an upheld case drops the runner back one level", () => {
    const off = demotedOffset(35, 0, tiers);
    expect(runnerLevel(35, off, tiers).level).toBe(2);
    const off2 = demotedOffset(35, off, tiers);
    expect(runnerLevel(35, off2, tiers).level).toBe(1);
    expect(demotedOffset(5, 0, tiers)).toBe(5); // already level 1: back to the start of it
  });
});

describe("runs", () => {
  const job = (id: string, spotId: string, floor: number, foodValueCents = 1000, buildingId = "tower"): RunJob => ({
    id, spotId, spotName: spotId, spotLat: 40.7323, spotLng: -73.9967, buildingId, floor, payCents: 300, foodValueCents, createdAt: t0,
  });
  it("one suggested run per building, grouped by spot then floor, within capacity", () => {
    const runs = suggestRuns([job("a", "deli", 12), job("b", "deli", 3), job("c", "cafe", 7), job("d", "deli", 9, 1000, "mercer")], { capacity: 4, foodCapCents: null, activeFoodCents: 0 });
    expect(runs).toHaveLength(2);
    expect(runs[0].jobs.map((j) => j.id)).toEqual(["b", "a", "c"]);
    expect(runs[0].label).toBe("3 orders · 2 pickups · $9.00");
  });
  it("respects the food-value cap", () => {
    const runs = suggestRuns([job("a", "deli", 3, 1800), job("b", "deli", 4, 1800), job("c", "deli", 5, 1800)], { capacity: 4, foodCapCents: 4000, activeFoodCents: 0 });
    expect(runs[0].jobs.map((j) => j.id)).toEqual(["a", "b"]);
  });
  it("heading home keeps nearby pickups going to that building", () => {
    const far = { ...job("far", "x", 3), spotLat: 40.75 };
    expect(headingHomeFilter([job("a", "deli", 3), far, job("m", "deli", 3, 1000, "mercer")], { lat: 40.7323, lng: -73.9967 }, "tower", 0.15).map((j) => j.id)).toEqual(["a"]);
  });
  it("stops: pickups first, then deliveries by floor (elevator order)", () => {
    const stops = runStops([
      { id: "1", status: "picked_up", spotId: "deli", spotName: "Deli", floor: 12, room: "1204" },
      { id: "2", status: "claimed", spotId: "cafe", spotName: "Cafe", floor: 3, room: "301" },
      { id: "3", status: "delivered", spotId: "deli", spotName: "Deli", floor: 7, room: "702" },
    ]);
    expect(stops.map((s) => (s.kind === "pickup" ? `P:${s.spotName}` : `D:${s.order.floor}`))).toEqual(["P:Deli", "P:Cafe", "D:3", "D:7", "D:12"]);
    expect(currentStopIndex(stops)).toBe(1);
    expect(runLabel([{ spotId: "a", payCents: 100 }])).toBe("1 order · 1 pickup · $1.00");
  });
});

describe("pricing: size, bags, guarantee, credit", () => {
  it("size tiers by food total and bag fees after the first bag", () => {
    expect(sizeAddon(1500, S)).toBe(0);
    expect(sizeAddon(1501, S)).toBe(50);
    expect(sizeAddon(9999, S)).toBe(150);
    expect(bagAddon(1, S)).toBe(0);
    expect(bagAddon(3, S)).toBe(100);
    expect(bagAddon(9, S)).toBe(150); // capped at max bags
  });
  it("bag fee is added after surge; guarantee is never surged", () => {
    const q = quoteDelivery({ distanceMiles: 0.04, floor: 3, tipCents: 0, surge: { multiplier: 2, label: "x", source: "window" }, settings: S, bags: 2 });
    if (isQuoteError(q)) throw new Error("unexpected");
    expect(q.deliveryFeeCents).toBe(250); // 100 * 2 + 50
    expect(q.guaranteeCents).toBe(10);
  });
  it("lobby handoff drops the floor add-on", () => {
    const q = quoteDelivery({ distanceMiles: 0.04, floor: 14, tipCents: 0, surge: null, settings: S, lobby: true });
    if (isQuoteError(q)) throw new Error("unexpected");
    expect(q.floorFeeCents).toBe(0);
  });
  it("credit pays fees and tips only, never the guarantee", () => {
    expect(applyCredit({ feesAndTipsCents: 500, balanceCents: 9999, useCredit: true })).toBe(500);
    expect(applyCredit({ feesAndTipsCents: 500, balanceCents: 200, useCredit: true })).toBe(200);
    expect(applyCredit({ feesAndTipsCents: 500, balanceCents: 200, useCredit: false })).toBe(0);
    const q = quoteDelivery({ distanceMiles: 0.04, floor: 3, tipCents: 100, surge: null, settings: S, creditBalanceCents: 5000 });
    if (isQuoteError(q)) throw new Error("unexpected");
    expect(q.chargeCents).toBe(10);
  });
});

describe("lost-order refunds and the Guarantee Fund", () => {
  it("fees + tip + guarantee back to the card, food value as credit", () => {
    expect(lostOrderRefund({ deliveryFeeCents: 300, tipCents: 200, guaranteeCents: 10, foodValueCents: 1800, chargedCents: 510, creditAppliedCents: 0, refundedCents: 0 })).toEqual({
      cashCents: 510,
      creditCents: 1800,
      foodCreditCents: 1800,
    });
  });
  it("money paid with credit comes back as credit; already-refunded cash isn't refunded twice", () => {
    expect(lostOrderRefund({ deliveryFeeCents: 300, tipCents: 200, guaranteeCents: 10, foodValueCents: 1000, chargedCents: 110, creditAppliedCents: 400, refundedCents: 0 })).toEqual({
      cashCents: 110,
      creditCents: 1400,
      foodCreditCents: 1000,
    });
    expect(lostOrderRefund({ deliveryFeeCents: 200, tipCents: 0, guaranteeCents: 10, foodValueCents: 0, chargedCents: 310, creditAppliedCents: 0, refundedCents: 100 }).cashCents).toBe(210);
  });
  it("fund pays first; platform covers any shortfall", () => {
    expect(fundSplit(500, 1000)).toEqual({ fromFund: 500, shortfall: 0 });
    expect(fundSplit(500, 120)).toEqual({ fromFund: 120, shortfall: 380 });
    expect(fundSplit(500, -50)).toEqual({ fromFund: 0, shortfall: 500 });
  });
});

describe("abuse patterns", () => {
  const now = t0;
  const days = (d: number) => new Date(now.getTime() - d * 864e5);
  it("3+ different counterparties within the window flags the account", () => {
    const inc = [
      { counterpartyId: "a", createdAt: days(1) },
      { counterpartyId: "b", createdAt: days(10) },
      { counterpartyId: "b", createdAt: days(11) },
      { counterpartyId: "c", createdAt: days(90) },
    ];
    expect(counterpartyPattern(inc, now, 60, 3)).toEqual({ flagged: false, count: 2 });
    expect(counterpartyPattern([...inc, { counterpartyId: "d", createdAt: days(2) }], now, 60, 3).flagged).toBe(true);
  });
  it("runner no-show rate over the threshold flags only with enough orders", () => {
    const orders = (n: number, ns: number) => Array.from({ length: n }, (_, i) => ({ status: i < ns ? "customer_no_show" : "delivered" }));
    expect(noShowRateFlag(orders(9, 5), 10, 20).flagged).toBe(false);
    expect(noShowRateFlag(orders(10, 2), 10, 20).flagged).toBe(false);
    expect(noShowRateFlag(orders(10, 3), 10, 20).flagged).toBe(true);
  });
  it("customer no-shows: 2 warns, 3 requires review", () => {
    expect(noShowStrikeLevel(1, 2, 3)).toBe("ok");
    expect(noShowStrikeLevel(2, 2, 3)).toBe("warning");
    expect(noShowStrikeLevel(3, 2, 3)).toBe("review");
  });
});

describe("runner application", () => {
  it("requires an NYU ID number like N12345678", () => {
    const base = { legalName: "Maya Chen", homeBuildingId: "00000000-0000-4000-8000-000000000000", agree: true };
    expect(runnerApplicationSchema.safeParse({ ...base, nyuIdNumber: "N12345678" }).success).toBe(true);
    expect(runnerApplicationSchema.safeParse({ ...base, nyuIdNumber: "n12345678" }).success).toBe(true);
    expect(runnerApplicationSchema.safeParse({ ...base, nyuIdNumber: "12345678" }).success).toBe(false);
    expect(runnerApplicationSchema.safeParse({ ...base, nyuIdNumber: "N1234" }).success).toBe(false);
  });
});
