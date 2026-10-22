import type { Metadata } from "next";
import Link from "next/link";
import { q } from "@/lib/db";
import { fmtDateTime } from "@/lib/domain/time";
import { EmptyState, SectionTitle } from "@/components/ui/misc";
import { LawEnforcementForm } from "./le-form";

export const metadata: Metadata = { title: "Admin · Law enforcement" };
export const dynamic = "force-dynamic";

type R = { id: string; agency: string; officer: string; reference: string; request_date: string; shared: string; case_id: string | null; created_at: Date; admin: string };

export default async function LawEnforcementLog() {
  const rows = await q<R>(
    `select l.id, l.agency, l.officer, l.reference, to_char(l.request_date, 'YYYY-MM-DD') as request_date, l.shared, l.case_id, l.created_at, p.full_name as admin
     from public.law_enforcement_requests l join public.profiles p on p.id = l.created_by order by l.request_date desc, l.created_at desc`,
  );
  return (
    <div className="pb-10">
      <h1 className="pt-6 pb-1 font-display text-title font-extrabold uppercase">Law enforcement log</h1>
      <p className="max-w-prose pb-6 text-small text-ink-2">Share information only in response to a formal legal request. Log every request here: who asked, their reference, and exactly what was shared.</p>
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <section>
          <SectionTitle>Requests</SectionTitle>
          {rows.length === 0 ? (
            <EmptyState title="No requests logged">Nothing has been shared with law enforcement.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id} className="py-3 text-small">
                  <p className="font-semibold">{r.agency} · {r.reference}</p>
                  <p className="tnum text-ink-3">{r.request_date} · Officer {r.officer} · logged by {r.admin} {fmtDateTime(r.created_at)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-ink-2">{r.shared}</p>
                  {r.case_id && <Link href={`/admin/cases/${r.case_id}`} className="link mt-1 inline-block">Linked case</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside>
          <SectionTitle>Log a request</SectionTitle>
          <LawEnforcementForm />
        </aside>
      </div>
    </div>
  );
}
