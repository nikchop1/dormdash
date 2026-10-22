"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Info, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Segmented, Select, Switch, Textarea } from "@/components/ui/form";
import { KeyValue, Money, Notice, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { PhotoPicker } from "@/components/photo-picker";
import { StripeCheckout } from "@/components/stripe-checkout";
import { api, ClientApiError } from "@/lib/client/api";
import { formatCents, type Quote } from "@/lib/domain/pricing";

export type Slot = { iso: string; day: string; time: string };
type B = { id: string; name: string; floors: number; doorRequiresResident: boolean };

export const GUARANTEE_TOOLTIP =
  "If your order is lost or stolen, you get your delivery fee back and your food value as Dormdash credit. If you're not at your door to give your PIN, there's no refund.";

export function OrderForm({
  spot,
  buildings,
  defaults,
  tipPresets,
  maxBags,
  bagFeeCents,
  creditCents,
  useCreditDefault,
  runnersOnShift,
  residentsOnShift,
  nextWindow,
  slots,
  payments,
}: {
  spot: { id: string; name: string; notes: string };
  buildings: B[];
  defaults: { pickupName: string; buildingId: string; floor: string; room: string };
  tipPresets: number[];
  maxBags: number;
  bagFeeCents: number;
  creditCents: number;
  useCreditDefault: boolean;
  runnersOnShift: number;
  residentsOnShift: Record<string, number>;
  nextWindow: string | null;
  slots: Slot[];
  payments: { mode: "stripe" | "demo"; publishableKey: string | null };
}) {
  const router = useRouter();
  const toast = useToast();
  const canAsap = runnersOnShift > 0;
  const [v, setV] = useState({ ...defaults, orderNumber: "", notes: "", foodTotal: "" });
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [when, setWhen] = useState<"asap" | "later">(canAsap ? "asap" : "later");
  const [slot, setSlot] = useState(slots[0]?.iso ?? "");
  const [tipChoice, setTipChoice] = useState<number | "custom">(tipPresets.includes(100) ? 100 : tipPresets[0] ?? 0);
  const [customTip, setCustomTip] = useState("");
  const [bags, setBags] = useState(1);
  const [useCredit, setUseCredit] = useState(useCreditDefault && creditCents > 0);
  const [fetchedQuote, setQuote] = useState<Quote | null>(null);
  const [lobbyQuote, setLobbyQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [checkout, setCheckout] = useState<{ orderId: string; clientSecret: string } | null>(null);

  const building = buildings.find((b) => b.id === v.buildingId);
  const tipCents = tipChoice === "custom" ? Math.round((parseFloat(customTip) || 0) * 100) : tipChoice;
  const floorNum = Number(v.floor);
  const foodCents = Math.round((parseFloat(v.foodTotal) || 0) * 100);
  const quote = v.buildingId && floorNum >= 1 ? fetchedQuote : null;

  // Live, server-computed quote.
  useEffect(() => {
    if (!v.buildingId || !floorNum || floorNum < 1) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spotId: spot.id, buildingId: v.buildingId, floor: floorNum, tipCents: Math.min(Math.max(tipCents, 0), 5000), foodValueCents: Math.min(foodCents, 50000), bags, useCredit }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          setQuote(null);
          setQuoteError(data?.error?.message ?? "Couldn't price this one.");
        } else {
          setQuote(data.quote);
          setLobbyQuote(data.lobbyQuote);
          setQuoteError(undefined);
        }
      } catch {
        /* aborted */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [spot.id, v.buildingId, floorNum, tipCents, foodCents, bags, useCredit]);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setV((s) => ({ ...s, [k]: e.target.value }));
    if (fields[k]) setFields((f) => ({ ...f, [k]: "" }));
  };

  const slotDays = useMemo(() => [...new Set(slots.map((s) => s.day))], [slots]);
  const [slotDay, setSlotDay] = useState(slotDays[0] ?? "");

  function validate() {
    const f: Record<string, string> = {};
    if (!v.pickupName.trim()) f.pickupName = "Whose name is the order under?";
    if (!photoId) f.photo = "Add a screenshot of your order confirmation so the runner grabs the right bag.";
    if (!(foodCents > 0)) f.foodTotal = "Enter the food total from your receipt.";
    if (!v.buildingId) f.buildingId = "Pick where we're delivering.";
    if (!floorNum || floorNum < 1) f.floor = "Enter your floor.";
    else if (building && floorNum > building.floors) f.floor = `${building.name} has ${building.floors} floors.`;
    if (!v.room.trim()) f.room = "Room number is required.";
    if (when === "later" && !slot) f.slot = "Pick a time.";
    if (tipChoice === "custom" && (isNaN(parseFloat(customTip)) || parseFloat(customTip) < 0 || parseFloat(customTip) > 50)) f.tip = "Tips go from $0 to $50.";
    if (when === "asap" && !canAsap) f.when = "Nobody's on shift right now. Schedule it instead.";
    return f;
  }

  function review() {
    const f = validate();
    setFields(f);
    if (Object.keys(f).length) {
      toast(Object.values(f)[0], "error");
      return;
    }
    if (!quote) {
      toast(quoteError ?? "Still pricing this. One sec.", "error");
      return;
    }
    setSheet(true);
  }

  const body = useCallback(
    () => ({
      spotId: spot.id,
      pickupName: v.pickupName,
      orderNumber: v.orderNumber,
      buildingId: v.buildingId,
      floor: floorNum,
      room: v.room,
      notes: v.notes,
      tipCents,
      foodValueCents: foodCents,
      bags,
      useCredit,
      scheduledFor: when === "later" ? slot : null,
      confirmationPhotoId: photoId,
    }),
    [spot.id, v, floorNum, tipCents, foodCents, bags, useCredit, when, slot, photoId],
  );

  async function place() {
    setPlacing(true);
    try {
      const res = await api<{ orderId: string; clientSecret: string | null; mode: string }>("/api/orders", { body: body() });
      if (res.clientSecret && payments.mode === "stripe") {
        setCheckout({ orderId: res.orderId, clientSecret: res.clientSecret });
        setPlacing(false);
        return;
      }
      toast("Order placed. We're finding you a runner.");
      router.push(`/orders/${res.orderId}`);
    } catch (e) {
      const err = e as ClientApiError;
      toast(err.message, "error");
      setFields(err.fields ?? {});
      setPlacing(false);
      if (err.fields) setSheet(false);
    }
  }

  const residentRunners = v.buildingId ? residentsOnShift[v.buildingId] ?? 0 : 0;
  const lobbyPossible = building?.doorRequiresResident;
  const floorSavings = quote && lobbyQuote ? quote.deliveryFeeCents - lobbyQuote.deliveryFeeCents : 0;

  return (
    <div className="flex flex-col gap-8 pb-24">
      {spot.notes && (
        <p className="-mt-2 flex gap-2 text-small text-ink-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {spot.notes}
        </p>
      )}

      <section aria-labelledby="step1" className="flex flex-col gap-5">
        <div className="border-t-2 border-line-strong pt-3">
          <p className="eyebrow">Step 1</p>
          <h2 id="step1" className="text-heading font-semibold">Order it yourself first</h2>
          <p className="mt-1 text-small text-ink-2">
            Place a pickup order with {spot.name} in their app or site, under your name, and pay them directly. We never touch the food money.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name on the order" value={v.pickupName} onChange={set("pickupName")} error={fields.pickupName} autoComplete="off" />
          <Input label="Order number" optional value={v.orderNumber} onChange={set("orderNumber")} autoComplete="off" placeholder="#4821" />
        </div>
        <PhotoPicker
          kind="confirmation"
          label="Confirmation screenshot"
          hint="The receipt screen that shows the spot, your name and the items. Only you, your runner and our team see it."
          error={fields.photo}
          onUploaded={(id) => {
            setPhotoId(id);
            if (id) setFields((f) => ({ ...f, photo: "" }));
          }}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Food total ($)"
            inputMode="decimal"
            value={v.foodTotal}
            onChange={set("foodTotal")}
            error={fields.foodTotal}
            placeholder="14.50"
            hint="From your receipt, before our fees. It caps any food credit if something goes wrong."
          />
          <Select label="Bags" value={String(bags)} onChange={(e) => setBags(Number(e.target.value))} hint={bagFeeCents > 0 ? `${formatCents(bagFeeCents)} per bag after the first` : undefined}>
            {Array.from({ length: maxBags }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </div>
      </section>

      <section aria-labelledby="step2" className="flex flex-col gap-5">
        <div className="border-t-2 border-line-strong pt-3">
          <p className="eyebrow">Step 2</p>
          <h2 id="step2" className="text-heading font-semibold">Where and when</h2>
        </div>
        <Select label="Building" value={v.buildingId} onChange={set("buildingId")} error={fields.buildingId}>
          <option value="">Pick a building</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Floor" inputMode="numeric" value={v.floor} onChange={set("floor")} error={fields.floor} hint={building ? `1 to ${building.floors}` : undefined} />
          <Input label="Room" value={v.room} onChange={set("room")} error={fields.room} />
        </div>
        <Textarea label="Notes for your runner" optional value={v.notes} onChange={set("notes")} maxLength={200} rows={2} placeholder="Knock twice. Roommate's asleep." />

        <div className="flex flex-col gap-3">
          <span className="text-small font-medium">When</span>
          <Segmented
            label="When"
            value={when}
            onChange={setWhen}
            options={[
              { value: "asap", label: canAsap ? "ASAP" : "ASAP (nobody on)" },
              ...(slots.length ? [{ value: "later" as const, label: "Schedule" }] : []),
            ]}
          />
          {when === "asap" && !canAsap && (
            <Notice tone="warning" icon={<TriangleAlert />}>
              Nobody&rsquo;s running right now.{nextWindow ? ` Next crew: ${nextWindow}.` : ""} {slots.length ? "Schedule it for when they're on." : ""}
            </Notice>
          )}
          {when === "later" && slots.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <Select label="Day" value={slotDay} onChange={(e) => { setSlotDay(e.target.value); setSlot(slots.find((s) => s.day === e.target.value)?.iso ?? ""); }}>
                {slotDays.map((d) => <option key={d}>{d}</option>)}
              </Select>
              <Select label="Time" value={slot} onChange={(e) => setSlot(e.target.value)} error={fields.slot} hint="Only times when runners are on shift.">
                {slots.filter((s) => s.day === slotDay).map((s) => (
                  <option key={s.iso} value={s.iso}>{s.time}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="step3" className="flex flex-col gap-4">
        <div className="border-t-2 border-line-strong pt-3">
          <p className="eyebrow">Step 3</p>
          <h2 id="step3" className="text-heading font-semibold">Tip your runner</h2>
          <p className="mt-1 text-small text-ink-2">100% of the tip goes to them. We never take a cut of tips.</p>
        </div>
        <Segmented
          label="Tip"
          value={tipChoice}
          onChange={setTipChoice}
          options={[...tipPresets.map((c) => ({ value: c as number | "custom", label: c === 0 ? "$0" : formatCents(c).replace(".00", "") })), { value: "custom" as const, label: "Other" }]}
        />
        {tipChoice === "custom" && (
          <Input label="Custom tip ($)" inputMode="decimal" value={customTip} onChange={(e) => setCustomTip(e.target.value)} error={fields.tip} placeholder="3.00" />
        )}
        {creditCents > 0 && (
          <div className="border-y border-line">
            <Switch
              label={`Use my ${formatCents(creditCents)} Dormdash credit`}
              description="Pays delivery fees and tips. Your runner still gets paid in full."
              checked={useCredit}
              onChange={setUseCredit}
            />
          </div>
        )}
      </section>

      <Notice tone="accent" icon={<KeyRound />} title="No PIN, no handoff">
        You&rsquo;ll get a 4-digit PIN. Be at your door when your runner says they&rsquo;re 2 minutes out. If you&rsquo;re not there to give the PIN before the
        countdown ends, the runner is paid, may keep the food, and there&rsquo;s no refund.
      </Notice>

      {lobbyPossible && building && (
        <Notice tone="info" icon={<DoorOpen />} title="Door or lobby?">
          {building.name} needs a resident card to get upstairs. If your runner lives there, they come to your door. If not, you meet them in the lobby
          {floorSavings > 0 ? ` and we refund the ${formatCents(floorSavings)} floor add-on automatically` : ""}.{" "}
          {residentRunners > 0
            ? `${residentRunners} ${residentRunners === 1 ? "runner" : "runners"} from ${building.name} ${residentRunners === 1 ? "is" : "are"} on shift now.`
            : "No runners from your building are on shift right now, so plan on the lobby."}
        </Notice>
      )}

      {/* Sticky checkout bar */}
      <div className="safe-bottom fixed inset-x-0 bottom-16 z-30 border-t border-line bg-paper shadow-float md:bottom-0 md:left-56">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-3 md:px-6">
          <div className="flex-1">
            <p className="text-caption text-ink-3">{quote?.surgeLabel ? `Busy pricing ${quote.surgeMultiplier}x · you pay` : "You pay Dormdash"}</p>
            {quote ? (
              <Money cents={quote.chargeCents} className="font-display text-title font-extrabold" />
            ) : quoteError ? (
              <p className="text-small text-danger">{quoteError}</p>
            ) : (
              <Skeleton className="mt-1 h-7 w-20" />
            )}
          </div>
          <Button size="lg" onClick={review} disabled={!quote}>
            Review
          </Button>
        </div>
      </div>

      <Sheet
        open={sheet}
        onClose={() => !placing && !checkout && setSheet(false)}
        title="Confirm and pay"
        description={`${spot.name} to ${building?.name ?? ""}, floor ${v.floor}, room ${v.room}`}
      >
        {quote && (
          <div className="flex flex-col gap-4">
            <KeyValue
              items={[
                { k: "Base fee", v: formatCents(quote.baseFeeCents) },
                { k: `Distance (${quote.distanceMiles.toFixed(2)} mi)`, v: formatCents(quote.distanceFeeCents) },
                { k: `Floor ${v.floor}`, v: formatCents(quote.floorFeeCents) },
                { k: `Order size (${formatCents(foodCents)} of food)`, v: formatCents(quote.sizeFeeCents) },
                ...(quote.surgeFeeCents > 0 ? [{ k: `Busy pricing (${quote.surgeMultiplier}x)`, v: formatCents(quote.surgeFeeCents) }] : []),
                ...(quote.bagFeeCents > 0 ? [{ k: `Extra bags (${bags - 1})`, v: formatCents(quote.bagFeeCents) }] : []),
                { k: "Delivery fee", v: formatCents(quote.deliveryFeeCents), strong: true },
                { k: "Tip (all to your runner)", v: formatCents(quote.tipCents) },
                {
                  k: (
                    <span className="inline-flex items-center gap-1.5">
                      Delivery guarantee
                      <span title={GUARANTEE_TOOLTIP} aria-label={GUARANTEE_TOOLTIP} className="inline-flex text-ink-3">
                        <ShieldCheck className="size-4" aria-hidden />
                      </span>
                    </span>
                  ),
                  v: formatCents(quote.guaranteeCents),
                },
                ...(quote.creditAppliedCents > 0 ? [{ k: "Dormdash credit", v: <span className="text-success">{formatCents(-quote.creditAppliedCents)}</span> }] : []),
                { k: "You pay", v: <span className="font-display text-title font-extrabold">{formatCents(quote.chargeCents)}</span>, strong: true },
              ]}
            />
            <p className="rounded-sm bg-sunken px-3 py-2 text-small text-ink-2">
              <span className="font-semibold text-ink">Delivery guarantee.</span> {GUARANTEE_TOOLTIP}
            </p>
            <p className="text-small text-ink-3">
              This is only the delivery. Your food is paid to {spot.name} separately. Cancel free until a runner claims it.
              {when === "later" ? " Scheduled orders are priced for their delivery time." : ""}
            </p>
            {checkout && payments.publishableKey ? (
              <StripeCheckout
                publishableKey={payments.publishableKey}
                clientSecret={checkout.clientSecret}
                orderId={checkout.orderId}
                amountCents={quote.chargeCents}
                onPaid={() => {
                  toast("Paid. We're finding you a runner.");
                  router.push(`/orders/${checkout.orderId}`);
                }}
                onError={(m) => toast(m, "error")}
              />
            ) : (
              <>
                {payments.mode === "demo" && quote.chargeCents > 0 && (
                  <p className="rounded-sm bg-sunken px-3 py-2 text-small text-ink-2">
                    <span className="font-semibold text-ink">Demo payments.</span> No card is charged. Everything else works for real.
                  </p>
                )}
                <Button size="lg" block loading={placing} onClick={place}>
                  {quote.chargeCents === 0 ? "Place order with credit" : payments.mode === "stripe" ? "Continue to payment" : `Pay ${formatCents(quote.chargeCents)} and place order`}
                </Button>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
