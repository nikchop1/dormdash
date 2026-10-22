"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Flag, MapPin, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { FloorBadge, Notice, Tag } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { LiveCamera, type CapturedPhoto } from "@/components/live-camera";
import { CallButton, mmss, useNow } from "@/app/(app)/orders/[id]/order-actions";
import { api, ClientApiError } from "@/lib/client/api";
import { formatCents } from "@/lib/domain/pricing";
import { currentStopIndex, type Stop } from "@/lib/domain/runs";
import type { OrderStatus } from "@/lib/domain/orders";

export type RunOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  spotId: string;
  spotName: string;
  spotAddress: string;
  spotNotes: string;
  pickupName: string;
  orderNumber: string;
  foodValueCents: number;
  bags: number;
  building: string;
  floor: number;
  room: string;
  notes: string;
  customerFirst: string;
  handoff: "door" | "lobby" | null;
  payCents: number;
  noShowPayCents: number;
  headsUp: boolean;
  atDoorAt: string | null;
  doorLocation: "in_range" | "out_of_range" | "denied" | "unavailable" | null;
  doorPhotoUrl: string | null;
  countdownEndsAt: string | null;
  customerPresent: boolean;
  calls: number;
  pinAttempts: number;
  confirmationUrl: string | null;
  payoutReview: boolean;
};

const PROBLEMS = [
  { v: "restaurant_not_ready", l: "Restaurant not ready" },
  { v: "wrong_order", l: "Wrong order" },
  { v: "spilled_damaged", l: "Spilled or damaged" },
  { v: "cant_enter_building", l: "Can't get into the building" },
];

function useRunActions() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(orderId: string, action: string, body: unknown = {}, ok?: string) {
    setBusy(`${orderId}:${action}`);
    try {
      const res = await api(`/api/runner/jobs/${orderId}/${action}`, { method: "POST", body });
      if (ok) toast(ok);
      router.refresh();
      return res;
    } catch (e) {
      toast((e as ClientApiError).message, "error");
      router.refresh();
      return null;
    } finally {
      setBusy(null);
    }
  }
  return { act, busy, setBusy, router, toast };
}

/** Live updates: refresh when anything on the board or run changes (customer present, cancel...). */
function useRunLive() {
  const router = useRouter();
  const version = useRef<string | null>(null);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/runner/jobs", { cache: "no-store" });
        if (!res.ok) return;
        const { version: v } = await res.json();
        if (version.current && v !== version.current) router.refresh();
        version.current = v;
      } catch {
        /* offline */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [router]);
}

