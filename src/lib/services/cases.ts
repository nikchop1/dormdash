import "server-only";
import { q, q1, tx, type Queryable } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { autoRejectClaim, missingDeliveryDue, pinClaimAvailable, type ClaimReason } from "@/lib/domain/handoff";
import { demotedOffset } from "@/lib/domain/levels";
import { formatCents } from "@/lib/domain/pricing";
import { getPricing } from "@/lib/settings";
import { notify, notifyAdmins } from "@/lib/notify";
import { sendEmail, templates } from "@/lib/email";
import { applyLostOrderRefund, issueCredit, ledger, refundOrder } from "./money";
import { payRunner } from "./payouts";
import { takePhoto } from "./photos";
import { recordIncident } from "./incidents";
import { completedDeliveries, lockOrder, logEvent, runAfter, type OrderRow } from "./orders";

export type CaseType = "missing_delivery" | "pin_no_food" | "runner_not_at_door" | "customer_claim" | "runner_problem";

export const CASE_LABEL: Record<CaseType, string> = {
  missing_delivery: "Food never arrived",
  pin_no_food: "PIN given, no food",
  runner_not_at_door: "Runner not at the door",
  customer_claim: "Problem report",
  runner_problem: "Runner reported a problem",
};

export const PRIORITY: Record<CaseType, number> = {
  pin_no_food: 1,
  missing_delivery: 2,
  runner_not_at_door: 2,
  customer_claim: 3,
  runner_problem: 3,
};

export const PROBLEM_REASONS = {
  restaurant_not_ready: "Restaurant not ready",
  wrong_order: "Wrong order",
  spilled_damaged: "Spilled or damaged",
  cant_enter_building: "Can't get into the building",
} as const;
export type ProblemReason = keyof typeof PROBLEM_REASONS;

export const CLAIM_REASONS: Record<ClaimReason, string> = {
  never_received: "Never received it",
  stolen: "It was stolen",
  wrong_items: "Wrong or missing items",
  other: "Something else",
};

export type CaseRow = {
  id: string;
  order_id: string;
  type: CaseType;
  priority: number;
  status: "open" | "under_review" | "resolved";
  customer_id: string;
  runner_id: string | null;
  opened_by: string | null;
  reason: string;
  description: string;
  auto_rejected: boolean;
  runner_response: string | null;
  runner_responded_at: Date | null;
  response_due_at: Date | null;
  outcome: string | null;
  outcome_note: string | null;
  refund_cash_cents: number;
  refund_credit_cents: number;
  refund_due_at: Date | null;
  refunded_at: Date | null;
  resolved_at: Date | null;
  appeal_text: string | null;
  appeal_at: Date | null;
  appeal_decision: "upheld" | "overturned" | null;
  appeal_decided_at: Date | null;
  created_at: Date;
};

type After = () => Promise<unknown>;

const caseUrl = (id: string) => `/cases/${id}`;

/**
 * Open a case. Handles the auto-reject rule (a PIN entry is proof of handoff) and the
 * incident bookkeeping. `openedBy` null = opened by the system (sweeps).
 */
