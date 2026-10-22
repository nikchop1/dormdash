"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { SectionTitle } from "@/components/ui/misc";
import { useAction } from "@/lib/client/use-action";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/domain/time";

const OUTCOMES = [
  { k: "confirm_theft", l: "Confirm theft", d: "Lost-food refund, deduct unpaid earnings, permanent ban, block email/phone/NYU ID, drop a level.", runner: true },
  { k: "runner_at_fault", l: "Runner at fault", d: "Counts against the runner and drops them a level. No refund.", runner: true },
  { k: "accident_refund", l: "Accident: refund", d: "Lost-food refund from the Guarantee Fund. No penalty for anyone." },
  { k: "customer_at_fault", l: "Customer at fault", d: "Records a rejected claim on the customer." },
  { k: "no_fault", l: "No fault found", d: "Closes the case. Pending incidents are voided." },
  { k: "dismiss", l: "Dismiss", d: "Not a real case. Pending incidents are voided." },
] as const;

export function ResolveCase({ id, hasRunner }: { id: string; hasRunner: boolean }) {
  const { run, busy } = useAction();
  const [outcome, setOutcome] = useState<string>("");
  const [note, setNote] = useState("");
  return (
    <section>
      <SectionTitle>Decide</SectionTitle>
      <div role="radiogroup" aria-label="Outcome" className="mt-3 flex flex-col gap-2">
        {OUTCOMES.map((o) => {
          const disabled = "runner" in o && o.runner && !hasRunner;
          return (
            <button
              key={o.k}
              type="button"
              role="radio"
              aria-checked={outcome === o.k}
              disabled={disabled}
              onClick={() => setOutcome(o.k)}
              className={cn(
                "rounded-sm border px-3 py-2 text-left text-small transition-colors disabled:opacity-40",
                outcome === o.k ? "border-ink bg-surface shadow-[inset_0_0_0_1.5px_var(--ink)]" : "border-line hover:border-line-strong",
                o.k === "confirm_theft" && outcome === o.k && "border-danger shadow-[inset_0_0_0_1.5px_var(--danger)]",
              )}
            >
              <span className="block font-semibold">{o.l}</span>
              <span className="block text-ink-3">{o.d}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3"><Textarea label="Note (sent to both sides)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="Door photo shows the bag at 1204; no PIN was entered." /></div>
      <Button
        className="mt-3"
        variant={outcome === "confirm_theft" ? "danger" : "ink"}
        block
        loading={!!busy}
        disabled={!outcome}
        onClick={() => run("resolve", `/api/admin/cases/${id}`, { body: { outcome, note }, ok: "Resolved. Both sides were notified." })}
      >
        {outcome === "confirm_theft" ? "Confirm theft and ban" : "Resolve"}
      </Button>
    </section>
  );
}

export function AppealDecision({ id }: { id: string }) {
  const { run, busy } = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="mt-3 flex flex-col gap-2">
      <Textarea label="Note to the runner" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} />
      <p className="text-caption text-ink-3">This decision is final.</p>
      <div className="flex gap-2">
        <Button variant="secondary" loading={busy === "up"} onClick={() => run("up", `/api/admin/cases/${id}/appeal`, { body: { decision: "upheld", note }, ok: "Ban upheld." })}>
          Uphold ban
        </Button>
        <Button variant="ink" loading={busy === "over"} onClick={() => run("over", `/api/admin/cases/${id}/appeal`, { body: { decision: "overturned", note }, ok: "Overturned. Account restored." })}>
          Overturn
        </Button>
      </div>
    </div>
  );
}

export function FlagTotal({ orderId, flagged }: { orderId: string; flagged: boolean }) {
  const { run, busy } = useAction();
  return (
    <Button
      className="mt-2"
      size="sm"
      variant="secondary"
      loading={!!busy}
      onClick={() => run("f", `/api/admin/orders/${orderId}/flag-total`, { body: { flagged: !flagged }, ok: flagged ? "Flag cleared." : "Food total flagged." })}
    >
      {flagged ? "Clear food total flag" : "Flag: total doesn't match receipt"}
    </Button>
  );
}

/** One admin-mediated thread per party. Neither side ever sees the other's messages. */
export function AdminThread({ caseId, party, messages }: { caseId: string; party: "customer" | "runner"; messages: { fromAdmin: boolean; body: string; at: Date }[] }) {
  const { run, busy } = useAction();
  const [body, setBody] = useState("");
  return (
    <section>
      <SectionTitle>Thread with the {party}</SectionTitle>
      <ul className="mt-2 flex flex-col gap-2">
        {messages.map((m, i) => (
          <li key={i} className={cn("max-w-[90%] rounded-sm px-3 py-2 text-small", m.fromAdmin ? "self-end bg-accent-soft" : "self-start bg-sunken")}>
            <p className="text-caption font-semibold text-ink-3">{m.fromAdmin ? "Dormdash team" : party === "customer" ? "Customer" : "Runner"} · <span className="tnum">{fmtDateTime(m.at)}</span></p>
            <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
        {messages.length === 0 && <li className="text-small text-ink-3">No messages.</li>}
      </ul>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          const ok = await run("m", `/api/admin/cases/${caseId}/messages`, { body: { party, body }, ok: `Sent to the ${party}.` });
          if (ok) setBody("");
        }}
      >
        <Textarea label={`Message the ${party}`} value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={2000} />
        <Button type="submit" size="sm" variant="secondary" loading={!!busy} className="self-start">Send</Button>
      </form>
    </section>
  );
}