function PinEntry({ onSubmit, busy, error }: { onSubmit: (pin: string) => void; busy: boolean; error?: string }) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  function set(i: number, v: string) {
    const d = v.replace(/\D/g, "");
    if (d.length > 1) {
      const next = d.slice(0, 4).padEnd(4, " ").split("").map((c) => c.trim());
      setDigits(next);
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
    <fieldset>
      <legend className="mb-2 text-small font-medium">Customer&rsquo;s PIN</legend>
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
      {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
    </fieldset>
  );
}

function ProblemSheet({ order, open, onClose }: { order: RunOrder; open: boolean; onClose: () => void }) {
  const { act, busy } = useRunActions();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const ready = reason && note.trim().length >= 5 && photo;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Problem with this order"
      description="Treated as an accident: the customer is refunded. No penalty the first time in 30 days."
      footer={
        <Button
          block
          variant="danger"
          disabled={!ready}
          loading={busy === `${order.id}:problem`}
          onClick={async () => {
            const res = await act(order.id, "problem", { reason, note, photoId: photo!.id }, "Reported. The customer has been refunded.");
            if (res) onClose();
          }}
        >
          Report and end this order
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label="What happened?" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Pick one</option>
          {PROBLEMS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
        </Select>
        <Textarea label="Short note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Bag ripped on the way, soup everywhere." />
        <LiveCamera kind="problem" orderId={order.id} label="Live photo" captured={photo} onCaptured={setPhoto} />
      </div>
    </Sheet>
  );
}

function PickupStop({ orders, active, freeDropsPerWeek }: { orders: RunOrder[]; active: boolean; freeDropsPerWeek: number }) {
  const { act, busy } = useRunActions();
  const [photos, setPhotos] = useState<Record<string, CapturedPhoto | null>>({});
  const [problem, setProblem] = useState<RunOrder | null>(null);
  const [drop, setDrop] = useState<RunOrder | null>(null);
  const first = orders[0];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-small text-ink-2">{first.spotAddress}</p>
        {first.spotNotes && <p className="mt-1 text-small text-ink-3">{first.spotNotes}</p>}
      </div>
      {orders.map((o) => {
        const done = o.status !== "claimed";
        return (
          <div key={o.id} id={`order-${o.id}`} className={cn("border-t border-line pt-3", !active && !done && "opacity-80")}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold">
                {o.pickupName}
                {o.orderNumber ? <span className="tnum font-normal text-ink-2"> · #{o.orderNumber.replace(/^#/, "")}</span> : null}
              </p>
              <span className="tnum text-small text-ink-3">{o.bags} {o.bags === 1 ? "bag" : "bags"} · floor {o.floor}</span>
            </div>
            {o.confirmationUrl && (
              <details className="mt-1">
                <summary className="link cursor-pointer text-small font-semibold">Customer&rsquo;s receipt</summary>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.confirmationUrl} alt="Order confirmation screenshot" className="mt-2 max-h-80 rounded-sm border border-line" />
              </details>
            )}
            {done ? (
              <p className="mt-2 flex items-center gap-1.5 text-small font-semibold text-success"><Check className="size-4" aria-hidden /> Picked up</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <LiveCamera
                  kind="pickup"
                  orderId={o.id}
                  label="Bag photo"
                  hint="Show the name or order number on the bag."
                  captured={photos[o.id] ?? null}
                  onCaptured={(p) => setPhotos((s) => ({ ...s, [o.id]: p }))}
                />
                <Button block disabled={!photos[o.id]} loading={busy === `${o.id}:pickup`} onClick={() => act(o.id, "pickup", { photoId: photos[o.id]!.id }, "Picked up.")}>
                  Picked up
                </Button>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setDrop(o)} className="link text-small font-semibold text-ink-2">Drop this order</button>
                  <button type="button" onClick={() => setProblem(o)} className="link text-small font-semibold text-ink-2">Problem with this order</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {problem && <ProblemSheet order={problem} open={!!problem} onClose={() => setProblem(null)} />}
      <Sheet
        open={!!drop}
        onClose={() => setDrop(null)}
        title="Drop this order?"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setDrop(null)}>Keep it</Button>
            <Button variant="danger" className="flex-1" loading={!!drop && busy === `${drop.id}:drop`} onClick={async () => { if (drop) { await act(drop.id, "drop", {}, "Dropped. It's back on the board."); setDrop(null); } }}>
              Drop it
            </Button>
          </div>
        }
      >
        <p className="text-body text-ink-2">It goes back on the board for someone else. {freeDropsPerWeek > 0 ? `Your first ${freeDropsPerWeek === 1 ? "drop" : `${freeDropsPerWeek} drops`} each week ${freeDropsPerWeek === 1 ? "is" : "are"} free; after that each one is a strike.` : "Each drop is a strike."}</p>
      </Sheet>
    </div>
  );
}

function DeliveryStop({ o, now }: { o: RunOrder; now: number | null }) {
  const { act, busy } = useRunActions();
  const [door, setDoor] = useState<CapturedPhoto | null>(null);
  const [pinError, setPinError] = useState<string>();
  const [problem, setProblem] = useState(false);
  const lobby = o.handoff === "lobby";
  const left = o.countdownEndsAt && now !== null ? new Date(o.countdownEndsAt).getTime() - now : null;
  const canNoShow = !!o.atDoorAt && left !== null && left <= 0 && o.calls > 0 && !o.customerPresent;
  const done = ["delivered", "customer_no_show", "cancelled"].includes(o.status);

  if (done) {
    return (
      <p className={cn("flex items-center gap-1.5 text-small font-semibold", o.status === "delivered" ? "text-success" : "text-ink-2")}>
        <Check className="size-4" aria-hidden />
        {o.status === "delivered" ? `Delivered with PIN · ${formatCents(o.payCents)}` : o.status === "customer_no_show" ? `Customer not here · ${formatCents(o.noShowPayCents)}${o.payoutReview ? " (waiting on review)" : ""}` : "Cancelled"}
      </p>
    );
  }
  if (o.status === "claimed") return <p className="text-small text-ink-3">Pick it up first.</p>;

  return (
    <div className="flex flex-col gap-4">
      {o.notes && <p className="rounded-sm bg-sunken px-3 py-2 text-small">&ldquo;{o.notes}&rdquo;</p>}
      {!o.atDoorAt ? (
        <div className="flex flex-col gap-3">
          <LiveCamera
            kind="door"
            orderId={o.id}
            label={lobby ? "Photo in the lobby" : "Photo at the door"}
            hint={lobby ? "The bag in the lobby, with something that shows where you are." : "The bag and the room number or door sign in the same shot."}
            captured={door}
            onCaptured={setDoor}
          />
          <Button
            block
            size="lg"
            variant="ink"
            disabled={!door}
            loading={busy === `${o.id}:at-door`}
            onClick={() => door && act(o.id, "at-door", { photoId: door.id }, `${o.customerFirst} got your photo. Countdown started.`)}
          >
            <MapPin className="size-5" aria-hidden /> {lobby ? "In the lobby" : "At your door"}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-sm bg-sunken px-4 py-3">
          <span className="text-small">
            <span className="block font-semibold">{lobby ? "You're in the lobby" : "You're at the door"}</span>
            <span className={cn("block", o.doorLocation === "in_range" ? "text-success" : "text-warning")}>
              {o.doorLocation === "in_range" ? "Location verified" : "Location not verified"}
            </span>
          </span>
          <span className="text-right" aria-live="polite">
            <span className="block text-caption text-ink-3">Countdown</span>
            <span className="tnum font-display text-title leading-none font-extrabold">{left === null ? "--:--" : mmss(left)}</span>
          </span>
        </div>
      )}
      {o.customerPresent && (
        <Notice tone="warning" icon={<TriangleAlert />} title={`${o.customerFirst} says they're at the ${lobby ? "lobby" : "door"} now`}>
          Find them and enter their PIN. &ldquo;Customer not here&rdquo; is off for this order.
        </Notice>
      )}
      <p className="text-body font-semibold">Enter the PIN as you hand over the bag.</p>
      <PinEntry
        busy={busy === `${o.id}:deliver`}
        error={pinError}
        onSubmit={async (pin) => {
          setPinError(undefined);
          const res = await act(o.id, "deliver", { pin }, `Delivered. ${formatCents(o.payCents)} is on its way to you.`);
          if (!res) setPinError("That PIN didn't work. Check it with the customer.");
        }}
      />
      <div className="flex flex-wrap gap-2">
        <CallButton url={`/api/runner/jobs/${o.id}/call`} label={`Call ${o.customerFirst}`} />
        {o.atDoorAt && (
          <Button
            variant="secondary"
            disabled={!canNoShow}
            loading={busy === `${o.id}:no-show`}
            onClick={() => act(o.id, "no-show", {}, `Marked not here. You get ${formatCents(o.noShowPayCents)}.`)}
            title={canNoShow ? undefined : "Available after the countdown ends and you've called at least once"}
          >
            Customer not here
          </Button>
        )}
      </div>
      {o.atDoorAt && !canNoShow && !o.customerPresent && (
        <p className="text-small text-ink-3">
          &ldquo;Customer not here&rdquo; becomes available when the countdown ends{o.calls === 0 ? " and you've called at least once" : ""}. You&rsquo;d get the full {formatCents(o.noShowPayCents)} and can keep or toss the food.
        </p>
      )}
      <button type="button" onClick={() => setProblem(true)} className="link inline-flex items-center gap-1.5 self-start text-small font-semibold text-ink-2">
        <Flag className="size-4" aria-hidden /> Problem with this order
      </button>
      <ProblemSheet order={o} open={problem} onClose={() => setProblem(false)} />
    </div>
  );
}

export function RunScreen({ orders, stops, freeDropsPerWeek }: { orders: RunOrder[]; stops: Stop[]; freeDropsPerWeek: number }) {
  useRunLive();
  const now = useNow();
  const { router, toast, busy, setBusy } = useRunActions();
  const current = currentStopIndex(stops);
  const byId = Object.fromEntries(orders.map((o) => [o.id, o]));
  const needsHeadsUp = orders.some((o) => o.status === "picked_up" && !o.headsUp);
  const waiting = orders.filter((o) => o.countdownEndsAt && ["picked_up", "on_the_way"].includes(o.status));

  async function headsUp() {
    setBusy("heads-up");
    try {
      const res = await api<{ notified: number }>("/api/runner/heads-up", { method: "POST" });
      toast(`Heads-up sent to ${res.notified} ${res.notified === 1 ? "customer" : "customers"}.`);
      router.refresh();
    } catch (e) {
      toast((e as ClientApiError).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      {waiting.length > 0 && (
        <section aria-label="Countdowns" className="rounded-md bg-ink-fill px-4 py-3 text-on-ink-fill">
          <p className="text-caption font-semibold tracking-wide uppercase opacity-80">Waiting on PINs</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {waiting.map((o) => {
              const left = now !== null ? new Date(o.countdownEndsAt!).getTime() - now : null;
              return (
                <li key={o.id} className="flex items-center gap-2">
                  <FloorBadge floor={o.floor} size="sm" className="bg-on-ink-fill text-ink-fill" />
                  <span className="tnum font-display text-heading font-extrabold">{left === null ? "--:--" : left > 0 ? mmss(left) : "Time's up"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {needsHeadsUp && (
        <Button size="lg" block loading={busy === "heads-up"} onClick={headsUp}>
          Heading to the building
        </Button>
      )}

      <ol className="flex flex-col gap-3" aria-label="Stops">
        {stops.map((s, i) => {
          const isCurrent = i === current;
          const title = s.kind === "pickup" ? `Pick up at ${s.spotName}` : `Room ${s.order.room}`;
          return (
            <li
              key={s.kind === "pickup" ? `p-${s.spotId}` : `d-${s.order.id}`}
              id={s.kind === "delivery" ? `order-${s.order.id}` : undefined}
              className={cn("rounded-md border p-4", isCurrent ? "border-line-strong border-2 bg-surface" : s.done ? "border-line bg-paper" : "border-line bg-surface")}
            >
              <div className="flex items-center gap-3">
                <span aria-hidden className={cn("tnum flex size-7 shrink-0 items-center justify-center rounded-xs text-small font-bold", s.done ? "bg-success-soft text-success" : isCurrent ? "bg-accent text-on-accent" : "bg-sunken text-ink-2")}>
                  {s.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                </span>
                {s.kind === "delivery" && <FloorBadge floor={s.order.floor} size="sm" />}
                <h2 className={cn("min-w-0 flex-1 font-semibold", s.done && "text-ink-2")}>
                  {/* The room number is what the runner needs at a glance: never truncate it. */}
                  <span className="block truncate">{title}</span>
                  {s.kind === "delivery" && <span className="block truncate text-small font-normal text-ink-3">{byId[s.order.id].building}</span>}
                </h2>
                {s.kind === "delivery" && (
                  <Tag tone={byId[s.order.id].handoff === "lobby" ? "warning" : "neutral"}>{byId[s.order.id].handoff === "lobby" ? "Lobby" : byId[s.order.id].customerFirst}</Tag>
                )}
                {s.kind === "pickup" && <span className="tnum text-small text-ink-3">{s.orders.length} {s.orders.length === 1 ? "order" : "orders"}</span>}
              </div>
              {(isCurrent || !s.done) && (
                <div className="mt-4">
                  {s.kind === "pickup" ? (
                    <PickupStop orders={s.orders.map((x) => byId[x.id])} active={isCurrent} freeDropsPerWeek={freeDropsPerWeek} />
                  ) : (
                    <DeliveryStop o={byId[s.order.id]} now={now} />
                  )}
                </div>
              )}
              {s.done && s.kind === "delivery" && <div className="mt-2"><DeliveryStop o={byId[s.order.id]} now={now} /></div>}
            </li>
          );
        })}
      </ol>
      <p className="flex items-center gap-2 text-small text-ink-3"><Clock className="size-4" aria-hidden /> Deliveries are in elevator order. Countdowns run at the same time, so keep moving while one customer comes to the door.</p>
    </div>
  );
}
