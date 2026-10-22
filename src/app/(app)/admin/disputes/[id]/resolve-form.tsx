"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Textarea } from "@/components/ui/form";
import { SectionTitle } from "@/components/ui/misc";
import { useAction } from "@/lib/client/use-action";

const ACTIONS = [
  { k: "refund_fee", l: "Refund delivery fee", d: "Runner's fee share is clawed back." },
  { k: "refund_tip", l: "Refund tip", d: "Clawed back from the runner." },
  { k: "strike", l: "Give the runner a strike", d: "Counts toward auto-suspension." },
  { k: "ban", l: "Suspend the runner", d: "Stops them running until reinstated." },
  { k: "dismiss", l: "Dismiss", d: "No action. Can't combine with others." },
] as const;

export function ResolveForm({ id, hasRunner, feeAlreadyRefunded, hasTip }: { id: string; hasRunner: boolean; feeAlreadyRefunded: boolean; hasTip: boolean }) {
  const { run, busy } = useAction();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  function toggle(k: string) {
    const next = new Set(sel);
    if (k === "dismiss") {
      setSel(next.has(k) ? new Set() : new Set([k]));
      return;
    }
    next.delete("dismiss");
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSel(next);
  }
  const disabled = (k: string) => ((k === "strike" || k === "ban") && !hasRunner) || (k === "refund_fee" && feeAlreadyRefunded) || (k === "refund_tip" && !hasTip);
  return (
    <section>
      <SectionTitle>Decide</SectionTitle>
      <div className="mt-3 flex flex-col gap-3">
        {ACTIONS.map((a) => (
          <Checkbox
            key={a.k}
            checked={sel.has(a.k)}
            disabled={disabled(a.k)}
            onChange={() => toggle(a.k)}
            label={<><span className="font-semibold">{a.l}</span><span className="block text-ink-3">{a.k === "refund_fee" && feeAlreadyRefunded ? "Already refunded for lateness." : a.d}</span></>}
          />
        ))}
        <Textarea label="Note (sent to both sides)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="Pickup photo shows a different name on the bag." />
        <Button variant="ink" block loading={!!busy} disabled={sel.size === 0} onClick={() => run("resolve", `/api/admin/disputes/${id}`, { body: { actions: [...sel], note }, ok: "Resolved. Both sides were notified." })}>
          Resolve
        </Button>
      </div>
    </section>
  );
}