export async function openCase(i: { type: CaseType; orderId: string; openedBy: string | null; reason?: string; description?: string; photoId?: string | null }) {
  const s = await getPricing();
  const after: After[] = [];
  const result = await tx(async (t) => {
    const o = await lockOrder(t, i.orderId);
    const [open] = await t.query("select 1 from public.cases where order_id = $1 and type = $2 and status <> 'resolved'", [o.id, i.type]);
    if (open) throw new ApiError(409, "exists", "There's already an open case for this. We're on it.");
    const now = new Date();

    if (i.type === "missing_delivery" && i.openedBy) {
      if (!missingDeliveryDue({ status: o.status, pickedUpAt: o.picked_up_at, atDoorAt: o.at_door_at, pinEnteredAt: o.pin_entered_at }, now, s.missingDeliveryMinutes)) {
        throw new ApiError(409, "too_soon", "Your runner still has time. This option opens if they haven't reached you after a while.");
      }
    }
    if (i.type === "pin_no_food" && !pinClaimAvailable({ pinEnteredAt: o.pin_entered_at, status: o.status }, now, s.pinClaimWindowSeconds)) {
      throw new ApiError(409, "window_closed", "This has to be reported within a few minutes of giving your PIN.");
    }
    const autoReject = i.type === "customer_claim" && autoRejectClaim((i.reason ?? "other") as ClaimReason, { status: o.status, pinEnteredAt: o.pin_entered_at });

    const [c] = await t.query<CaseRow>(
      `insert into public.cases (order_id, type, priority, status, customer_id, runner_id, opened_by, reason, description, auto_rejected,
         response_due_at, refund_due_at, outcome, outcome_note, resolved_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         case when $6::uuid is not null then now() + make_interval(hours => $11) end,
         now() + make_interval(hours => $12), $13, $14, case when $10 then now() end)
       returning *`,
      [
        o.id, i.type, PRIORITY[i.type], autoReject ? "resolved" : "open", o.customer_id, o.runner_id, i.openedBy,
        i.reason ?? "", (i.description ?? "").slice(0, 2000), autoReject, s.caseResponseHours, s.refundTargetHours,
        autoReject ? "rejected" : null,
        autoReject ? "This order was completed with your PIN, which is proof of handoff. Theft or never-received claims on PIN-completed orders are automatically rejected." : null,
      ],
    );
    if (i.photoId && i.openedBy) {
      await takePhoto(t, i.photoId, i.openedBy, "case");
      await t.query("update public.photos set case_id = $1 where id = $2", [c.id, i.photoId]);
    }
    await logEvent(t, o.id, i.openedBy, "case_opened", null, null, { type: i.type, caseId: c.id, autoRejected: autoReject });

    // Incidents (section 14).
    if (autoReject) {
      after.push(...(await recordIncident(t, { userId: o.customer_id, role: "customer", type: "rejected_claim", orderId: o.id, caseId: c.id, counterpartyId: o.runner_id }, s)));
    } else if (i.type === "pin_no_food") {
      after.push(...(await recordIncident(t, { userId: o.customer_id, role: "customer", type: "pin_no_food", orderId: o.id, caseId: c.id, counterpartyId: o.runner_id, pending: true }, s)));
      if (o.runner_id) after.push(...(await recordIncident(t, { userId: o.runner_id, role: "runner", type: "pin_no_food", orderId: o.id, caseId: c.id, counterpartyId: o.customer_id, pending: true }, s)));
    } else if (i.type === "missing_delivery" && o.runner_id) {
      after.push(...(await recordIncident(t, { userId: o.runner_id, role: "runner", type: "missing_delivery", orderId: o.id, caseId: c.id, counterpartyId: o.customer_id }, s)));
    } else if (i.type === "runner_not_at_door" && o.runner_id) {
      await t.query("update public.orders set runner_absent_case_at = now() where id = $1", [o.id]);
      after.push(...(await recordIncident(t, { userId: o.runner_id, role: "runner", type: "runner_not_at_door", orderId: o.id, caseId: c.id, counterpartyId: o.customer_id }, s)));
    }

    if (!autoReject) {
      if (o.runner_id && i.type !== "runner_problem") {
        const rid = o.runner_id;
        after.push(() => notify(rid, { category: "disputes", title: `Case opened on order ${o.code}`, body: `${CASE_LABEL[i.type]}. You have ${s.caseResponseHours} hours to respond.`, url: caseUrl(c.id) }));
      }
      after.push(() =>
        notifyAdmins({ title: `${c.priority === 1 ? "TOP PRIORITY: " : c.priority === 2 ? "High priority: " : ""}${CASE_LABEL[i.type]}`, body: `Order ${o.code}. Refund target: ${s.refundTargetHours}h.`, url: `/admin/cases/${c.id}` }),
      );
    }
    return c;
  });
  await runAfter(after);
  return result;
}

/**
 * Runner: "Problem with this order" before delivery. Treated as an accident: the
 * customer is refunded per the lost-food policy, the order ends, and there's no
 * penalty the first time in 30 days (later ones count as incidents).
 */
