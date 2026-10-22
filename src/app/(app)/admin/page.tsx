import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { q1 } from "@/lib/db";
import { paymentsMode } from "@/lib/env";
import { kpiSummary, ordersByBuilding, ordersBySpot, ordersPerDay, peakHeatmap, type KpiRange } from "@/lib/services/kpis";
import { getCurrentSurge } from "@/lib/settings";
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
  const [s, daily, byBuilding, bySpot, heat, queues, onShift, surge] = await Promise.all([
    kpiSummary(days),
    ordersPerDay(days),
    ordersByBuilding(days),
    ordersBySpot(days),
    peakHeatmap(days),
    q1<{ apps: number; disputes: number; live: number }>(
      `select (select count(*)::int from public.runner_applications where status = 'pending') as apps,
              (select count(*)::int from public.disputes where status <> 'resolved') as disputes,
              (select count(*)::int from public.orders where status in ('requested','claimed','picked_up','on_the_way')) as live`,
    ),
    runnersOnShift(),
    getCurrentSurge(),
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
        {queues!.disputes > 0 && <Link href="/admin/disputes" className="link ml-4 text-small font-semibold">{queues!.disputes} open dispute{queues!.disputes === 1 ? "" : "s"}</Link>}
        <span className="tnum ml-auto text-small text-ink-3">{queues!.live} live orders · {surge ? `busy pricing ${surge.multiplier}x (${surge.label})` : "normal pricing"}</span>
      </div>
      {paymentsMode === "demo" && (
        <Notice tone="warning" className="mb-6" title="Demo payments mode">
          No real money is moving. Revenue numbers are from the demo ledger. Add PayPal credentials to go live (see PAYMENTS.md).
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
