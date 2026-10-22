import "server-only";
import { q, q1, tx } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { templates } from "@/lib/email";
import { notify, notifyAdmins } from "@/lib/notify";
import { getPricing } from "@/lib/settings";
import { addEarning, recordPlatformFee, refundOrder } from "./money";
import { takePhoto } from "./photos";
import { addStrike } from "./strikes";
import type { OrderRow } from "./orders";

export type DisputeReason = "late" | "missing" | "wrong_items" | "stolen" | "wrong_room" | "other";
export type ResolutionAction = "refund_fee" | "refund_tip" | "strike" | "ban" | "dismiss";

export const REASON_LABEL: Record<DisputeReason, string> = {
  late: "Way too late",
  missing: "Never got it",
  wrong_items: "Wrong or missing items",
  stolen: "Bag was taken",
  wrong_room: "Left at the wrong room",
  other: "Something else",
};

export const ACTION_LABEL: Record<ResolutionAction, string> = {
  refund_fee: "Refund delivery fee",
  refund_tip: "Refund tip",
  strike: "Strike the runner",
  ban: "Suspend the runner",
  dismiss: "Dismiss",
};

const REPORT_WINDOW_HOURS = 72;

export type Dispute = {
  id: string;
  order_id: string;
  customer_id: string;
  runner_id: string | null;
  reason: DisputeReason;
  description: string;
  status: "open" | "runner_responded" | "resolved";
  runner_response: string | null;
  runner_responded_at: Date | null;
  resolution_actions: ResolutionAction[];
  resolution_note: string | null;
  resolved_at: Date | null;
  created_at: Date;
};

export async function openDispute(customerId: string, orderId: string, input: { reason: DisputeReason; description: string; photoId: string | null }) {
  const needsPhoto = input.reason === "wrong_items" || input.reason === "wrong_room";
  if (needsPhoto && !input.photoId) throw new ApiError(400, "photo_required", "Add a photo for this kind of problem so we can see what happened.");
  const d = await tx(async (t) => {
    const [o] = await t.query<OrderRow>("select * from public.orders where id = $1 for update", [orderId]);
    if (!o || o.customer_id !== customerId) throw new ApiError(404, "not_found", "We couldn't find that order.");
    if (o.status !== "delivered") throw new ApiError(409, "not_delivered", "You can report a problem once the order is marked delivered.");
    if (o.delivered_at && Date.now() - o.delivered_at.getTime() > REPORT_WINDOW_HOURS * 3600000) {
      throw new ApiError(409, "too_late", `Problems need to be reported within ${REPORT_WINDOW_HOURS} hours of delivery.`);
    }
    const [open] = await t.query("select 1 from public.disputes where order_id = $1 and status <> 'resolved'", [orderId]);
    if (open) throw new ApiError(409, "exists", "There's already an open report for this order. We're on it.");
    const [d] = await t.query<{ id: string }>(
      "insert into public.disputes (order_id, customer_id, runner_id, reason, description) values ($1, $2, $3, $4, $5) returning id",
      [o.id, customerId, o.runner_id, input.reason, input.description],
    );
    if (input.photoId) {
      await takePhoto(t, input.photoId, customerId, "dispute");
      await t.query("update public.photos set dispute_id = $1 where id = $2", [d.id, input.photoId]);
    }
    await t.query(
      "insert into public.order_events (order_id, actor_id, type, data) values ($1, $2, 'dispute_opened', $3::jsonb)",
      [o.id, customerId, JSON.stringify({ reason: input.reason })],
    );
    return { id: d.id, runnerId: o.runner_id, code: o.code };
  });
  if (d.runnerId) {
    await notify(d.runnerId, {
      category: "disputes",
      title: `Problem reported on ${d.code}`,
      body: `The customer says: ${REASON_LABEL[input.reason]}. Add your side so an admin can sort it out.`,
      url: `/run/disputes/${d.id}`,
    });
  }
  await notifyAdmins({ title: "New problem report", body: `${REASON_LABEL[input.reason]} on order ${d.code}.`, url: `/admin/disputes/${d.id}` });
  return d.id;
}

