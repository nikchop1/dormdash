import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { paymentsMode } from "@/lib/env";
import { earningLines, earningsSummary, payoutHistory } from "@/lib/services/runners";
import { getPricing } from "@/lib/settings";
import { formatCents } from "@/lib/domain/pricing";
import { fmtDate, fmtDateTime } from "@/lib/domain/time";
import { EmptyState, List, Money, PageHeader, Row, SectionTitle, Tag } from "@/components/ui/misc";
import { PayoutSetup } from "./payout-setup";

export const metadata: Metadata = { title: "Earnings" };

const KIND: Record<string, string> = { delivery_fee: "Delivery", tip: "Tip", cancellation_fee: "Cancellation fee", adjustment: "Adjustment" };

export default async function EarningsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!["approved", "suspended"].includes(user.profile.runner_status)) redirect("/run");
  const [s, lines, payouts, settings, strikes] = await Promise.all([
    earningsSummary(user.id),
    earningLines(user.id, 25),
    payoutHistory(user.id),
    getPricing(),
    asUser(user.id, (t) =>
      t.query<{ reason: string; note: string; created_at: Date; code: string | null }>(
        "select s.reason, s.note, s.created_at, o.code from public.strikes s left join public.orders o on o.id = s.order_id where s.runner_id = $1 and not s.voided order by s.created_at desc",
        [user.id],
      ),
    ),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/run", label: "Run" }} title="Earnings" />

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5">
        <div>
          <p className="eyebrow">Today</p>
          <Money cents={s.todayCents} className="font-display text-display-lg leading-none font-black" />
        </div>
        <div>
          <p className="eyebrow">This week</p>
          <Money cents={s.weekCents} className="font-display text-display-lg leading-none font-black" />
          <p className="tnum mt-1 text-small text-ink-3">{s.deliveriesWeek} deliveries · {formatCents(s.tipsWeekCents)} tips</p>
        </div>
        <div>
          <p className="eyebrow">Sending now</p>
          <Money cents={s.availableCents} className="font-display text-title font-extrabold" />
        </div>
        <div>
          <p className="eyebrow">Waiting on review</p>
          <Money cents={s.pendingCents} className="font-display text-title font-extrabold" />
          <p className="mt-1 text-small text-ink-3">No-shows where your location wasn&rsquo;t verified</p>
        </div>
      </div>

      <section className="mt-8">
        <SectionTitle>Payout account</SectionTitle>
        <PayoutSetup enabled={user.profile.payouts_enabled} started={!!user.profile.stripe_account_id} returning={sp.payouts === "return"} mode={paymentsMode} />
        <p className="mt-2 text-small text-ink-3">
          No holding period: you&rsquo;re paid the moment a customer gives you their PIN (or a no-show is confirmed). Stripe moves it to your bank on its normal schedule.
        </p>
      </section>

      <section className="mt-8">
        <SectionTitle>Per order</SectionTitle>
        {lines.length === 0 ? (
          <EmptyState title="Nothing yet">Go on shift and claim something. Every delivery shows up here with its fee and tip.</EmptyState>
        ) : (
          <List className="border-t-0">
            {lines.map((l) => (
              <Row
                key={l.id}
                trailing={<Money cents={l.amount_cents} className={l.amount_cents < 0 ? "font-semibold text-danger" : "font-semibold"} sign={l.amount_cents > 0} />}
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">{KIND[l.kind] ?? l.kind}</span>
                  {l.payout_id ? <Tag tone="success">Paid</Tag> : l.held ? <Tag tone="warning">In review</Tag> : <Tag tone="accent">Sending</Tag>}
                </span>
                <span className="tnum block text-small text-ink-3">
                  {fmtDateTime(l.created_at)}
                  {l.code && <> · <Link href={`/run/jobs/${l.order_id}`} className="hover:text-ink">{l.code}</Link></>}
                  {l.memo && ` · ${l.memo}`}
                </span>
              </Row>
            ))}
          </List>
        )}
      </section>

      <section className="mt-8">
        <SectionTitle>Payouts</SectionTitle>
        {payouts.length === 0 ? (
          <p className="py-4 text-small text-ink-2">No payouts yet. Your first one goes out the day after your first delivery clears the hold.</p>
        ) : (
          <List className="border-t-0">
            {payouts.map((p) => (
              <Row key={p.id} trailing={<Money cents={p.amount_cents} className="font-semibold" />}>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{fmtDate(p.paid_at ?? p.created_at)}</span>
                  <Tag tone={p.status === "paid" ? "success" : p.status === "failed" ? "danger" : "warning"}>{p.status}</Tag>
                </span>
                <span className="block truncate text-small text-ink-3">{p.provider === "demo" ? "Demo payout" : `PayPal · ${p.receiver}`}{p.error ? ` · ${p.error}` : ""}</span>
              </Row>
            ))}
          </List>
        )}
      </section>

      <section className="mt-8">
        <SectionTitle action={<span className="tnum text-small text-ink-3">{strikes.length} of {settings.strikeThreshold}</span>}>Strikes</SectionTitle>
        {strikes.length === 0 ? (
          <p className="py-4 text-small text-ink-2">Clean record. Keep it that way: be on time, keep your claims.</p>
        ) : (
          <List className="border-t-0">
            {strikes.map((st, i) => (
              <Row key={i}>
                <span className="font-medium">{st.reason === "unclaim" ? "Dropped a job" : st.reason === "late" ? "Late delivery" : st.reason === "dispute" ? "Upheld problem report" : "Admin review"}</span>
                <span className="tnum block text-small text-ink-3">{fmtDate(st.created_at)}{st.code ? ` · ${st.code}` : ""}{st.note ? ` · ${st.note}` : ""}</span>
              </Row>
            ))}
          </List>
        )}
      </section>
    </div>
  );
}
