"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Phone, Star, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useLiveRow } from "@/components/live-refresh";
import { api, ClientApiError } from "@/lib/client/api";
import { formatCents } from "@/lib/domain/pricing";
import type { OrderStatus } from "@/lib/domain/orders";

export function OrderLive({ id, active }: { id: string; active: boolean }) {
  useLiveRow({ table: "orders", id, versionUrl: `/api/orders/${id}`, enabled: active, intervalMs: 3000 });
  return null;
}

/** A ticking clock, started after mount so server and client markup match. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}

export function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Calls go through the server: it logs the tap and returns a tel: target. The number is never rendered. */
export function CallButton({ url, label, className }: { url: string; label: string; className?: string }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      className={className}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { tel } = await api<{ tel: string }>(url, { method: "POST" });
          router.refresh();
          window.location.href = `tel:${tel}`;
        } catch (e) {
          toast((e as ClientApiError).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Phone className="size-4" aria-hidden /> {label}
    </Button>
  );
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
          <span key={i} aria-hidden className="tnum flex h-16 w-14 items-center justify-center rounded-sm bg-on-ink-fill/10 font-display text-display-lg font-black text-accent-on-fill">
            {d}
          </span>
        ))}
      </p>
      <p className="mt-3 text-body font-semibold">Say your PIN as you take the bag.</p>
      <p className="mt-1 text-small opacity-80">
        Food for PIN, {handoff === "lobby" ? "in the lobby" : "at your door"}. No PIN, no handoff. Don&rsquo;t text it ahead of time.
      </p>
    </section>
  );
}

