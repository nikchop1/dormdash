import { describe, expect, it } from "vitest";
import {
  canTransition,
  cancellationTerms,
  evaluateLateness,
  generateOrderCode,
  generatePin,
  handoffFor,
  transition,
  TransitionError,
  unclaimedActions,
} from "@/lib/domain/orders";
import { DEFAULT_PRICING as S } from "@/lib/domain/pricing";

const min = (n: number) => n * 60000;

describe("order state machine", () => {
  it("walks the happy path", () => {
    let s = transition("pending_payment", "payment_succeeded", "system");
    expect(s).toBe("requested");
    s = transition(s, "claim", "runner");
    expect(s).toBe("claimed");
    s = transition(s, "pickup", "runner");
    expect(s).toBe("picked_up");
    s = transition(s, "depart", "runner");
    expect(s).toBe("on_the_way");
    s = transition(s, "deliver", "runner");
    expect(s).toBe("delivered");
  });

  it("allows delivering straight from picked up", () => {
    expect(transition("picked_up", "deliver", "runner")).toBe("delivered");
  });

  it("unclaim sends a claimed order back to the board", () => {
    expect(transition("claimed", "unclaim", "runner")).toBe("requested");
  });

  it.each([
    ["requested", "pickup", "runner"],
    ["requested", "deliver", "runner"],
    ["claimed", "deliver", "runner"],
    ["picked_up", "unclaim", "runner"],
    ["delivered", "cancel", "admin"],
    ["cancelled", "claim", "runner"],
    ["requested", "claim", "customer"],
    ["picked_up", "cancel", "customer"],
    ["pending_payment", "claim", "runner"],
  ] as const)("rejects %s --%s--> as %s", (from, action, actor) => {
    expect(canTransition(from, action, actor)).toBe(false);
    expect(() => transition(from, action, actor)).toThrow(TransitionError);
  });

  it("only admins can cancel after pickup", () => {
    expect(canTransition("picked_up", "cancel", "admin")).toBe(true);
    expect(canTransition("on_the_way", "cancel", "customer")).toBe(false);
  });
});

describe("cancellation terms", () => {
  const base = { totalCents: 400, refundedCents: 0, createdAt: new Date(0) };

  it("is free before a runner claims it", () => {
    const t = cancellationTerms({ ...base, status: "requested" }, "customer", new Date(min(5)), S);
    expect(t).toEqual({ allowed: true, kind: "free", refundCents: 400, runnerFeeCents: 0 });
  });

  it("flags the 20-minute unclaimed full-refund case", () => {
    const t = cancellationTerms({ ...base, status: "requested" }, "customer", new Date(min(21)), S);
    expect(t.allowed && t.kind).toBe("unclaimed_timeout");
    expect(t.allowed && t.refundCents).toBe(400);
  });

  it("charges the runner fee after claim, before pickup", () => {
    const t = cancellationTerms({ ...base, status: "claimed" }, "customer", new Date(min(8)), S);
    expect(t).toEqual({ allowed: true, kind: "claimed_fee", refundCents: 350, runnerFeeCents: 50 });
  });

  it("uses the configured cancel fee", () => {
    const t = cancellationTerms({ ...base, status: "claimed" }, "customer", new Date(), { ...S, cancelFeeCents: 100 });
    expect(t.allowed && t.runnerFeeCents).toBe(100);
  });

  it("blocks customers after pickup with a helpful reason", () => {
    const t = cancellationTerms({ ...base, status: "picked_up" }, "customer", new Date(), S);
    expect(t.allowed).toBe(false);
    expect(!t.allowed && t.reason).toMatch(/already has the food/);
  });

  it("never refunds more than what's left", () => {
    const t = cancellationTerms({ ...base, status: "requested", refundedCents: 300 }, "customer", new Date(), S);
    expect(t.allowed && t.refundCents).toBe(100);
  });

  it("admins can cancel any active order for a full refund", () => {
    const t = cancellationTerms({ ...base, status: "on_the_way" }, "admin", new Date(), S);
    expect(t).toEqual({ allowed: true, kind: "admin", refundCents: 400, runnerFeeCents: 0 });
  });
});

