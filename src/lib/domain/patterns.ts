// Abuse patterns. Pure decisions over incident lists; services feed them data.

export type IncidentLite = { counterpartyId: string | null; createdAt: Date };

/** 3+ different counterparties involved in incidents/claims within the window. */
export function counterpartyPattern(incidents: IncidentLite[], now: Date, windowDays: number, threshold: number) {
  const since = now.getTime() - windowDays * 86400000;
  const people = new Set(incidents.filter((i) => i.createdAt.getTime() >= since && i.counterpartyId).map((i) => i.counterpartyId));
  return { flagged: people.size >= threshold, count: people.size };
}

/** Runner marks "Customer not here" on more than X% of their last N+ finished orders. */
export function noShowRateFlag(lastFinished: { status: string }[], minOrders: number, maxPct: number) {
  if (lastFinished.length < minOrders) return { flagged: false, pct: 0 };
  const noShows = lastFinished.filter((o) => o.status === "customer_no_show").length;
  const pct = (noShows / lastFinished.length) * 100;
  return { flagged: pct > maxPct, pct };
}

/** Customer no-shows in the window: 2 = warning, 3+ = admin review before ordering again. */
export function noShowStrikeLevel(noShowsInWindow: number, warnAt: number, reviewAt: number): "ok" | "warning" | "review" {
  if (noShowsInWindow >= reviewAt) return "review";
  if (noShowsInWindow >= warnAt) return "warning";
  return "ok";
}