export async function runnerProblem(runnerId: string, orderId: string, i: { reason: ProblemReason; note: string; photoId: string }) {
  const s = await getPricing();
  const after: After[] = [];
  const out = await tx(async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.runner_id !== runnerId) throw new ApiError(404, "not_found", "That isn't one of your jobs.");
    if (!["claimed", "picked_up", "on_the_way"].includes(o.status) || o.pin_entered_at) throw new ApiError(409, "too_late", "You can only report a problem before the handoff.");
    await takePhoto(t, i.photoId, runnerId, "problem");
    const [c] = await t.query<CaseRow>(
      `insert into public.cases (order_id, type, priority, status, customer_id, runner_id, opened_by, reason, description, outcome, outcome_note, resolved_at, refund_due_at)
       values ($1, 'runner_problem', 3, 'resolved', $2, $3, $3, $4, $5, 'accident_refunded', 'Treated as an accident. The customer was refunded.', now(), now()) returning *`,
      [o.id, o.customer_id, runnerId, i.reason, i.note.slice(0, 1000)],
    );
    await t.query("update public.photos set case_id = $1 where id = $2", [c.id, i.photoId]);
    const refund = await applyLostOrderRefund(t, o, `Runner problem: ${PROBLEM_REASONS[i.reason]}`);
    await t.query("update public.cases set refund_cash_cents = $2, refund_credit_cents = $3, refunded_at = now() where id = $1", [c.id, refund.cashCents, refund.creditCents]);
    await t.query("update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', cancel_reason = $2 where id = $1", [o.id, `Runner reported: ${PROBLEM_REASONS[i.reason]}`]);
    await t.query("update public.runs set closed_at = now() where id = $1 and not exists (select 1 from public.orders where run_id = $1 and status in ('claimed','picked_up','on_the_way'))", [o.run_id]);
    await logEvent(t, o.id, runnerId, "runner_problem", o.status, "cancelled", { reason: i.reason, caseId: c.id });
    const [{ n }] = await t.query<{ n: number }>(
      "select count(*)::int as n from public.cases where runner_id = $1 and type = 'runner_problem' and created_at > now() - interval '30 days'",
      [runnerId],
    );
    if (n > s.freeProblemReportsPer30d) {
      after.push(...(await recordIncident(t, { userId: runnerId, role: "runner", type: "problem_report", orderId: o.id, caseId: c.id, counterpartyId: o.customer_id }, s)));
    }
    after.push(() =>
      notify(o.customer_id, {
        category: "disputes",
        title: `Order ${o.code} couldn't be delivered`,
        body: `Your runner reported: ${PROBLEM_REASONS[i.reason].toLowerCase()}. ${formatCents(refund.cashCents)} is back on your card and ${formatCents(refund.creditCents)} is now Dormdash credit.`,
        url: caseUrl(c.id),
      }),
    );
    return { caseId: c.id, ...refund, penalty: n > s.freeProblemReportsPer30d };
  });
  await runAfter(after);
  return out;
}

export async function respondToCase(runnerId: string, caseId: string, response: string) {
  const c = await q1<CaseRow>("select * from public.cases where id = $1", [caseId]);
  if (!c || c.runner_id !== runnerId) throw new ApiError(404, "not_found", "We couldn't find that case.");
  if (c.status === "resolved") throw new ApiError(409, "resolved", "This case is already resolved.");
  if (c.response_due_at && Date.now() > new Date(c.response_due_at).getTime()) throw new ApiError(409, "late", "The 24-hour response window has closed. Message the Dormdash team in the case thread instead.");
  await q("update public.cases set runner_response = $2, runner_responded_at = now(), status = 'under_review' where id = $1", [caseId, response.slice(0, 2000)]);
  await notifyAdmins({ title: "Runner responded to a case", body: "Ready for a decision.", url: `/admin/cases/${caseId}` });
}

/** Case threads: each party talks only to Dormdash admins. */
export async function postCaseMessage(authorId: string, caseId: string, party: "customer" | "runner", body: string, fromAdmin: boolean) {
  const c = await q1<CaseRow>("select * from public.cases where id = $1", [caseId]);
  if (!c) throw new ApiError(404, "not_found", "We couldn't find that case.");
  if (!fromAdmin) {
    const mine = party === "customer" ? c.customer_id === authorId : c.runner_id === authorId;
    if (!mine) throw new ApiError(404, "not_found", "We couldn't find that case.");
  }
  await q("insert into public.case_messages (case_id, party, author_id, from_admin, body) values ($1, $2, $3, $4, $5)", [caseId, party, authorId, fromAdmin, body.slice(0, 2000)]);
  if (fromAdmin) {
    const to = party === "customer" ? c.customer_id : c.runner_id;
    if (to) await notify(to, { category: "disputes", title: "New message from Dormdash about your case", body: body.slice(0, 120), url: caseUrl(caseId) });
  } else {
    await notifyAdmins({ title: `New ${party} message on a case`, body: body.slice(0, 120), url: `/admin/cases/${caseId}` });
  }
}

