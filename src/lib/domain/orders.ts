import type { PricingSettings } from "./pricing";

export type OrderStatus =
  | "pending_payment"
  | "requested"
  | "claimed"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export type OrderAction =
  | "payment_succeeded"
  | "payment_failed"
  | "claim"
  | "unclaim"
  | "pickup"
  | "depart"
  | "deliver"
  | "cancel";

export type Actor = "customer" | "runner" | "admin" | "system";

/** The customer-facing progression, in order. */
export const STATUS_STEPS: OrderStatus[] = ["requested", "claimed", "picked_up", "on_the_way", "delivered"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  requested: "Requested",
  claimed: "Claimed",
  picked_up: "Picked up",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ACTIVE_STATUSES: OrderStatus[] = ["requested", "claimed", "picked_up", "on_the_way"];
export const RUNNER_ACTIVE_STATUSES: OrderStatus[] = ["claimed", "picked_up", "on_the_way"];

const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderAction, { to: OrderStatus; actors: Actor[] }>>> = {
  pending_payment: {
    payment_succeeded: { to: "requested", actors: ["system"] },
    payment_failed: { to: "cancelled", actors: ["system"] },
    cancel: { to: "cancelled", actors: ["customer", "admin", "system"] },
  },
  requested: {
    claim: { to: "claimed", actors: ["runner"] },
    cancel: { to: "cancelled", actors: ["customer", "admin", "system"] },
  },
  claimed: {
    unclaim: { to: "requested", actors: ["runner", "admin"] },
    pickup: { to: "picked_up", actors: ["runner"] },
    cancel: { to: "cancelled", actors: ["customer", "admin"] },
  },
  picked_up: {
    depart: { to: "on_the_way", actors: ["runner"] },
    deliver: { to: "delivered", actors: ["runner"] },
    cancel: { to: "cancelled", actors: ["admin"] },
  },
  on_the_way: {
    deliver: { to: "delivered", actors: ["runner"] },
    cancel: { to: "cancelled", actors: ["admin"] },
  },
  delivered: {},
  cancelled: {},
};

export class TransitionError extends Error {
  constructor(public status: OrderStatus, public action: OrderAction, public actor: Actor) {
    super(`Can't ${action} an order that is ${STATUS_LABEL[status].toLowerCase()} (as ${actor}).`);
  }
}

/** Returns the next status, or throws if the move isn't allowed. */
export function transition(status: OrderStatus, action: OrderAction, actor: Actor): OrderStatus {
  const t = TRANSITIONS[status][action];
  if (!t || !t.actors.includes(actor)) throw new TransitionError(status, action, actor);
  return t.to;
}

export function canTransition(status: OrderStatus, action: OrderAction, actor: Actor): boolean {
  const t = TRANSITIONS[status][action];
  return !!t && t.actors.includes(actor);
}

export const isTerminal = (s: OrderStatus) => s === "delivered" || s === "cancelled";

// ---------- cancellations ----------

export type CancelTerms =
  | { allowed: false; reason: string }
  | {
      allowed: true;
      kind: "free" | "claimed_fee" | "unclaimed_timeout" | "admin";
      refundCents: number;
      runnerFeeCents: number;
    };

/**
 * What happens to the money if this order is cancelled now.
 * - Before claim: full refund (and after `unclaimedCancelMinutes` we actively offer it).
 * - After claim, before pickup: refund minus the runner's cancellation fee.
 * - After pickup: customers can't cancel. Food is already in hand; use Report a problem.
 */
export function cancellationTerms(
  order: { status: OrderStatus; totalCents: number; refundedCents: number; createdAt: Date },
  actor: Actor,
  now: Date,
  s: PricingSettings,
): CancelTerms {
  const remaining = order.totalCents - order.refundedCents;
  if (!canTransition(order.status, "cancel", actor)) {
    if (order.status === "picked_up" || order.status === "on_the_way") {
      return { allowed: false, reason: "Your runner already has the food. If something's wrong, report a problem after delivery." };
    }
    return { allowed: false, reason: `This order is already ${STATUS_LABEL[order.status].toLowerCase()}.` };
  }
  if (actor === "admin") return { allowed: true, kind: "admin", refundCents: remaining, runnerFeeCents: 0 };
  if (order.status === "pending_payment") return { allowed: true, kind: "free", refundCents: 0, runnerFeeCents: 0 };
  if (order.status === "requested") {
    const waited = (now.getTime() - order.createdAt.getTime()) / 60000;
    return {
      allowed: true,
      kind: waited >= s.unclaimedCancelMinutes ? "unclaimed_timeout" : "free",
      refundCents: remaining,
      runnerFeeCents: 0,
    };
  }
  // claimed
  const fee = Math.min(s.cancelFeeCents, remaining);
  return { allowed: true, kind: "claimed_fee", refundCents: remaining - fee, runnerFeeCents: fee };
}

// ---------- lateness ----------

export type Lateness = { late: boolean; minutesLate: number; refundCents: number };

/**
 * An order is "late" once it's more than `lateGraceMinutes` past its ETA. A late
 * order gets its delivery fee refunded automatically (never the tip).
 */
export function evaluateLateness(
  order: { eta: Date | null; deliveredAt: Date | null; deliveryFeeCents: number; lateRefundedAt: Date | null },
  now: Date,
  s: PricingSettings,
): Lateness {
  if (!order.eta) return { late: false, minutesLate: 0, refundCents: 0 };
  const at = order.deliveredAt ?? now;
  const minutesLate = (at.getTime() - order.eta.getTime()) / 60000;
  const late = minutesLate > s.lateGraceMinutes;
  return {
    late,
    minutesLate: Math.max(0, Math.floor(minutesLate)),
    refundCents: late && !order.lateRefundedAt ? order.deliveryFeeCents : 0,
  };
}

// ---------- unclaimed orders (cron) ----------

export function unclaimedActions(
  order: { status: OrderStatus; createdAt: Date; runnerPingedAt: Date | null; cancelPromptedAt: Date | null; scheduledFor: Date | null },
  now: Date,
  s: PricingSettings,
): { ping: boolean; promptCancel: boolean } {
  if (order.status !== "requested") return { ping: false, promptCancel: false };
  // Scheduled orders start the clock 30 minutes before their slot.
  const start = order.scheduledFor ? new Date(Math.max(order.createdAt.getTime(), order.scheduledFor.getTime() - 30 * 60000)) : order.createdAt;
  const waited = (now.getTime() - start.getTime()) / 60000;
  return {
    ping: waited >= s.unclaimedPingMinutes && !order.runnerPingedAt,
    promptCancel: waited >= s.unclaimedCancelMinutes && !order.cancelPromptedAt,
  };
}

// ---------- handoff ----------

/** Door delivery needs a resident runner when the building requires it. */
export function handoffFor(
  building: { id: string; doorRequiresResident: boolean },
  runnerHomeBuildingId: string | null,
): "door" | "lobby" {
  if (!building.doorRequiresResident) return "door";
  return runnerHomeBuildingId === building.id ? "door" : "lobby";
}

// ---------- PIN ----------

export const MAX_PIN_ATTEMPTS = 5;

export function generatePin(rand: () => number = Math.random): string {
  return String(Math.floor(rand() * 10000)).padStart(4, "0");
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function generateOrderCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}