/** Live handoff: heads-up, the door photo + countdown, call button, "I'm at my door", "never arrived". */
export function HandoffPanel(p: {
  orderId: string;
  status: OrderStatus;
  handoff: "door" | "lobby" | null;
  runnerFirstName: string | null;
  headsUp: boolean;
  doorPhotoUrl: string | null;
  atDoorAt: string | null;
  countdownEndsAt: string | null;
  presentUntil: string | null;
  customerPresent: boolean;
  canCall: boolean;
  missingAt: string | null;
  missingNow: boolean;
  missingCaseId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const lobby = p.handoff === "lobby";
  const left = now !== null && p.countdownEndsAt ? new Date(p.countdownEndsAt).getTime() - now : null;
  const presentVisible = !p.customerPresent && !!p.presentUntil && now !== null && now <= new Date(p.presentUntil).getTime();
  const missingVisible = !p.missingCaseId && (p.missingNow || (now !== null && !!p.missingAt && now >= new Date(p.missingAt).getTime()));

  async function present() {
    setBusy("present");
    try {
      await api(`/api/orders/${p.orderId}/present`, { method: "POST" });
      toast("We told your runner you're at the door.");
      router.refresh();
    } catch (e) {
      toast((e as ClientApiError).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function missing() {
    setBusy("missing");
    try {
      const res = await api<{ caseId: string }>(`/api/orders/${p.orderId}/cases`, { body: { type: "missing_delivery", description: "My food never arrived." } });
      router.push(`/cases/${res.caseId}`);
    } catch (e) {
      toast((e as ClientApiError).message, "error");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {p.headsUp && !p.atDoorAt && (
        <Notice tone="accent" icon={<BellRing />} title="Your runner is about 2 minutes away">
          {lobby ? "Come down to the lobby with your PIN." : "Be at your door with your PIN."}
        </Notice>
      )}

      {p.atDoorAt && (
        <section aria-labelledby="door-h" className="overflow-hidden rounded-md border-2 border-line-strong">
          <div className="flex items-start justify-between gap-4 bg-ink-fill px-4 py-3 text-on-ink-fill">
            <div>
              <h2 id="door-h" className="font-display text-title leading-none font-extrabold uppercase">{lobby ? "Your runner is in the lobby" : "Your runner is at your door"}</h2>
              <p className="mt-1 text-small opacity-80">Grab the bag and say your PIN.</p>
            </div>
            <div className="text-right" aria-live="polite">
              <p className="text-caption opacity-70">Time left</p>
              <p className={cn("tnum font-display text-display leading-none font-black", left !== null && left <= 0 ? "opacity-60" : "text-accent-on-fill")}>
                {left === null ? "--:--" : mmss(left)}
              </p>
            </div>
          </div>
          {p.doorPhotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.doorPhotoUrl} alt={lobby ? "Your bag in the lobby" : "Your bag at your door"} className="max-h-80 w-full bg-sunken object-cover" />
          )}
          {left !== null && left <= 0 && <p className="bg-warning-soft px-4 py-2 text-small">The countdown ended. If your runner can&rsquo;t reach you, they can mark you not here and keep the food.</p>}
        </section>
      )}

      {(p.canCall || presentVisible) && (
        <div className="flex flex-wrap gap-2">
          {p.canCall && p.runnerFirstName && <CallButton url={`/api/orders/${p.orderId}/call`} label={`Call ${p.runnerFirstName}`} />}
          {presentVisible && (
            <Button variant="ink" loading={busy === "present"} onClick={present}>
              {lobby ? "I'm in the lobby and the runner isn't here" : "I'm at my door and the runner isn't here"}
            </Button>
          )}
        </div>
      )}
      {p.customerPresent && <p className="text-small text-ink-2">We told your runner you&rsquo;re waiting. If they don&rsquo;t show up with your PIN in a few minutes, we open a case for you automatically.</p>}

      {missingVisible && (
        <Notice tone="danger" icon={<TriangleAlert />} title="Still no sign of your food?" action={<Button variant="danger" size="sm" loading={busy === "missing"} onClick={missing}>My food never arrived</Button>}>
          It was picked up a while ago and your runner never reached you. Report it and we&rsquo;ll look into it right away.
        </Notice>
      )}
      {p.missingCaseId && <Link href={`/cases/${p.missingCaseId}`} className="link text-small font-semibold">View your case</Link>}
    </div>
  );
}

export function OrderActions({
  orderId,
  status,
  cancel,
  rated,
  runnerFirstName,
  pinClaimUntil,
  pinClaimCaseId,
}: {
  orderId: string;
  status: OrderStatus;
  cancel: { refundCents: number; feeCents: number } | null;
  rated: { stars: number; comment: string } | null;
  runnerFirstName: string | null;
  pinClaimUntil: string | null;
  pinClaimCaseId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimText, setClaimText] = useState("");
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const claimLeft = pinClaimUntil && now !== null ? new Date(pinClaimUntil).getTime() - now : null;
  const pinClaimVisible = !pinClaimCaseId && claimLeft !== null && claimLeft > 0;

  async function doCancel() {
    setBusy(true);
    try {
      const res = await api<{ refundedCents: number; creditCents: number }>(`/api/orders/${orderId}/cancel`, { body: { reason: "Cancelled by customer" } });
      const back = res.refundedCents + res.creditCents;
      toast(back > 0 ? `Cancelled. ${formatCents(back)} is on its way back.` : "Cancelled.");
      setCancelOpen(false);
      router.refresh();
    } catch (e) {
      toast((e as ClientApiError).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function pinClaim() {
    setBusy(true);
    try {
      const res = await api<{ caseId: string }>(`/api/orders/${orderId}/cases`, { body: { type: "pin_no_food", description: claimText || "I gave my PIN but didn't get my food." } });
      router.push(`/cases/${res.caseId}`);
    } catch (e) {
      toast((e as ClientApiError).message, "error");
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
      {pinClaimVisible && (
        <div>
          <Button variant="danger" onClick={() => setClaimOpen(true)}>I gave my PIN but didn&rsquo;t get my food</Button>
          <p className="tnum mt-1.5 text-small text-ink-3">Available for {mmss(claimLeft!)} more.</p>
          <Sheet
            open={claimOpen}
            onClose={() => !busy && setClaimOpen(false)}
            title="PIN given, no food?"
            footer={<Button variant="danger" block loading={busy} onClick={pinClaim}>Open a top-priority case</Button>}
          >
            <div className="flex flex-col gap-4">
              <p className="text-body text-ink-2">A PIN entry is normally proof you got the bag, so this goes straight to a Dormdash admin with the door photo and both sides&rsquo; history. False claims count against your account.</p>
              <Textarea label="What happened?" value={claimText} onChange={(e) => setClaimText(e.target.value)} rows={3} maxLength={1000} placeholder="I said the PIN at the door but the runner left with the bag." />
            </div>
          </Sheet>
        </div>
      )}

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
              <Button onClick={rate} loading={busy} className="self-start">Send rating</Button>
            </div>
          )}
        </section>
      )}

      {cancel && (
        <div>
          <Button variant="secondary" onClick={() => setCancelOpen(true)}>Cancel order</Button>
          <Sheet
            open={cancelOpen}
            onClose={() => !busy && setCancelOpen(false)}
            title="Cancel this order?"
            footer={
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={busy} className="flex-1">Keep it</Button>
                <Button variant="danger" onClick={doCancel} loading={busy} className="flex-1">Cancel order</Button>
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