export type CaseOutcome = "confirm_theft" | "runner_at_fault" | "customer_at_fault" | "accident_refund" | "no_fault" | "dismiss";

export const OUTCOME_LABEL: Record<CaseOutcome, string> = {
  confirm_theft: "Theft confirmed",
  runner_at_fault: "Runner at fault",
  customer_at_fault: "Customer at fault",
  accident_refund: "Accident: refunded",
  no_fault: "No fault found",
  dismiss: "Dismissed",
};

/** Ban the runner and block their email, phone and NYU ID from ever registering again. */
async function banRunner(t: Queryable, runnerId: string, caseId: string) {
  const [p] = await t.query<{ email: string | null; phone: string | null }>("select email, phone from public.profiles where id = $1", [runnerId]);
  const [app] = await t.query<{ nyu_id_number: string | null }>("select nyu_id_number from public.runner_applications where user_id = $1 order by created_at desc limit 1", [runnerId]);
  await t.query("update public.profiles set status = 'banned', banned_at = now(), runner_status = 'suspended', on_shift = false where id = $1", [runnerId]);
  for (const [kind, value] of [["email", p?.email], ["phone", p?.phone], ["nyu_id", app?.nyu_id_number]] as const) {
    if (value) await t.query("insert into public.blocked_identities (kind, value, reason, case_id) values ($1, lower($2), 'Confirmed theft', $3) on conflict do nothing", [kind, value, caseId]);
  }
}

/** Unpaid (not yet transferred) runner earnings go to the Guarantee Fund. */
async function deductUnpaid(t: Queryable, runnerId: string, orderId: string) {
  const [r] = await t.query<{ amount: number }>("select coalesce(sum(amount_cents), 0)::int as amount from public.runner_earnings where runner_id = $1 and payout_id is null", [runnerId]);
  if (r.amount <= 0) return 0;
  await t.query("insert into public.runner_earnings (runner_id, order_id, kind, amount_cents, memo) values ($1, $2, 'adjustment', $3, 'Deducted toward the Guarantee Fund: confirmed theft')", [runnerId, orderId, -r.amount]);
  await ledger(t, { orderId, userId: runnerId, kind: "runner_deduction", amountCents: r.amount, memo: "Unpaid runner earnings deducted: confirmed theft" });
  return r.amount;
}

/**
 * Admin decision. "Confirm theft" does it all in one step: lost-food refund policy,
 * deduct unpaid earnings toward the Guarantee Fund, permanent ban, identity block,
 * ledger entries.
 */
