"use client";

import { useState } from "react";
import { CloudRain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/form";
import { SectionTitle } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/client/use-action";
import { formatCents, type PricingSettings, type SurgeWindow } from "@/lib/domain/pricing";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toHm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function WeatherToggle({ on, multiplier }: { on: boolean; multiplier: number }) {
  const { run, busy } = useAction();
  return (
    <section className="mt-6">
      <SectionTitle>Bad weather</SectionTitle>
      <div className="flex items-center justify-between gap-4 py-3">
        <p className="flex items-start gap-3 text-small text-ink-2">
          <CloudRain className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>Manual switch for rain, snow, or anything that makes runners not want to go out. Applies {multiplier}x to delivery fees until you turn it off.</span>
        </p>
        <Button variant={on ? "danger" : "ink"} loading={!!busy} onClick={() => run("w", "/api/admin/weather", { body: { on: !on }, ok: on ? "Weather surge off." : "Weather surge on. Runners were pinged." })}>
          {on ? "Turn off" : "Turn on"}
        </Button>
      </div>
    </section>
  );
}

type W = SurgeWindow & { id: string };

function WindowEditor({ w, onDone }: { w?: W; onDone: () => void }) {
  const { run, busy } = useAction();
  const [v, setV] = useState({ label: w?.label ?? "", days: w?.days ?? [], start: toHm(w?.startMinute ?? 21 * 60), end: toHm(w?.endMinute ?? 60), multiplier: String(w?.multiplier ?? 1.5), active: w?.active ?? true });
  async function save() {
    const ok = await run("save", w ? `/api/admin/surge/${w.id}` : "/api/admin/surge", {
      method: w ? "PATCH" : "POST",
      body: { label: v.label, days: v.days, startMinute: fromHm(v.start), endMinute: fromHm(v.end), multiplier: Number(v.multiplier), active: v.active },
      ok: "Surge window saved.",
    });
    if (ok) onDone();
  }
  return (
    <div className="flex flex-col gap-4">
      <Input label="Label (customers see it)" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />
      <fieldset>
        <legend className="mb-1.5 text-small font-medium">Days it starts on</legend>
        <div className="flex flex-wrap gap-1">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={v.days.includes(i)}
              onClick={() => setV({ ...v, days: v.days.includes(i) ? v.days.filter((x) => x !== i) : [...v.days, i].sort() })}
              className={cn("h-9 rounded-xs px-3 text-small font-semibold", v.days.includes(i) ? "bg-ink-fill text-on-ink-fill" : "bg-sunken text-ink-2")}
            >
              {d}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Starts" type="time" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} />
        <Input label="Ends" type="time" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} hint="Before start = past midnight" />
        <Input label="Multiplier" inputMode="decimal" value={v.multiplier} onChange={(e) => setV({ ...v, multiplier: e.target.value })} />
      </div>
      <Checkbox label="Active" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
      <div className="flex gap-2">
        <Button loading={busy === "save"} onClick={save}>Save window</Button>
        {w && (
          <Button variant="ghost" loading={busy === "del"} onClick={async () => { if (await run("del", `/api/admin/surge/${w.id}`, { method: "DELETE", ok: "Deleted." })) onDone(); }}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

export function SurgeWindows({ windows }: { windows: W[] }) {
  const [editing, setEditing] = useState<W | "new" | null>(null);
  return (
    <section className="mt-8">
      <SectionTitle action={<Button variant="secondary" size="sm" onClick={() => setEditing("new")}>Add window</Button>}>Scheduled busy pricing</SectionTitle>
      <ul className="divide-y divide-line">
        {windows.map((w) => (
          <li key={w.id} className="flex items-center gap-4 py-3">
            <div className="flex-1">
              <p className="font-semibold">{w.label} {!w.active && <span className="text-small font-normal text-ink-3">(paused)</span>}</p>
              <p className="tnum text-small text-ink-2">{w.days.map((d) => DAYS[d]).join(", ")} · {toHm(w.startMinute)} to {toHm(w.endMinute)} · {w.multiplier}x</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing(w)}>Edit</Button>
          </li>
        ))}
      </ul>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New surge window" : "Edit surge window"}>
        {editing && <WindowEditor w={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </section>
  );
}

const dollars = (c: number) => (c / 100).toFixed(2);
const cents = (s: string) => Math.round(parseFloat(s || "0") * 100);

export function PricingForm({ initial }: { initial: PricingSettings }) {
  const { run, busy } = useAction();
  const [v, setV] = useState({
    base: dollars(initial.baseFeeCents),
    dist: initial.distanceTiers.map((t) => ({ max: String(t.maxMiles), add: dollars(t.addCents) })),
    floors: initial.floorTiers.map((t) => ({ max: t.maxFloor === null ? "" : String(t.maxFloor), add: dollars(t.addCents) })),
    radius: String(initial.maxRadiusMiles),
    weatherMult: String(initial.weatherMultiplier),
    platformPct: String(Math.round(initial.platformFeePct * 100)),
    cancelFee: dollars(initial.cancelFeeCents),
    grace: String(initial.lateGraceMinutes),
    ping: String(initial.unclaimedPingMinutes),
    cancelAfter: String(initial.unclaimedCancelMinutes),
    strikes: String(initial.strikeThreshold),
    maxActive: String(initial.maxActiveOrders),
    freeUnclaims: String(initial.freeUnclaimsPerWeek),
    tips: initial.tipPresets.map(dollars).join(", "),
    hold: String(initial.payoutHoldHours),
    minPayout: dollars(initial.minPayoutCents),
  });
  const f = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  async function save() {
    await run("save", "/api/admin/pricing", {
      method: "PUT",
      ok: "Pricing saved.",
      body: {
        baseFeeCents: cents(v.base),
        distanceTiers: v.dist.map((t) => ({ maxMiles: Number(t.max), addCents: cents(t.add) })),
        floorTiers: v.floors.map((t) => ({ maxFloor: t.max === "" ? null : Number(t.max), addCents: cents(t.add) })),
        maxRadiusMiles: Number(v.radius),
        weatherSurgeOn: initial.weatherSurgeOn,
        weatherMultiplier: Number(v.weatherMult),
        platformFeePct: Number(v.platformPct) / 100,
        cancelFeeCents: cents(v.cancelFee),
        lateGraceMinutes: Number(v.grace),
        unclaimedPingMinutes: Number(v.ping),
        unclaimedCancelMinutes: Number(v.cancelAfter),
        strikeThreshold: Number(v.strikes),
        maxActiveOrders: Number(v.maxActive),
        freeUnclaimsPerWeek: Number(v.freeUnclaims),
        tipPresets: v.tips.split(",").map((t) => cents(t.trim())).filter((n) => !isNaN(n)),
        payoutHoldHours: Number(v.hold),
        minPayoutCents: cents(v.minPayout),
      },
    });
  }

  return (
    <section className="mt-8">
      <SectionTitle>Fees</SectionTitle>
      <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Input label="Base fee ($)" inputMode="decimal" value={v.base} onChange={f("base")} />
        <Input label="Platform cut (% of fee)" inputMode="numeric" value={v.platformPct} onChange={f("platformPct")} hint="Never taken from tips." />
        <Input label="Max radius (mi)" inputMode="decimal" value={v.radius} onChange={f("radius")} />
        <Input label="Weather multiplier" inputMode="decimal" value={v.weatherMult} onChange={f("weatherMult")} />
        <Input label="Runner cancel fee ($)" inputMode="decimal" value={v.cancelFee} onChange={f("cancelFee")} />
        <Input label="Tip buttons ($, comma)" value={v.tips} onChange={f("tips")} />
      </div>

      <h3 className="mt-6 mb-2 text-small font-semibold">Distance add-on (spot to building)</h3>
      <div className="flex flex-col gap-2">
        {v.dist.map((t, i) => (
          <div key={i} className="grid grid-cols-2 gap-3">
            <Input label={`Up to (mi)`} inputMode="decimal" value={t.max} onChange={(e) => setV({ ...v, dist: v.dist.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)) })} />
            <Input label="Add ($)" inputMode="decimal" value={t.add} onChange={(e) => setV({ ...v, dist: v.dist.map((x, j) => (j === i ? { ...x, add: e.target.value } : x)) })} />
          </div>
        ))}
      </div>
      <h3 className="mt-6 mb-2 text-small font-semibold">Floor add-on</h3>
      <div className="flex flex-col gap-2">
        {v.floors.map((t, i) => (
          <div key={i} className="grid grid-cols-2 gap-3">
            <Input label="Up to floor" inputMode="numeric" value={t.max} placeholder="and above" onChange={(e) => setV({ ...v, floors: v.floors.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)) })} hint={i === v.floors.length - 1 ? "Leave blank: every floor above" : undefined} />
            <Input label="Add ($)" inputMode="decimal" value={t.add} onChange={(e) => setV({ ...v, floors: v.floors.map((x, j) => (j === i ? { ...x, add: e.target.value } : x)) })} />
          </div>
        ))}
      </div>

      <SectionTitle className="mt-8">Reliability rules</SectionTitle>
      <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Input label="Late after ETA + (min)" inputMode="numeric" value={v.grace} onChange={f("grace")} hint="Then the fee is auto-refunded." />
        <Input label="Re-ping runners after (min)" inputMode="numeric" value={v.ping} onChange={f("ping")} />
        <Input label="Offer refund-cancel after (min)" inputMode="numeric" value={v.cancelAfter} onChange={f("cancelAfter")} />
        <Input label="Strikes to suspend" inputMode="numeric" value={v.strikes} onChange={f("strikes")} />
        <Input label="Max active orders per runner" inputMode="numeric" value={v.maxActive} onChange={f("maxActive")} />
        <Input label="Free unclaims per week" inputMode="numeric" value={v.freeUnclaims} onChange={f("freeUnclaims")} />
        <Input label="Payout hold (hours)" inputMode="numeric" value={v.hold} onChange={f("hold")} />
        <Input label="Minimum payout ($)" inputMode="decimal" value={v.minPayout} onChange={f("minPayout")} />
      </div>
      <div className="sticky bottom-20 mt-6 flex items-center justify-between gap-4 border-t border-line bg-paper py-3 md:bottom-0">
        <p className="tnum text-small text-ink-2">Example: floor 14, 0.15 mi = {formatCents(cents(v.base) + cents(v.dist.find((t) => 0.15 <= Number(t.max))?.add ?? "0") + cents(v.floors.find((t) => t.max === "" || 14 <= Number(t.max))?.add ?? "0"))} before surge</p>
        <Button onClick={save} loading={!!busy}>Save pricing</Button>
      </div>
    </section>
  );
}
