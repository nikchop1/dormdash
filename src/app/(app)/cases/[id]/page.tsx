import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { caseForParty } from "@/lib/services/cases";
import { fmtDateTime } from "@/lib/domain/time";
import { CaseSummary, CaseThread } from "@/components/case-view";
import { ButtonLink } from "@/components/ui/button";
import { Notice, PageHeader, SectionTitle } from "@/components/ui/misc";
import { CaseMessageForm, RespondForm } from "./case-forms";

export const metadata: Metadata = { title: "Case" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = await caseForParty(user.id, id);
  if (!c) notFound();
  const role = c.role;

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: role === "runner" ? "/run" : `/orders/${c.order.id}`, label: role === "runner" ? "Run" : "Order" }} overline="Case" title={c.label} />
      <CaseSummary c={c} role={role} />
      {role === "runner" && c.canRespond && (
        <section className="mt-8">
          <SectionTitle>Your side</SectionTitle>
          {c.responseDueAt && <p className="tnum mt-1 text-small text-ink-3">Respond by {fmtDateTime(c.responseDueAt)}.</p>}
          <RespondForm id={c.id} />
        </section>
      )}
      {role === "runner" && c.canAppeal && (
        <Notice tone="warning" className="mt-8" title="You can appeal this once" action={<ButtonLink href="/appeal" size="sm" variant="ink">Appeal</ButtonLink>}>
          Appeals must be filed within 7 days. The decision on your appeal is final.
        </Notice>
      )}
      <section className="mt-8">
        <SectionTitle>Messages with Dormdash</SectionTitle>
        <p className="mt-1 mb-3 text-small text-ink-3">This thread is just you and our team. {c.counterpartFirstName ? `${c.counterpartFirstName} can't see it.` : ""}</p>
        <CaseThread messages={c.messages} />
        <CaseMessageForm id={c.id} />
      </section>
    </div>
  );
}