export async function respondToDispute(runnerId: string, disputeId: string, response: string) {
  const d = await q1<Dispute>("select * from public.disputes where id = $1", [disputeId]);
  if (!d || d.runner_id !== runnerId) throw new ApiError(404, "not_found", "We couldn't find that report.");
  if (d.status === "resolved") throw new ApiError(409, "resolved", "This report is already resolved.");
  await q("update public.disputes set runner_response = $2, runner_responded_at = now(), status = 'runner_responded' where id = $1", [disputeId, response]);
  await notifyAdmins({ title: "Runner responded to a report", body: "Ready for a decision.", url: `/admin/disputes/${disputeId}` });
}

export async function resolveDispute(adminId: string, disputeId: string, actions: ResolutionAction[], note: string) {
  const settings = await getPricing();
  const set = new Set(actions);
  if (set.has("dismiss") && set.size > 1) throw new ApiError(400, "conflict", "Dismiss can't be combined with other actions.");
  const after: (() => Promise<unknown>)[] = [];
  const outcome = await tx(async (t) => {
    const [d] = await t.query<Dispute>("select * from public.disputes where id = $1 for update", [disputeId]);
    if (!d) throw new ApiError(404, "not_found", "Report not found.");
    if (d.status === "resolved") throw new ApiError(409, "resolved", "Already resolved.");
    const [o] = await t.query<OrderRow>("select * from public.orders where id = $1 for update", [d.order_id]);
    const parts: string[] = [];

    if (set.has("refund_fee") && !o.late_refunded_at) {
      const r = await refundOrder(t, o, o.delivery_fee_cents, `Problem report refund (fee), order ${o.code}`);
      if (r > 0) {
        parts.push(`Delivery fee refunded ($${(r / 100).toFixed(2)})`);
        if (o.runner_id) await addEarning(t, { runnerId: o.runner_id, orderId: o.id, kind: "adjustment", amountCents: -o.runner_fee_cents, holdHours: 0, memo: "Fee clawback: upheld report" });
        await recordPlatformFee(t, o, -o.platform_fee_cents, `Fee reversal, order ${o.code}`);
      }
    } else if (set.has("refund_fee")) {
      parts.push("Delivery fee was already refunded for lateness");
    }
    if (set.has("refund_tip") && o.tip_cents > 0) {
      const r = await refundOrder(t, o, o.tip_cents, `Problem report refund (tip), order ${o.code}`);
      if (r > 0) {
        parts.push(`Tip refunded ($${(r / 100).toFixed(2)})`);
        if (o.runner_id) await addEarning(t, { runnerId: o.runner_id, orderId: o.id, kind: "adjustment", amountCents: -r, holdHours: 0, memo: "Tip clawback: upheld report" });
      }
    }
    if (set.has("strike") && o.runner_id) {
      const s = await addStrike(t, { runnerId: o.runner_id, reason: "dispute", orderId: o.id, note, by: adminId, threshold: settings.strikeThreshold });
      after.push(s.after);
      parts.push("Runner received a strike");
    }
    if (set.has("ban") && o.runner_id) {
      await t.query("update public.profiles set runner_status = 'suspended', on_shift = false where id = $1", [o.runner_id]);
      parts.push("Runner suspended");
    }
    if (set.has("dismiss")) parts.push("No action. We didn't find enough to go on");

    await t.query(
      "update public.disputes set status = 'resolved', resolution_actions = $2::text[], resolution_note = $3, resolved_by = $4, resolved_at = now() where id = $1",
      [d.id, `{${[...set].join(",")}}`, note, adminId],
    );
    await t.query(
      "insert into public.order_events (order_id, actor_id, type, data) values ($1, $2, 'dispute_resolved', $3::jsonb)",
      [o.id, adminId, JSON.stringify({ actions: [...set] })],
    );
    return { d, o, text: parts.join(". ") + "." };
  });
  await Promise.allSettled(after.map((f) => f()));

  const people = await q<{ id: string; email: string | null }>(
    "select id, email from public.profiles where id = any(array[$1::uuid, coalesce($2::uuid, $1::uuid)])",
    [outcome.d.customer_id, outcome.d.runner_id],
  );
  for (const p of people) {
    const forRunner = p.id === outcome.d.runner_id && p.id !== outcome.d.customer_id;
    const mail = templates.disputeOutcome({ code: outcome.o.code, outcome: outcome.text, note, forRunner });
    await notify(p.id, {
      category: "disputes",
      title: `Report on ${outcome.o.code} resolved`,
      body: outcome.text,
      url: forRunner ? `/run/disputes/${outcome.d.id}` : `/orders/${outcome.o.id}`,
      email: mail,
    });
  }
  return outcome.text;
}
