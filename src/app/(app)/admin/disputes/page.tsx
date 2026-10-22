import type { Metadata } from "next";
import Link from "next/link";
import { q } from "@/lib/db";
import { REASON_LABEL, type DisputeReason } from "@/lib/services/disputes";
import { fmtDateTime } from "@/lib/domain/time";
import { EmptyState, List, Row, SectionTitle, Tag } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Admin · Disputes" };

type D = { id: string; reason: DisputeReason; status: string; created_at: Date; code: string; customer: string; runner: string | null; resolution_actions: string[] };

export default async function AdminDisputes() {
  const rows = await q<D>(
    `select d.id, d.reason, d.status, d.created_at, d.resolution_actions, o.code, c.full_name as customer, r.full_name as runner
     from public.disputes d join public.orders o on o.id = d.order_id join public.profiles c on c.id = d.customer_id
     left join public.profiles r on r.id = d.runner_id order by (d.status = 'resolved'), d.created_at desc limit 100`,
  );
  const open = rows.filter((r) => r.status !== "resolved");
  const closed = rows.filter((r) => r.status === "resolved");
  const row = (d: D) => (
    <Row key={d.id} href={`/admin/disputes/${d.id}`} trailing={<Tag tone={d.status === "resolved" ? "success" : d.status === "runner_responded" ? "accent" : "warning"}>{d.status.replace("_", " ")}</Tag>}>
      <span className="block font-semibold">{REASON_LABEL[d.reason]} · {d.code}</span>
      <span className="tnum block text-small text-ink-3">{d.customer} vs {d.runner ?? "no runner"} · {fmtDateTime(d.created_at)}</span>
    </Row>
  );
  return (
    <div className="max-w-3xl pb-10">
      <h1 className="pt-6 pb-4 font-display text-title font-extrabold uppercase">Disputes</h1>
      <SectionTitle action={<span className="tnum text-small text-ink-3">{open.length} open</span>}>Queue</SectionTitle>
      {open.length === 0 ? <EmptyState title="Nothing to referee">Problem reports show up here with the photos and PIN log attached.</EmptyState> : <List className="border-t-0">{open.map(row)}</List>}
      {closed.length > 0 && (
        <>
          <SectionTitle className="mt-10">Resolved</SectionTitle>
          <List className="border-t-0">{closed.map(row)}</List>
        </>
      )}
      <p className="mt-6 text-small text-ink-3"><Link href="/admin/orders" className="link">Order log</Link> has the full history for any order.</p>
    </div>
  );
}