export async function resolveCase(adminId: string, caseId: string, outcome: CaseOutcome, note: string) {
  const s = await getPricing();
  const after: After[] = [];
  const res = await tx(async (t) => {
    const [c] = await t.query<CaseRow>("select * from public.cases where id = $1 for update", [caseId]);
    if (!c) throw new ApiError(404, "not_found", "Case not found.");
    if (c.status === "resolved") throw new ApiError(409, "resolved", "Already resolved.");
    const o = await lockOrder(t, c.order_id);
    let cash = 0;
    let credit = 0;
    let deducted = 0;

    if (outcome === "confirm_theft" || outcome === "accident_refund") {
      const r = await applyLostOrderRefund(t, o, outcome === "confirm_theft" ? "Confirmed theft" : "Lost order");
      cash = r.cashCents;
      credit = r.creditCents;
      if (["picked_up", "on_the_way"].includes(o.status)) {
        await t.query("update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = 'admin', cancel_reason = $2 where id = $1", [o.id, OUTCOME_LABEL[outcome]]);
      }
    }
    if (outcome === "confirm_theft" && c.runner_id) {
      deducted = await deductUnpaid(t, c.runner_id, o.id);
      await banRunner(t, c.runner_id, c.id);
      after.push(...(await recordIncident(t, { userId: c.runner_id, role: "runner", type: "theft", orderId: o.id, caseId: c.id, counterpartyId: c.customer_id }, s)));
    }
    // Upheld against the runner: drop back one level.
    if ((outcome === "runner_at_fault" || outcome === "confirm_theft") && c.runner_id) {
      const [p] = await t.query<{ level_offset: number }>("select level_offset from public.profiles where id = $1", [c.runner_id]);
      const done = await completedDeliveries(t, c.runner_id);
      await t.query("update public.profiles set level_offset = $2 where id = $1", [c.runner_id, demotedOffset(done, p.level_offset, s.levelTiers)]);
    }
    // PIN-but-no-food: incidents sat on both parties; keep only the one at fault.
    if (c.type === "pin_no_food") {
      const keep = outcome === "customer_at_fault" ? c.customer_id : outcome === "runner_at_fault" || outcome === "confirm_theft" ? c.runner_id : null;
      await t.query("update public.incidents set pending = false, voided = (user_id is distinct from $2::uuid) where case_id = $1 and type = 'pin_no_food'", [c.id, keep]);
    }
    if (outcome === "customer_at_fault" && c.type !== "pin_no_food") {
      after.push(...(await recordIncident(t, { userId: c.customer_id, role: "customer", type: "rejected_claim", orderId: o.id, caseId: c.id, counterpartyId: c.runner_id }, s)));
    }
    if (outcome === "dismiss" || outcome === "no_fault") {
      await t.query("update public.incidents set voided = true, pending = false where case_id = $1", [c.id]);
    }
    await t.query(
      `update public.cases set status = 'resolved', outcome = $2, outcome_note = $3, refund_cash_cents = $4, refund_credit_cents = $5,
         refunded_at = case when $4 + $5 > 0 then now() end, resolved_by = $6, resolved_at = now() where id = $1`,
      [c.id, outcome, note, cash, credit, adminId],
    );
    await logEvent(t, o.id, adminId, "case_resolved", null, null, { caseId: c.id, outcome, cash, credit, deducted });

    const summary =
      cash + credit > 0
        ? `${OUTCOME_LABEL[outcome]}. ${formatCents(cash)} back to your card, ${formatCents(credit)} as Dormdash credit.`
        : `${OUTCOME_LABEL[outcome]}.`;
    after.push(async () => {
      await notify(c.customer_id, { category: "disputes", title: `Case on order ${o.code} resolved`, body: summary, url: caseUrl(c.id), email: templates.disputeOutcome({ code: o.code, outcome: summary, note, forRunner: false }) });
      if (c.runner_id) {
        const runnerMsg = outcome === "confirm_theft" ? "Theft was confirmed. Your account is banned. You can appeal once within 7 days." : OUTCOME_LABEL[outcome] + ".";
        await notify(c.runner_id, { category: "disputes", title: `Case on order ${o.code} resolved`, body: runnerMsg, url: caseUrl(c.id), email: templates.disputeOutcome({ code: o.code, outcome: runnerMsg, note, forRunner: true }) });
      }
    });
    return { cash, credit, deducted };
  });
  await runAfter(after);
  return res;
}

/** Release a held no-show payout after admin review. */
export async function releaseNoShowPayout(orderId: string, approve: boolean) {
  const o = await q1<OrderRow>("select * from public.orders where id = $1", [orderId]);
  if (!o || o.status !== "customer_no_show" || !o.payout_review) throw new ApiError(409, "not_held", "Nothing is waiting on review for this order.");
  await tx(async (t) => {
    if (approve) {
      await t.query("update public.runner_earnings set held = false where order_id = $1 and held", [orderId]);
    } else {
      // Not a verified no-show: the customer gets a full refund and the held pay is removed.
      await t.query("delete from public.runner_earnings where order_id = $1 and held and payout_id is null", [orderId]);
      const cash = await refundOrder(t, o, o.charged_cents - o.refunded_cents, `No-show reversed, order ${o.code}`);
      await issueCredit(t, o.customer_id, o.credit_applied_cents, o.id, "No-show reversed");
      await t.query("update public.incidents set voided = true where order_id = $1 and type = 'no_show'", [orderId]);
      await logEvent(t, o.id, null, "no_show_reversed", null, null, { cash });
    }
    await t.query("update public.orders set payout_review = false where id = $1", [orderId]);
  });
  if (approve && o.runner_id) await payRunner(o.runner_id, orderId);
}

// ---------------------------------------------------------------------------
// Appeals (banned runners, once, within 7 days)
// ---------------------------------------------------------------------------