describe("late-delivery refunds", () => {
  const eta = new Date(min(30));
  it("is on time within the grace period", () => {
    const r = evaluateLateness({ eta, deliveredAt: new Date(min(30 + 15)), deliveryFeeCents: 300, lateRefundedAt: null }, new Date(), S);
    expect(r).toEqual({ late: false, minutesLate: 15, refundCents: 0 });
  });
  it("refunds the delivery fee (not the tip) past ETA + 15 min", () => {
    const r = evaluateLateness({ eta, deliveredAt: new Date(min(30 + 16)), deliveryFeeCents: 300, lateRefundedAt: null }, new Date(), S);
    expect(r).toEqual({ late: true, minutesLate: 16, refundCents: 300 });
  });
  it("doesn't refund twice", () => {
    const r = evaluateLateness({ eta, deliveredAt: new Date(min(60)), deliveryFeeCents: 300, lateRefundedAt: new Date() }, new Date(), S);
    expect(r.late).toBe(true);
    expect(r.refundCents).toBe(0);
  });
  it("evaluates undelivered orders against now (cron)", () => {
    const r = evaluateLateness({ eta, deliveredAt: null, deliveryFeeCents: 250, lateRefundedAt: null }, new Date(min(50)), S);
    expect(r.refundCents).toBe(250);
  });
  it("uses the configured grace period", () => {
    const r = evaluateLateness({ eta, deliveredAt: new Date(min(36)), deliveryFeeCents: 300, lateRefundedAt: null }, new Date(), { ...S, lateGraceMinutes: 5 });
    expect(r.late).toBe(true);
  });
});

describe("unclaimed order timers", () => {
  const o = { status: "requested" as const, createdAt: new Date(0), runnerPingedAt: null, cancelPromptedAt: null, scheduledFor: null };
  it("pings at 10 minutes and prompts cancel at 20", () => {
    expect(unclaimedActions(o, new Date(min(9)), S)).toEqual({ ping: false, promptCancel: false });
    expect(unclaimedActions(o, new Date(min(10)), S)).toEqual({ ping: true, promptCancel: false });
    expect(unclaimedActions(o, new Date(min(20)), S)).toEqual({ ping: true, promptCancel: true });
  });
  it("doesn't repeat", () => {
    expect(unclaimedActions({ ...o, runnerPingedAt: new Date(), cancelPromptedAt: new Date() }, new Date(min(30)), S)).toEqual({ ping: false, promptCancel: false });
  });
  it("starts the clock 30 min before a scheduled time", () => {
    const sched = { ...o, scheduledFor: new Date(min(120)) };
    expect(unclaimedActions(sched, new Date(min(95)), S).ping).toBe(false);
    expect(unclaimedActions(sched, new Date(min(100)), S).ping).toBe(true);
  });
  it("ignores orders that aren't on the board", () => {
    expect(unclaimedActions({ ...o, status: "claimed" }, new Date(min(60)), S)).toEqual({ ping: false, promptCancel: false });
  });
});

describe("handoff and codes", () => {
  it("lobby handoff when the runner isn't a resident", () => {
    expect(handoffFor({ id: "b1", doorRequiresResident: true }, "b2")).toBe("lobby");
    expect(handoffFor({ id: "b1", doorRequiresResident: true }, null)).toBe("lobby");
    expect(handoffFor({ id: "b1", doorRequiresResident: true }, "b1")).toBe("door");
    expect(handoffFor({ id: "b1", doorRequiresResident: false }, "b2")).toBe("door");
  });
  it("PINs are always 4 digits", () => {
    expect(generatePin(() => 0)).toBe("0000");
    expect(generatePin(() => 0.99999)).toBe("9999");
    for (let i = 0; i < 50; i++) expect(generatePin()).toMatch(/^\d{4}$/);
  });
  it("order codes avoid ambiguous characters", () => {
    for (let i = 0; i < 50; i++) expect(generateOrderCode()).toMatch(/^[2-9A-HJ-NP-Z]{5}$/);
  });
});
