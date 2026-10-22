import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { q1 } from "@/lib/db";
import { paymentsMode } from "@/lib/env";
import { kpiSummary, levelDistribution, ordersByBuilding, ordersBySpot, ordersPerDay, peakHeatmap, safetyMetrics, type KpiRange, type SafetyMetrics } from "@/lib/services/kpis";
import { getCurrentSurge, getPricing } from "@/lib/settings";
import { runnersOnShift } from "@/lib/services/coverage";
import { formatCents } from "@/lib/domain/pricing";
import { cn } from "@/lib/cn";
import { BarChart, Heatmap } from "@/components/charts";
import { Notice, SectionTitle } from "@/components/ui/misc";
import { RunPayouts } from "./run-payouts";

export const metadata: Metadata = { title: "Admin" };

const RANGES: KpiRange[] = [7, 30, 90, 365];

function Csv({ report, days, children }: { report: string; days: number; children?: React.ReactNode }) {
  return (
    <a href={`/api/admin/export?report=${report}&days=${days}`} className="inline-flex h-9 items-center gap-1.5 rounded-sm px-2 text-small font-semibold text-ink-2 hover:bg-sunken hover:text-ink">
      <Download className="size-4" aria-hidden /> {children ?? "CSV"}
    </a>
  );
}

const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n)}%`);

export default async function AdminOverview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const days = (RANGES.includes(Number(sp.days) as KpiRange) ? Number(sp.days) : 30) as KpiRange;
  const pricing = await getPricing();
  const [s, daily, byBuilding, bySpot, heat, queues, onShift, surge, safety, levels] = await Promise.all([
    kpiSummary(days),
    ordersPerDay(days),
    ordersByBuilding(days),
    ordersBySpot(days),
    peakHeatmap(days),
    q1<{ apps: number; cases: number; live: number }>(
      `select (select count(*)::int from public.runner_applications where status = 'pending') as apps,
              (select count(*)::int from public.cases where status <> 'resolved') as cases,
              (select count(*)::int from public.orders where status in ('requested','claimed','picked_up','on_the_way')) as live`,
    ),
    runnersOnShift(),
    getCurrentSurge(),
    safetyMetrics(days),
    levelDistribution(pricing.levelTiers),
  ]);

  const stats: { label: string; value: string; sub?: string }[] = [
    { label: "Orders", value: String(s.orders), sub: `${s.delivered} delivered · ${s.cancelled} cancelled` },
    { label: "GMV (fees + tips)", value: formatCents(s.gmvCents), sub: "delivered orders" },
    { label: "Platform revenue", value: formatCents(s.revenueCents), sub: `${formatCents(s.refundsCents)} refunded` },
    { label: "Avg delivery time", value: s.avgDeliveryMinutes ? `${Math.round(s.avgDeliveryMinutes)} min` : "n/a", sub: "order placed to door" },
    { label: "On time", value: pct(s.onTimePct), sub: "within ETA + grace" },
    { label: "Repeat customers", value: pct(s.repeatRatePct), sub: "2+ delivered orders" },
    { label: "Active customers", value: String(s.activeCustomers) },
    { label: "Active runners", value: String(s.activeRunners), sub: `${onShift} on shift now` },
  ];

  return (
    <div className="pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-6 pb-4">
        <div>
          <p className="eyebrow">Traction</p>
          <h1 className="font-display text-display font-black uppercase">Last {days} days</h1>
        </div>
        <div className="flex items-center gap-1 rounded-sm bg-sunken p-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/admin?days=${r}`}
              aria-current={r === days ? "true" : undefined}
              className={cn("tnum flex h-9 items-center rounded-xs px-3 text-small font-semibold", r === days ? "bg-surface text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]" : "text-ink-2 hover:text-ink")}
            >
              {r === 365 ? "1y" : `${r}d`}
            </Link>
          ))}
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {queues!.apps > 0 && <Link href="/admin/runners" className="link text-small font-semibold">{queues!.apps} runner application{queues!.apps === 1 ? "" : "s"} waiting</Link>}
        {queues!.cases > 0 && <Link href="/admin/cases" className="link ml-4 text-small font-semibold">{queues!.cases} open case{queues!.cases === 1 ? "" : "s"}</Link>}
        <span className="tnum ml-auto text-small text-ink-3">{queues!.live} live orders · {surge ? `busy pricing ${surge.multiplier}x (${surge.label})` : "normal pricing"}</span>
      </div>
      {paymentsMode === "demo" && (
        <Notice tone="warning" className="mb-6" title="Demo payments mode">
          No real money is moving. Revenue numbers are from the demo ledger. Add Stripe keys to go live (see PAYMENTS.md).
        </Notice>
      )}

      <section aria-label="Key numbers" className="grid grid-cols-2 border-t-2 border-line-strong md:grid-cols-4">
        {stats.map((st, i) => (
          <div key={st.label} className={cn("border-b border-line py-4 pr-4", i % 2 === 1 && "pl-4 md:pl-0", i % 4 !== 0 && "md:border-l md:pl-4")}>
            <p className="text-caption font-semibold tracking-wide text-ink-3 uppercase">{st.label}</p>
            <p className="tnum mt-1 font-display text-display leading-none font-black">{st.value}</p>
            {st.sub && <p className="tnum mt-1 text-caption text-ink-3">{st.sub}</p>}
          </div>
        ))}
      </section>
      <div className="mt-2 flex items-center justify-end gap-2"><RunPayouts /><Csv report="summary" days={days}>Summary CSV</Csv></div>

      <SafetyPanel m={safety} levels={levels} />

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <section>
          <SectionTitle action={<Csv report="daily" days={days} />}>Orders per day</SectionTitle>
          <BarChart label={`Orders per day, last ${days} days`} data={daily.map((d) => ({ key: d.day, label: d.day.slice(5), value: d.orders }))} />
        </section>
        <section>
          <SectionTitle action={<Csv report="weekly" days={days}>Weekly CSV</Csv>}>Platform revenue per day</SectionTitle>
          <BarChart label={`Platform revenue per day, last ${days} days`} data={daily.map((d) => ({ key: d.day, label: d.day.slice(5), value: d.revenue_cents }))} format="cents" />
        </section>
      </div>

      <section className="mt-10">
        <SectionTitle action={<Csv report="heatmap" days={days} />}>When people order</SectionTitle>
        <Heatmap cells={heat} />
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        {[
          { title: "By building", rows: byBuilding, report: "buildings" },
          { title: "By pickup spot", rows: bySpot, report: "spots" },
        ].map((t) => (
          <section key={t.report}>
            <SectionTitle action={<Csv report={t.report} days={days} />}>{t.title}</SectionTitle>
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-line text-left text-caption tracking-wide text-ink-3 uppercase">
                  <th className="py-2 font-semibold">Name</th>
                  <th className="py-2 text-right font-semibold">Orders</th>
                  <th className="py-2 text-right font-semibold">Delivered</th>
                  <th className="py-2 text-right font-semibold">GMV</th>
                </tr>
              </thead>
              <tbody className="tnum divide-y divide-line">
                {t.rows.map((r) => (
                  <tr key={r.name}>
                    <td className="py-2 pr-2">{r.name}</td>
                    <td className="py-2 text-right">{r.orders}</td>
                    <td className="py-2 text-right">{r.delivered}</td>
                    <td className="py-2 text-right">{formatCents(r.gmv_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}

function SafetyPanel({ m, levels }: { m: SafetyMetrics; levels: { level: number; minDeliveries: number; runners: number }[] }) {
  const groups: { title: string; items: { k: string; v: string; warn?: boolean }[] }[] = [
    {
      title: "Runs",
      items: [
        { k: "Orders per run", v: m.ordersPerRun === null ? "n/a" : m.ordersPerRun.toFixed(1) },
        { k: "Heading-home sessions", v: String(m.headingHomeSessions) },
        { k: "Runs from heading home", v: pct(m.headingHomeRunsPct) },
      ],
    },
    {
      title: "Handoffs",
      items: [
        { k: "Customer no-shows", v: String(m.noShows) },
        { k: "Runner not at door", v: String(m.runnerNotAtDoor) },
        { k: "PIN given, no food", v: String(m.pinNoFood), warn: m.pinNoFood > 0 },
        { k: "Missing deliveries", v: String(m.missingDeliveries), warn: m.missingDeliveries > 0 },
        { k: "Runner problem reports", v: String(m.problemReports) },
        { k: "Claims auto-rejected (PIN entered)", v: String(m.autoRejected) },
        { k: "Confirmed thefts", v: String(m.confirmedThefts), warn: m.confirmedThefts > 0 },
      ],
    },
    {
      title: "Guarantee Fund and credit",
      items: [
        { k: "Fund balance (all time)", v: formatCents(m.fundBalanceCents), warn: m.fundBalanceCents < 0 },
        { k: "Paid out of the fund", v: formatCents(m.fundPaidOutCents) },
        { k: "Shortfall covered by platform", v: formatCents(m.fundShortfallCents), warn: m.fundShortfallCents > 0 },
        { k: "Outstanding customer credit", v: formatCents(m.outstandingCreditCents) },
        { k: "Loss per 1,000 orders", v: m.lossPer1000Cents === null ? "n/a" : formatCents(Math.round(m.lossPer1000Cents)) },
      ],
    },
    {
      title: "Accounts",
      items: [
        { k: "Flagged for review", v: String(m.flaggedUsers), warn: m.flaggedUsers > 0 },
        { k: "Customers paused (no-shows)", v: String(m.reviewRequired), warn: m.reviewRequired > 0 },
        { k: "No-show payouts held", v: String(m.heldNoShowPayouts), warn: m.heldNoShowPayouts > 0 },
        ...levels.map((l) => ({ k: `Level ${l.level} runners (${l.minDeliveries}+ deliveries)`, v: String(l.runners) })),
      ],
    },
  ];
  return (
    <section className="mt-10" aria-label="Safety">
      <SectionTitle action={<Link href="/admin/cases" className="link text-small font-semibold">Case queue</Link>}>Safety and trust</SectionTitle>
      <div className="mt-2 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="eyebrow">{g.title}</p>
            <dl className="tnum mt-2 divide-y divide-line text-small">
              {g.items.map((it) => (
                <div key={it.k} className="flex justify-between gap-3 py-1.5">
                  <dt className="text-ink-2">{it.k}</dt>
                  <dd className={cn("font-semibold", it.warn && "text-danger")}>{it.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
