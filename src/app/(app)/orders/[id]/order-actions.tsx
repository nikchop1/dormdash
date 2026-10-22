"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useLiveRow } from "@/components/live-refresh";
import { api, ClientApiError } from "@/lib/client/api";
import { formatCents } from "@/lib/domain/pricing";
import type { OrderStatus } from "@/lib/domain/orders";

export function OrderLive({ id, active }: { id: string; active: boolean }) {
  useLiveRow({ table: "orders", id, versionUrl: `/api/orders/${id}`, enabled: active });
  return null;
}

export function PinCard({ pin, handoff }: { pin: string; handoff: "door" | "lobby" | null }) {
  return (
    <section aria-labelledby="pin-h" className="rounded-md bg-ink-fill px-5 py-5 text-on-ink-fill">
      <div className="flex items-baseline justify-between">
        <h2 id="pin-h" className="text-caption font-semibold tracking-wide uppercase opacity-80">Handoff PIN</h2>
        <span className="text-caption opacity-70">Only you see this</span>
      </div>
      <p className="mt-3 flex gap-2" aria-label={`PIN ${pin.split("").join(" ")}`}>
        {pin.split("").map((d, i) => (
          <span key={i} aria-hidden className="tnum flex h-16 w-14 items-center justify-center rounded-sm bg-on-ink-fill/10 font-display text-display-lg font-black text-accent">
            {d}
          </span>
        ))}
      </p>
      <p className="mt-3 text-small opacity-80">
        Say it to your runner {handoff === "lobby" ? "in the lobby" : "at the door"} when you have the bag. Don&rsquo;t text it ahead of time.
      </p>
    </section>
  );
}

export function OrderActions({
  orderId,
  status,
  cancel,
  rated,
  runnerFirstName,
}: {
  orderId: string;
  status: OrderStatus;
  cancel: { refundCents: number; feeCents: number } | null;
  rated: { stars: number; comment: string } | null;
  runnerFirstName: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");

  async function doCancel() {
    setBusy(true);
    try {
      const res = await api<{ refundedCents: number }>(`/api/orders/${orderId}/cancel`, { body: { reason: "Cancelled by customer" } });
      toast(res.refundedCents > 0 ? `Cancelled. ${formatCents(res.refundedCents)} is on its way back.` : "Cancelled.");
      setCancelOpen(false);
      router.refresh();
    } catch (e) {
      toast((e as ClientApiError).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function rate() {
    if (!stars) {
      toast("Tap a star first.", "error");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}/rate`, { body: { stars, comment } });
      toast("Thanks. That helps a lot.");
      router.refresh();
    } catch (e) {
      toast((e as ClientApiError).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {status === "delivered" && runnerFirstName && (
        <section aria-labelledby="rate-h" className="border-t-2 border-line-strong pt-3">
          <h2 id="rate-h" className="text-heading font-semibold">{rated ? `You rated ${runnerFirstName}` : `How was ${runnerFirstName}?`}</h2>
          {rated ? (
            <div className="mt-2">
              <StarRow value={rated.stars} />
              {rated.comment && <p className="mt-2 text-small text-ink-2">&ldquo;{rated.comment}&rdquo;</p>}
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              <StarRow value={stars} onChange={setStars} />
              <Textarea label="Anything to add?" optional value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2} placeholder="Fast, friendly, bag was perfect." />
              <Button onClick={rate} loading={busy} className="self-start">
                Send rating
              </Button>
            </div>
          )}
        </section>
      )}

      {cancel && (
        <div>
          <Button variant="secondary" onClick={() => setCancelOpen(true)}>
            Cancel order
          </Button>
          <Sheet
            open={cancelOpen}
            onClose={() => !busy && setCancelOpen(false)}
            title="Cancel this order?"
            footer={
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={busy} className="flex-1">
                  Keep it
                </Button>
                <Button variant="danger" onClick={doCancel} loading={busy} className="flex-1">
                  Cancel order
                </Button>
              </div>
            }
          >
            <p className="text-body text-ink-2">
              {cancel.feeCents > 0
                ? `A runner already claimed it and may be on the way. You get ${formatCents(cancel.refundCents)} back. ${formatCents(cancel.feeCents)} goes to your runner for their time.`
                : `Nobody's claimed it yet, so it's free. You get the full ${formatCents(cancel.refundCents)} back.`}
            </p>
            <p className="mt-3 text-small text-ink-3">Remember to cancel the food order with the restaurant too. We can&rsquo;t do that for you.</p>
          </Sheet>
        </div>
      )}
    </>
  );
}

function StarRow({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div role={onChange ? "radiogroup" : undefined} aria-label={onChange ? "Rating" : `${value} out of 5 stars`} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => onChange(n)}
            className="flex size-11 items-center justify-center rounded-sm hover:bg-sunken focus-visible:outline-2 focus-visible:outline-ink"
          >
            <Star className={cn("size-7 transition-colors duration-[120ms]", n <= value ? "fill-accent text-accent-ink" : "text-ink-3")} strokeWidth={1.5} />
          </button>
        ) : (
          <Star key={n} aria-hidden className={cn("size-6", n <= value ? "fill-accent text-accent-ink" : "text-line")} strokeWidth={1.5} />
        ),
      )}
    </div>
  );
}
