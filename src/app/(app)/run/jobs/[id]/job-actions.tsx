"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { PhotoPicker } from "@/components/photo-picker";
import { useLiveRow } from "@/components/live-refresh";
import { api, ClientApiError } from "@/lib/client/api";
import { MAX_PIN_ATTEMPTS, type OrderStatus } from "@/lib/domain/orders";

function PinEntry({ onSubmit, busy, error }: { onSubmit: (pin: string) => void; busy: boolean; error?: string }) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  function set(i: number, v: string) {
    const d = v.replace(/\D/g, "");
    if (d.length > 1) {
      // Pasted the whole PIN.
      const next = d.slice(0, 4).padEnd(4, " ").split("").map((c) => c.trim());
      setDigits(next);
      refs.current[Math.min(3, d.length)]?.focus();
      if (d.length >= 4) onSubmit(d.slice(0, 4));
      return;
    }
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 3) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) onSubmit(next.join(""));
  }
  return (
    <div>
      <fieldset>
        <legend className="mb-2 text-small font-medium">Customer&rsquo;s 4-digit PIN</legend>
        <div className="flex gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={d}
              onChange={(e) => set(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              aria-label={`PIN digit ${i + 1}`}
              aria-invalid={!!error || undefined}
              disabled={busy}
              className="tnum h-16 w-14 rounded-sm border-2 border-line bg-surface text-center font-display text-display font-black focus:border-line-strong focus:outline-none aria-invalid:border-danger"
            />
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
      <Button className="mt-3" variant="ink" loading={busy} disabled={!digits.every(Boolean)} onClick={() => onSubmit(digits.join(""))}>
        Complete delivery
      </Button>
    </div>
  );
}

export function JobActions({
  orderId,
  status,
  handoff,
  customerFirst,
  pinAttempts,
  unclaimWillStrike,
}: {
  orderId: string;
  status: OrderStatus;
  handoff: "door" | "lobby" | null;
  customerFirst: string;
  pinAttempts: number;
  unclaimWillStrike: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pickupPhoto, setPickupPhoto] = useState<string | null>(null);
  const [doorPhoto, setDoorPhoto] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string>();
  const [unclaimOpen, setUnclaimOpen] = useState(false);
  const [usePhoto, setUsePhoto] = useState(pinAttempts >= MAX_PIN_ATTEMPTS);
  useLiveRow({ table: "orders", id: orderId, versionUrl: `/api/orders/${orderId}`, enabled: ["claimed", "picked_up", "on_the_way"].includes(status) });

  async function act(action: string, body?: unknown, ok?: string) {
    setBusy(action);
    try {
      await api(`/api/runner/jobs/${orderId}/${action}`, { method: "POST", body: body ?? {} });
      if (ok) toast(ok);
      if (action === "unclaim") router.push("/run");
      router.refresh();
      return true;
    } catch (e) {
      const err = e as ClientApiError;
      if (action === "deliver" && err.code === "wrong_pin") setPinError(err.message);
      else toast(err.message, "error");
      if (err.code === "pin_locked" || /door photo|photo instead/.test(err.message)) setUsePhoto(true);
      router.refresh();
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (status === "claimed") {
    return (
      <div className="flex flex-col gap-4">
        <PhotoPicker
          kind="pickup"
          capture
          label="Photo of the bag"
          hint="Show the name or order number on the bag. It protects you if anything gets disputed."
          onUploaded={setPickupPhoto}
        />
        <Button size="lg" block disabled={!pickupPhoto} loading={busy === "pickup"} onClick={() => act("pickup", { photoId: pickupPhoto }, "Picked up. Customer's been told.")}>
          I have the bag
        </Button>
        <Button variant="ghost" onClick={() => setUnclaimOpen(true)} className="self-start text-ink-2">
          Can&rsquo;t do this one
        </Button>
        <Sheet
          open={unclaimOpen}
          onClose={() => setUnclaimOpen(false)}
          title="Drop this job?"
          footer={
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setUnclaimOpen(false)}>Keep it</Button>
              <Button variant="danger" className="flex-1" loading={busy === "unclaim"} onClick={() => act("unclaim", {}, "Dropped. It's back on the board.")}>Drop it</Button>
            </div>
          }
        >
          <p className="text-body text-ink-2">It goes back on the board for someone else.</p>
          <p className="mt-2 text-body font-semibold">
            {unclaimWillStrike ? "You've already dropped one this week, so this one adds a strike." : "Your first drop this week is free. After that, each one adds a strike."}
          </p>
        </Sheet>
      </div>
    );
  }

  if (status === "picked_up" || status === "on_the_way") {
    return (
      <div className="flex flex-col gap-6">
        {status === "picked_up" && (
          <Button size="lg" variant="secondary" block loading={busy === "depart"} onClick={() => act("depart", {}, `${customerFirst} knows you're coming.`)}>
            Heading over now
          </Button>
        )}
        {!usePhoto ? (
          <div>
            <PinEntry busy={busy === "deliver"} error={pinError} onSubmit={(pin) => { setPinError(undefined); act("deliver", { pin }, "Delivered. Nice."); }} />
            {handoff !== "lobby" && (
              <button type="button" onClick={() => setUsePhoto(true)} className="link mt-4 text-small font-semibold text-ink-2">
                {customerFirst} isn&rsquo;t answering? Leave it at the door
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <PhotoPicker kind="dropoff" capture label="Photo at the door" hint="Show the bag and the room number in the same shot." onUploaded={setDoorPhoto} />
            <Button size="lg" variant="ink" block disabled={!doorPhoto} loading={busy === "deliver"} onClick={() => act("deliver", { photoId: doorPhoto }, "Delivered. Photo saved.")}>
              Complete with photo
            </Button>
            {pinAttempts < MAX_PIN_ATTEMPTS && (
              <button type="button" onClick={() => setUsePhoto(false)} className="link self-start text-small font-semibold text-ink-2">Use the PIN instead</button>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}
