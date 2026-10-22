import type { Metadata } from "next";
import Link from "next/link";
import { q } from "@/lib/db";
import { CASE_LABEL, type CaseRow } from "@/lib/services/cases";
import { fmtDateTime } from "@/lib/domain/time";
import { EmptyState, List, Row, SectionTitle, Tag } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Admin · Cases" };
export const dynamic = "force-dynamic";

type C = Pick<CaseRow, "id" | "type" | "priority" | "status" | "auto_rejected" | "created_at" | "refund_due_at" | "refunded_at" | "outcome" | "appeal_at" | "appeal_decision"> & {
  code: string;
  customer: string;
  runner: string | null;
};

/** "Refund due in 3h" / "Refund overdue 2h": the 24-hour refund target. */
function refundClock(due: Date | null) {
  if (!due) return null;
  const h = Math.round((new Date(due).getTime() - Date.now()) / 3_600_000);
  return h >= 0 ? { label: `Refund due in ${h}h`, late: false } : { label: `Refund overdue ${-h}h`, late: true };
}

export default async function AdminCases() {
  const rows = await q<C>(
    `select c.id, c.type, c.priority, c.status, c.auto_rejected, c.created_at, c.refund_due_at, c.refunded_at, c.outcome, c.appeal_at, c.appeal_decision,
            o.code, cu.full_name as customer, r.full_name as runner
     from public.cases c join public.orders o on o.id = c.order_id join public.profiles cu on cu.id = c.customer_id
     left join public.profiles r on r.id = c.runner_id
     order by (c.status = 'resolved'), c.priority, c.created_at limit 200`,
  );
  const open = rows.filter((r) => r.status !== "resolved");
  const appeals = rows.filter((r) => r.appeal_at && !r.appeal_decision);
  const closed = rows.filter((r) => r.status === "resolved" && !(r.appeal_at && !r.appeal_decision)).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 50);

  const row = (c: C) => {
    const clock = c.status !== "resolved" ? refundClock(c.refund_due_at) : null;
    return (
      <Row
        key={c.id}
        href={`/admin/cases/${c.id}`}
        trailing={
          <span className="flex flex-col items-end gap-1">
            <Tag tone={c.status === "resolved" ? (c.auto_rejected ? "danger" : "success") : c.priority === 1 ? "danger" : "warning"}>
              {c.status === "resolved" ? (c.auto_rejected ? "auto-rejected" : c.outcome?.replace(/_/g, " ") ?? "resolved") : `P${c.priority} · ${c.status.replace("_", " ")}`}
            </Tag>
            {clock && <span className={`tnum text-caption font-semibold ${clock.late ? "text-danger" : "text-ink-3"}`}>{clock.label}</span>}
          </span>
        }
      >
        <span className="block font-semibold">{CASE_LABEL[c.type]} · {c.code}</span>
        <span className="tnum block text-small text-ink-3">{c.customer} / {c.runner ?? "no runner"} · {fmtDateTime(c.created_at)}</span>
      </Row>
    );
  };

  return (
    <div className="max-w-3xl pb-10">
      <h1 className="pt-6 pb-4 font-display text-title font-extrabold uppercase">Cases</h1>
      <SectionTitle action={<span className="tnum text-small text-ink-3">{open.length} open</span>}>Queue, by priority</SectionTitle>
      {open.length === 0 ? (
        <EmptyState title="Nothing to review">Missing deliveries, PIN-but-no-food reports, runner problems and customer claims land here with the evidence attached.</EmptyState>
      ) : (
        <List className="border-t-0">{open.map(row)}</List>
      )}
      {appeals.length > 0 && (
        <>
          <SectionTitle className="mt-10">Appeals waiting</SectionTitle>
          <List className="border-t-0">{appeals.map(row)}</List>
        </>
      )}
      {closed.length > 0 && (
        <>
          <SectionTitle className="mt-10">Recently resolved</SectionTitle>
          <List className="border-t-0">{closed.map(row)}</List>
        </>
      )}
      <p className="mt-6 text-small text-ink-3">
        <Link href="/admin/law-enforcement" className="link">Law enforcement log</Link> · <Link href="/admin/orders" className="link">Order log</Link>
      </p>
    </div>
  );
}