export async function appealableCase(runnerId: string) {
  const s = await getPricing();
  return q1<CaseRow>(
    `select * from public.cases where runner_id = $1 and outcome = 'confirm_theft' and resolved_at > now() - make_interval(days => $2)
     order by resolved_at desc limit 1`,
    [runnerId, s.appealDays],
  );
}

export async function submitAppeal(runnerId: string, caseId: string, text: string) {
  const c = await appealableCase(runnerId);
  if (!c || c.id !== caseId) throw new ApiError(409, "not_eligible", "There's no appealable decision on your account.");
  if (c.appeal_at) throw new ApiError(409, "already", "You've already appealed. The decision on your appeal is final.");
  await q("update public.cases set appeal_text = $2, appeal_at = now() where id = $1", [caseId, text.slice(0, 3000)]);
  await notifyAdmins({ title: "Theft decision appealed", body: "A banned runner submitted their one appeal.", url: `/admin/cases/${caseId}` });
}

export async function decideAppeal(adminId: string, caseId: string, decision: "upheld" | "overturned", note: string) {
  const c = await q1<CaseRow>("select * from public.cases where id = $1", [caseId]);
  if (!c?.appeal_at || c.appeal_decision) throw new ApiError(409, "nothing", "No pending appeal on this case.");
  await tx(async (t) => {
    await t.query("update public.cases set appeal_decision = $2, appeal_decided_at = now(), outcome_note = coalesce(outcome_note, '') || $3 where id = $1", [
      caseId,
      decision,
      `\n\nAppeal ${decision}${note ? `: ${note}` : ""}.`,
    ]);
    if (decision === "overturned" && c.runner_id) {
      await t.query("update public.profiles set status = 'active', banned_at = null, runner_status = 'approved' where id = $1", [c.runner_id]);
      await t.query("delete from public.blocked_identities where case_id = $1", [caseId]);
      await t.query("update public.incidents set voided = true where case_id = $1 and user_id = $2", [caseId, c.runner_id]);
    }
    await t.query("insert into public.case_messages (case_id, party, author_id, from_admin, body) values ($1, 'runner', $2, true, $3)", [
      caseId,
      adminId,
      decision === "overturned" ? `Your appeal was accepted and your account is restored.${note ? ` ${note}` : ""}` : `Your appeal was reviewed and the decision stands. This is final.${note ? ` ${note}` : ""}`,
    ]);
  });
  if (c.runner_id) {
    const p = await q1<{ email: string | null }>("select email from public.profiles where id = $1", [c.runner_id]);
    if (p?.email) {
      const msg = decision === "overturned" ? "Your appeal was accepted. Your account is restored." : "Your appeal was reviewed and the decision stands. This decision is final.";
      await sendEmail({ to: p.email, ...templates.notification("Your appeal was decided", msg, "/appeal") });
    }
  }
}

// ---------------------------------------------------------------------------
// Views (privacy: never the other party's last name, phone, email, NYU ID, location)
// ---------------------------------------------------------------------------

export type PartyCaseView = {
  id: string;
  type: CaseType;
  label: string;
  status: CaseRow["status"];
  statusLabel: string;
  reason: string;
  description: string;
  autoRejected: boolean;
  outcome: string | null;
  outcomeNote: string | null;
  refundCashCents: number;
  refundCreditCents: number;
  runnerResponse: string | null;
  responseDueAt: Date | null;
  canRespond: boolean;
  canAppeal: boolean;
  appealAt: Date | null;
  appealDecision: string | null;
  createdAt: Date;
  order: { id: string; code: string; spotName: string; building: string; floor: number; room: string };
  counterpartFirstName: string | null;
  timeline: { at: Date; label: string }[];
  messages: { at: Date; fromAdmin: boolean; body: string }[];
};

const STATUS_LABEL = { open: "Open", under_review: "Under review", resolved: "Resolved" } as const;

const EVENT_COPY: Record<string, string> = {
  created: "Order placed",
  paid: "Paid",
  claimed: "Runner claimed it",
  picked_up: "Picked up (bag photo taken)",
  heads_up: "Heads-up sent",
  at_door: "Runner at the door (photo taken)",
  customer_present: "Customer said they were at the door",
  call: "Call button tapped",
  pin_ok: "PIN entered",
  delivered: "Delivered with PIN",
  customer_no_show: "Marked customer not here",
  runner_problem: "Runner reported a problem",
  case_opened: "Case opened",
  case_resolved: "Case resolved",
  floor_fee_refunded: "Floor fee refunded (lobby handoff)",
};

