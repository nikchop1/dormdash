import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { q1 } from "@/lib/db";
import { appealableCase, caseForParty } from "@/lib/services/cases";
import { fmtDateTime } from "@/lib/domain/time";
import { Logo } from "@/components/brand";
import { LogoutButton } from "@/components/account-controls";
import { CaseSummary, CaseThread } from "@/components/case-view";
import { Notice, PageHeader, SectionTitle } from "@/components/ui/misc";
import { AppealForm } from "./appeal-form";
import { CaseMessageForm } from "@/app/(app)/cases/[id]/case-forms";

export const metadata: Metadata = { title: "Appeal" };

// The one page a banned runner can reach: see the decision, appeal once within 7 days.
export default async function AppealPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/appeal");
  if (user.profile.status !== "banned") redirect("/home");
  const eligible = await appealableCase(user.id);
  const latest = eligible ?? (await q1<{ id: string }>("select id from public.cases where runner_id = $1 and outcome = 'confirm_theft' order by resolved_at desc limit 1", [user.id]));
  const c = latest ? await caseForParty(user.id, latest.id) : null;

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-16 md:px-6">
      <div className="flex items-center justify-between">
        <Logo />
        <LogoutButton compact className="w-auto" />
      </div>
      <PageHeader overline="Account banned" title="Appeal a decision" />
      {!c ? (
        <Notice tone="info" title="Nothing to appeal">Your account is banned. If you think that&rsquo;s a mistake, email support@dormdash.app.</Notice>
      ) : (
        <div className="flex flex-col gap-8">
          <CaseSummary c={c} role="runner" />
          {c.appealAt ? (
            <Notice tone={c.appealDecision === "overturned" ? "success" : c.appealDecision ? "danger" : "warning"} title={c.appealDecision ? `Appeal ${c.appealDecision}` : "Appeal received"}>
              Sent {fmtDateTime(c.appealAt)}. {c.appealDecision ? "This decision is final." : "An admin will review it and email you. The decision on your appeal is final."}
            </Notice>
          ) : c.canAppeal ? (
            <section>
              <SectionTitle>Your appeal</SectionTitle>
              <p className="mt-1 mb-3 text-small text-ink-2">You get one appeal, within 7 days of the decision. Tell us what happened and anything that supports it.</p>
              <AppealForm caseId={c.id} />
            </section>
          ) : (
            <Notice tone="info" title="The appeal window has closed">Appeals have to be filed within 7 days of the decision.</Notice>
          )}
          <section>
            <SectionTitle>Messages with Dormdash</SectionTitle>
            <div className="mt-3"><CaseThread messages={c.messages} /></div>
            <CaseMessageForm id={c.id} />
          </section>
        </div>
      )}
    </main>
  );
}
