// Food-for-PIN handoff rules. Pure functions: every time-based button and every
// "can the runner mark a no-show?" decision is made here so it can be unit-tested.
import { haversineMiles } from "./geo";

export type LocationResult = "in_range" | "out_of_range" | "denied" | "unavailable";

export const METERS_PER_MILE = 1609.344;

/** One-time location check against a building (or spot) radius. Coordinates are never stored. */
export function checkLocation(
  reading: { status: "ok"; lat: number; lng: number } | { status: "denied" | "unavailable" },
  target: { lat: number; lng: number },
  radiusM: number,
): { status: LocationResult; distanceM: number | null } {
  if (reading.status !== "ok") return { status: reading.status, distanceM: null };
  const distanceM = Math.round(haversineMiles(reading, target) * METERS_PER_MILE);
  return { status: distanceM <= radiusM ? "in_range" : "out_of_range", distanceM };
}

export type HandoffState = {
  status: string;
  atDoorAt: Date | null;
  doorPhotoId: string | null;
  doorLocation: LocationResult | null;
  countdownEndsAt: Date | null;
  runnerCalls: number;
  customerPresentAt: Date | null;
  pinEnteredAt: Date | null;
};

export type NoShowCheck = { ok: true; needsReview: boolean } | { ok: false; reason: string };

/**
 * "Customer not here" is only allowed when the runner did everything right:
 * at the door with a live photo, called at least once, waited out the countdown,
 * and the customer never said they were at their door.
 */
export function canMarkNoShow(o: HandoffState, now: Date): NoShowCheck {
  if (o.pinEnteredAt || o.status === "delivered") return { ok: false, reason: "This order was already handed off." };
  if (o.status !== "on_the_way" && o.status !== "picked_up") return { ok: false, reason: "This order isn't out for delivery." };
  if (!o.atDoorAt || !o.doorPhotoId) return { ok: false, reason: "Tap \"At your door\" and take the door photo first." };
  if (!o.countdownEndsAt || now.getTime() < o.countdownEndsAt.getTime()) {
    return { ok: false, reason: "Wait for the countdown to finish. The customer still has time." };
  }
  if (o.runnerCalls < 1) return { ok: false, reason: "Call the customer at least once before marking them not here." };
  if (o.customerPresentAt) {
    return { ok: false, reason: "The customer says they're at their door. Find them and get the PIN." };
  }
  return { ok: true, needsReview: o.doorLocation !== "in_range" };
}

/** Customer's "I'm at my door and the runner isn't here": from door photo until countdown end + window. */
export function presentButtonVisible(o: Pick<HandoffState, "atDoorAt" | "countdownEndsAt" | "pinEnteredAt" | "customerPresentAt" | "status">, now: Date, windowAfterSeconds: number) {
  if (!o.atDoorAt || !o.countdownEndsAt || o.pinEnteredAt || o.customerPresentAt) return false;
  if (o.status !== "on_the_way" && o.status !== "picked_up") return false;
  return now.getTime() <= o.countdownEndsAt.getTime() + windowAfterSeconds * 1000;
}

/** After the customer says they're at the door, the runner has `grace` to show up with the bag. */
export function runnerAbsentCaseDue(o: Pick<HandoffState, "customerPresentAt" | "pinEnteredAt" | "status">, now: Date, graceSeconds: number) {
  if (!o.customerPresentAt || o.pinEnteredAt || o.status === "delivered") return false;
  return now.getTime() >= o.customerPresentAt.getTime() + graceSeconds * 1000;
}

/** "I gave my PIN but didn't get my food" is only available briefly after the PIN was entered. */
export function pinClaimAvailable(o: { pinEnteredAt: Date | null; status: string }, now: Date, windowSeconds: number) {
  if (!o.pinEnteredAt || o.status !== "delivered") return false;
  return now.getTime() <= o.pinEnteredAt.getTime() + windowSeconds * 1000;
}

/** Picked up but never reached the door: no "At your door" and no PIN after N minutes. */
export function missingDeliveryDue(
  o: { status: string; pickedUpAt: Date | null; atDoorAt: Date | null; pinEnteredAt: Date | null },
  now: Date,
  minutes: number,
) {
  if (!o.pickedUpAt || o.atDoorAt || o.pinEnteredAt) return false;
  if (o.status !== "picked_up" && o.status !== "on_the_way") return false;
  return now.getTime() >= o.pickedUpAt.getTime() + minutes * 60000;
}

export type ClaimReason = "never_received" | "stolen" | "wrong_items" | "other";

/** A PIN entry is proof of handoff: theft/never-received claims on PIN-completed orders are auto-rejected. */
export function autoRejectClaim(reason: ClaimReason, order: { status: string; pinEnteredAt: Date | null }) {
  return (reason === "never_received" || reason === "stolen") && order.status === "delivered" && !!order.pinEnteredAt;
}

/** Copy for the heads-up push, by handoff type. */
export function headsUpCopy(handoff: "door" | "lobby" | null) {
  return handoff === "lobby"
    ? { title: "Your runner is about 2 minutes away", body: "Come down to the lobby with your PIN." }
    : { title: "Your runner is about 2 minutes away", body: "Be at your door with your PIN." };
}
