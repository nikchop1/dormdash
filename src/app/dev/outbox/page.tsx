import { notFound } from "next/navigation";
import { devToolsEnabled, firstLink, outbox } from "@/lib/dev";
import { fmtDateTime } from "@/lib/domain/time";
import { EmptyState, PageHeader } from "@/components/ui/misc";

// Reads live data (settings / database), so never prerender at build time.
export const dynamic = "force-dynamic";

export const metadata = { title: "Dev outbox" };

export default async function OutboxPage() {
  if (!devToolsEnabled()) notFound();
  const mails = await outbox();
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16">
      <PageHeader overline="Local mode only" title="Dev outbox">
        Every email the app would have sent. Configure RESEND_API_KEY (and Supabase) to send real ones.
      </PageHeader>
      {mails.length === 0 ? (
        <EmptyState title="Inbox zero">Sign up or reset a password and the email lands here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {mails.map((m) => {
            const link = firstLink(m.text);
            return (
              <li key={m.id} className="py-4">
                <p className="text-caption text-ink-3 tnum">{fmtDateTime(m.created_at)} · to {m.to_email}</p>
                <p className="mt-1 font-semibold">{m.subject}</p>
                <pre className="mt-2 font-sans text-small whitespace-pre-wrap text-ink-2">{m.text.replace(/https?:\/\/\S+/g, "")}</pre>
                {link && (
                  <a href={link} className="link mt-2 inline-block text-small font-semibold break-all">
                    Open link
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
