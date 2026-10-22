"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { LiveCamera, type CapturedPhoto } from "@/components/live-camera";
import { api, ClientApiError } from "@/lib/client/api";

const REASONS = [
  { value: "wrong_items", label: "Wrong or missing items", hint: "We'll look at the receipt and the pickup photo." },
  { value: "never_received", label: "Never received it", hint: "If you gave your PIN, that's proof of handoff and this is rejected." },
  { value: "stolen", label: "It was stolen", hint: "Same: a PIN entry means the bag was handed to you." },
  { value: "other", label: "Something else", hint: "" },
] as const;

export function ReportForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f: Record<string, string> = {};
    if (!reason) f.reason = "Pick what went wrong.";
    if (description.trim().length < 10) f.description = "Tell us a bit more (10+ characters).";
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    try {
      const res = await api<{ caseId: string; autoRejected: boolean }>(`/api/orders/${orderId}/cases`, {
        body: { type: "customer_claim", reason, description, photoId: photo?.id ?? null },
      });
      toast(res.autoRejected ? "This order was completed with your PIN, so the claim was rejected." : "Report sent. A real person will look at it.", res.autoRejected ? "error" : "success");
      router.push(`/cases/${res.caseId}`);
    } catch (err) {
      const e2 = err as ClientApiError;
      toast(e2.message, "error");
      setFields(e2.fields ?? {});
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-2 text-small font-medium">What went wrong?</legend>
        <div role="radiogroup" className="divide-y divide-line border-y border-line">
          {REASONS.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-start gap-3 py-3">
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="mt-1 size-5 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-ink-2 bg-surface checked:border-[6px] checked:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
              <span>
                <span className={cn("block", reason === r.value && "font-semibold")}>{r.label}</span>
                {r.hint && <span className="block text-small text-ink-3">{r.hint}</span>}
              </span>
            </label>
          ))}
        </div>
        {fields.reason && <p role="alert" className="mt-1.5 text-small text-danger">{fields.reason}</p>}
      </fieldset>
      <Textarea label="What happened?" value={description} onChange={(e) => setDescription(e.target.value)} error={fields.description} rows={4} maxLength={1000} placeholder="Got a veggie wrap instead of chicken over rice." />
      <LiveCamera kind="case" orderId={orderId} label="Photo (optional, live camera)" hint="Show what you got. Gallery photos aren't accepted." captured={photo} onCaptured={setPhoto} />
      <p className="text-small text-ink-3">All case conversations go through the Dormdash team. You won&rsquo;t message the runner directly.</p>
      <Button type="submit" size="lg" loading={busy} block>Send report</Button>
    </form>
  );
}
