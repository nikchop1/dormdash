"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { PhotoPicker } from "@/components/photo-picker";
import { api, ClientApiError } from "@/lib/client/api";

const REASONS = [
  { value: "late", label: "Way too late", hint: "Late orders already get the fee back automatically." },
  { value: "missing", label: "Never got it", hint: "Marked delivered but nothing showed up." },
  { value: "wrong_items", label: "Wrong or missing items", hint: "Photo required." },
  { value: "stolen", label: "Bag was taken", hint: "Left at the door and gone." },
  { value: "wrong_room", label: "Left at the wrong room", hint: "Photo required." },
  { value: "other", label: "Something else", hint: "" },
] as const;

export function ReportForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const needsPhoto = reason === "wrong_items" || reason === "wrong_room";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f: Record<string, string> = {};
    if (!reason) f.reason = "Pick what went wrong.";
    if (description.trim().length < 10) f.description = "Tell us a bit more (10+ characters).";
    if (needsPhoto && !photoId) f.photo = "Add a photo so we can see what happened.";
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}/dispute`, { body: { reason, description, photoId } });
      toast("Report sent. We'll get back to you.");
      router.push(`/orders/${orderId}`);
      router.refresh();
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
      <Textarea
        label="What happened?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={fields.description}
        rows={4}
        maxLength={1000}
        placeholder="Got a veggie wrap instead of chicken over rice. Different name on the bag."
      />
      <PhotoPicker kind="dispute" label={needsPhoto ? "Photo" : "Photo (optional, but it helps)"} error={fields.photo} onUploaded={setPhotoId} />
      <p className="text-small text-ink-3">
        We&rsquo;ll look at your photo, the runner&rsquo;s pickup and drop-off photos, and the PIN log. Refunds go back to your original payment.
      </p>
      <Button type="submit" size="lg" loading={busy} block>
        Send report
      </Button>
    </form>
  );
}
