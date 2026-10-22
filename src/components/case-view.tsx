import { formatCents } from "@/lib/domain/pricing";
import { fmtDateTime } from "@/lib/domain/time";
import { cn } from "@/lib/cn";
import { KeyValue, Notice, SectionTitle, Tag } from "@/components/ui/misc";
import type { PartyCaseView } from "@/lib/services/cases";

const STATUS_TONE = { open: "warning", under_review: "accent", resolved: "success" } as const;

/**
 * What a customer or runner sees about a case: status, a plain timeline, the outcome,
 * and exactly what was refunded as cash vs credit. Never the other party's last name,
 * phone, email, NYU ID or location.
 */
export function CaseSummary({ c, role }: { c: PartyCaseView; role: "customer" | "runner" }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={c.autoRejected ? "danger" : STATUS_TONE[c.status]}>{c.autoRejected ? "Rejected" : c.statusLabel}</Tag>
        <span className="text-small text-ink-2">
          Order {c.order.code} · {c.order.spotName} to {c.order.building}, floor {c.order.floor}
          {role === "runner" ? `, room ${c.order.room}` : ""}
        </span>
      </div>

      {c.description && (
        <section>
          <SectionTitle>{role === "customer" ? "What you reported" : "The report"}</SectionTitle>
          <p className="mt-2 text-body">{c.description}</p>
          <p className="tnum mt-1 text-caption text-ink-3">{fmtDateTime(c.createdAt)}</p>
        </section>
      )}

      {(c.outcome || c.autoRejected) && (
        <section>
          <SectionTitle>Outcome</SectionTitle>
          <Notice tone={c.autoRejected ? "danger" : "success"} title={c.outcome ?? "Rejected"} className="mt-2">
            {c.outcomeNote}
          </Notice>
          {c.refundCashCents + c.refundCreditCents > 0 && (
            <KeyValue
              className="mt-3"
              items={[
                { k: "Back to the original payment method", v: formatCents(c.refundCashCents) },
                { k: "Dormdash credit (food value, fees paid with credit)", v: formatCents(c.refundCreditCents) },
              ]}
            />
          )}
          {c.refundCreditCents > 0 && role === "customer" && (
            <p className="mt-2 text-small text-ink-3">Credit pays delivery fees and tips on future orders. It has no cash value, can&rsquo;t be withdrawn or transferred, and never expires.</p>
          )}
          {c.appealDecision && <p className="mt-2 text-small font-semibold">Appeal {c.appealDecision}. This decision is final.</p>}
        </section>
      )}

      {c.runnerResponse && (
        <section>
          <SectionTitle>{role === "runner" ? "Your response" : "The runner's response"}</SectionTitle>
          <p className="mt-2 text-body text-ink-2">{c.runnerResponse}</p>
        </section>
      )}

      <section>
        <SectionTitle>Timeline</SectionTitle>
        <ol className="mt-2 divide-y divide-line">
          {c.timeline.map((t, i) => (
            <li key={i} className="flex justify-between gap-4 py-2 text-small">
              <span>{t.label}</span>
              <span className="tnum text-ink-3">{fmtDateTime(t.at)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function CaseThread({ messages }: { messages: PartyCaseView["messages"] }) {
  if (messages.length === 0) return <p className="text-small text-ink-3">No messages yet. Anything you send goes only to the Dormdash team.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {messages.map((m, i) => (
        <li key={i} className={cn("max-w-[85%] rounded-sm px-3 py-2 text-small", m.fromAdmin ? "self-start bg-sunken" : "self-end bg-accent-soft")}>
          <p className="text-caption font-semibold text-ink-3">{m.fromAdmin ? "Dormdash team" : "You"} · <span className="tnum">{fmtDateTime(m.at)}</span></p>
          <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
        </li>
      ))}
    </ul>
  );
}
