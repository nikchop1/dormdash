import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { REASON_LABEL, type Dispute } from "@/lib/services/disputes";
import { fmtDateTime } from "@/lib/domain/time";
import { Notice, PageHeader, SectionTitle } from "@/components/ui/misc";
import { RespondForm } from "./respond-form";

export const metadata: Metadata = { title: "Problem report" };

export default async function RunnerDisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const d = await asUser(user.id, async (t) => {
    const [row] = await t.query<Dispute & { code: string; spot: string }>(
      `select d.*, o.code, sp.name as spot from public.disputes d join public.orders o on o.id = d.order_id
       join public.pickup_spots sp on sp.id = o.spot_id where d.id = $1`,
      [id],
    );
    return row;
  });
  if (!d || d.runner_id !== user.id) notFound();
  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/run", label: "Run" }} overline={`Order ${d.code} · ${d.spot}`} title="Problem report" />
      <SectionTitle>What the customer said</SectionTitle>
      <p className="mt-2 font-semibold">{REASON_LABEL[d.reason]}</p>
      <p className="mt-1 text-body text-ink-2">{d.description}</p>
      <p className="tnum mt-2 text-caption text-ink-3">{fmtDateTime(d.created_at)}</p>
      <div className="mt-8">
        {d.status === "resolved" ? (
          <Notice tone="success" title="Resolved">{d.resolution_note || "An admin closed this report."}</Notice>
        ) : d.runner_response ? (
          <>
            <SectionTitle>Your side</SectionTitle>
            <p className="mt-2 text-body text-ink-2">{d.runner_response}</p>
            <p className="mt-3 text-small text-ink-3">An admin will decide using both sides, your pickup and drop-off photos, and the PIN log.</p>
          </>
        ) : (
          <RespondForm id={d.id} />
        )}
      </div>
    </div>
  );
}