export async function caseForParty(userId: string, caseId: string): Promise<PartyCaseView | null> {
  const c = await q1<CaseRow>("select * from public.cases where id = $1", [caseId]);
  if (!c) return null;
  const role: "customer" | "runner" | null = c.customer_id === userId ? "customer" : c.runner_id === userId ? "runner" : null;
  if (!role) return null;
  const o = await q1<{ id: string; code: string; spot_name: string; building: string; floor: number; room: string; counterpart: string | null }>(
    `select o.id, o.code, sp.name as spot_name, b.name as building, o.floor, o.room,
       split_part(p.full_name, ' ', 1) as counterpart
     from public.orders o join public.pickup_spots sp on sp.id = o.spot_id join public.buildings b on b.id = o.building_id
     left join public.profiles p on p.id = $2
     where o.id = $1`,
    [c.order_id, role === "customer" ? c.runner_id : c.customer_id],
  );
  const events = await q<{ type: string; created_at: Date }>("select type, created_at from public.order_events where order_id = $1 order by id", [c.order_id]);
  const messages = await q<{ created_at: Date; from_admin: boolean; body: string }>(
    "select created_at, from_admin, body from public.case_messages where case_id = $1 and party = $2 order by id",
    [caseId, role],
  );
  const appeal = role === "runner" ? await appealableCase(userId) : null;
  return {
    id: c.id,
    type: c.type,
    label: CASE_LABEL[c.type],
    status: c.status,
    statusLabel: STATUS_LABEL[c.status],
    reason: c.reason,
    description: c.description,
    autoRejected: c.auto_rejected,
    outcome: c.outcome ? OUTCOME_LABEL[c.outcome as CaseOutcome] ?? c.outcome : null,
    outcomeNote: c.outcome_note,
    refundCashCents: c.refund_cash_cents,
    refundCreditCents: c.refund_credit_cents,
    runnerResponse: c.runner_response,
    responseDueAt: c.response_due_at,
    canRespond: role === "runner" && c.status !== "resolved" && !c.runner_response && (!c.response_due_at || Date.now() < new Date(c.response_due_at).getTime()),
    canAppeal: role === "runner" && appeal?.id === c.id && !c.appeal_at,
    appealAt: c.appeal_at,
    appealDecision: c.appeal_decision,
    createdAt: c.created_at,
    order: { id: o!.id, code: o!.code, spotName: o!.spot_name, building: o!.building, floor: o!.floor, room: o!.room },
    counterpartFirstName: o?.counterpart || null,
    timeline: events.filter((e) => EVENT_COPY[e.type]).map((e) => ({ at: e.created_at, label: EVENT_COPY[e.type] })),
    messages: messages.map((m) => ({ at: m.created_at, fromAdmin: m.from_admin, body: m.body })),
  };
}

/** Missing-delivery sweep (cron): notify the runner and admins once. */
export async function missingDeliverySweep(now = new Date()) {
  const s = await getPricing();
  const rows = await q<OrderRow>("select * from public.orders where status in ('picked_up','on_the_way') and missing_notified_at is null and at_door_at is null and pin_entered_at is null");
  let notified = 0;
  for (const o of rows) {
    if (!missingDeliveryDue({ status: o.status, pickedUpAt: o.picked_up_at, atDoorAt: o.at_door_at, pinEnteredAt: o.pin_entered_at }, now, s.missingDeliveryMinutes)) continue;
    await q("update public.orders set missing_notified_at = now() where id = $1", [o.id]);
    if (o.runner_id) await notify(o.runner_id, { category: "order_updates", title: `Order ${o.code} hasn't been delivered`, body: "It's been a while since pickup. Head to the customer now, or report a problem.", url: "/run/active" });
    await notifyAdmins({ title: "Possible missing delivery", body: `Order ${o.code}: picked up ${s.missingDeliveryMinutes}+ minutes ago, no door check or PIN.`, url: "/admin/orders" });
    await notify(o.customer_id, { category: "order_updates", title: "Still waiting on your food?", body: "If it never arrived, you can report it from the order screen.", url: `/orders/${o.id}` });
    notified++;
  }
  return { notified };
}
