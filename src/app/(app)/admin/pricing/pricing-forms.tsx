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

type NumKey = { [K in keyof PricingSettings]: PricingSettings[K] extends number ? K : never }[keyof PricingSettings];
/** Plain number settings, grouped. "$" fields are edited in dollars and stored in cents. */
const GROUPS: { title: string; fields: { k: NumKey; l: string; money?: boolean; hint?: string }[] }[] = [
  {
    title: "Order size and guarantee",
    fields: [
      { k: "bagFeeCents", l: "Each extra bag ($)", money: true, hint: "Added after busy pricing." },
      { k: "maxBags", l: "Max bags per order" },
      { k: "guaranteeCents", l: "Delivery guarantee ($)", money: true, hint: "Goes to the Guarantee Fund." },
    ],
  },
  {
    title: "Reliability",
    fields: [
      { k: "lateGraceMinutes", l: "Late after ETA + (min)", hint: "Then the fee is auto-refunded." },
      { k: "unclaimedPingMinutes", l: "Re-ping runners after (min)" },
      { k: "unclaimedCancelMinutes", l: "Offer refund-cancel after (min)" },
      { k: "strikeThreshold", l: "Strikes to suspend" },
      { k: "maxActiveOrders", l: "Max active orders per runner" },
      { k: "freeUnclaimsPerWeek", l: "Free drops per week" },
      { k: "headingHomeRadiusMiles", l: "Heading-home pickup radius (mi)" },
    ],
  },
  {
    title: "Handoff timers",
    fields: [
      { k: "doorCountdownSeconds", l: "Door countdown (s)", hint: "Before “Customer not here” unlocks." },
      { k: "runnerAbsentGraceSeconds", l: "Runner-absent grace (s)", hint: "After “I’m at my door”, then a case opens." },
      { k: "presentWindowAfterSeconds", l: "“I’m at my door” visible for (s)", hint: "After the countdown ends." },
      { k: "pinClaimWindowSeconds", l: "“Gave PIN, no food” window (s)" },
      { k: "missingDeliveryMinutes", l: "Missing delivery after ETA + (min)" },
    ],
  },
  {
    title: "Abuse patterns",
    fields: [
      { k: "noShowWarnCount", l: "No-shows to warn" },
      { k: "noShowReviewCount", l: "No-shows to require review" },
      { k: "noShowWindowDays", l: "No-show window (days)" },
      { k: "patternWindowDays", l: "Pattern window (days)" },
      { k: "patternCounterparties", l: "Distinct counterparties to flag" },
      { k: "noShowRatePct", l: "Runner no-show rate to flag (%)" },
      { k: "noShowRateMinOrders", l: "Rate needs at least (orders)" },
      { k: "freeProblemReportsPer30d", l: "Free runner problem reports / 30 days" },
    ],
  },
  {
    title: "Cases and retention",
    fields: [
      { k: "caseResponseHours", l: "Runner response window (h)" },
      { k: "refundTargetHours", l: "Refund target (h)" },
      { k: "appealDays", l: "Appeal window (days)" },
      { k: "evidenceRetentionDays", l: "Keep evidence photos (days)" },
    ],
  },
];

type Tier = Record<string, string>;

export function PricingForm({ initial }: { initial: PricingSettings }) {
  const { run, busy } = useAction();
  const [v, setV] = useState({
    base: dollars(initial.baseFeeCents),
    radius: String(initial.maxRadiusMiles),
    weatherMult: String(initial.weatherMultiplier),
    platformPct: String(Math.round(initial.platformFeePct * 100)),
    cancelFee: dollars(initial.cancelFeeCents),
    tips: initial.tipPresets.map(dollars).join(", "),
  });
  const [tiers, setTiers] = useState<Record<"dist" | "floors" | "sizes" | "levels", Tier[]>>({
    dist: initial.distanceTiers.map((t) => ({ max: String(t.maxMiles), add: dollars(t.addCents) })),
    floors: initial.floorTiers.map((t) => ({ max: t.maxFloor === null ? "" : String(t.maxFloor), add: dollars(t.addCents) })),
    sizes: initial.sizeTiers.map((t) => ({ max: t.maxCents === null ? "" : dollars(t.maxCents), add: dollars(t.addCents) })),
    levels: initial.levelTiers.map((t) => ({ min: String(t.minDeliveries), max: t.maxFoodCents === null ? "" : dollars(t.maxFoodCents) })),
  });
  const [nums, setNums] = useState<Record<string, string>>(() =>
    Object.fromEntries(GROUPS.flatMap((g) => g.fields.map((fl) => [fl.k, fl.money ? dollars(initial[fl.k]) : String(initial[fl.k])]))),
  );
  const f = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const tier = (key: keyof typeof tiers, i: number, field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setTiers({ ...tiers, [key]: tiers[key].map((x, j) => (j === i ? { ...x, [field]: e.target.value } : x)) });

  async function save() {
    const scalars = Object.fromEntries(GROUPS.flatMap((g) => g.fields.map((fl) => [fl.k, fl.money ? cents(nums[fl.k]) : Number(nums[fl.k])])));
    await run("save", "/api/admin/pricing", {
      method: "PUT",
      ok: "Pricing saved.",
      body: {
        ...initial,
        ...scalars,
        baseFeeCents: cents(v.base),
        distanceTiers: tiers.dist.map((t) => ({ maxMiles: Number(t.max), addCents: cents(t.add) })),
        floorTiers: tiers.floors.map((t) => ({ maxFloor: t.max === "" ? null : Number(t.max), addCents: cents(t.add) })),
        sizeTiers: tiers.sizes.map((t) => ({ maxCents: t.max === "" ? null : cents(t.max), addCents: cents(t.add) })),
        levelTiers: tiers.levels.map((t) => ({ minDeliveries: Number(t.min), maxFoodCents: t.max === "" ? null : cents(t.max) })),
        maxRadiusMiles: Number(v.radius),
        weatherMultiplier: Number(v.weatherMult),
        platformFeePct: Number(v.platformPct) / 100,
        cancelFeeCents: cents(v.cancelFee),
        tipPresets: v.tips.split(",").map((t) => cents(t.trim())).filter((n) => !isNaN(n)),
      },
    });
  }

  const tierRows = (key: keyof typeof tiers, a: { field: string; label: (i: number) => string; numeric?: boolean; blank?: string }, b: { field: string; label: string; blank?: string }) => (
    <div className="flex flex-col gap-2">
      {tiers[key].map((t, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          <Input
            label={a.label(i)}
            inputMode={a.numeric ? "numeric" : "decimal"}
            value={t[a.field]}
            placeholder={a.blank}
            onChange={tier(key, i, a.field)}
            hint={a.blank && i === tiers[key].length - 1 ? `Leave blank: ${a.blank}` : undefined}
          />
          <Input label={b.label} inputMode="decimal" value={t[b.field]} placeholder={b.blank} onChange={tier(key, i, b.field)} />
        </div>
      ))}
    </div>
  );

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
      {tierRows("dist", { field: "max", label: () => "Up to (mi)" }, { field: "add", label: "Add ($)" })}
      <h3 className="mt-6 mb-2 text-small font-semibold">Floor add-on</h3>
      {tierRows("floors", { field: "max", label: () => "Up to floor", numeric: true, blank: "every floor above" }, { field: "add", label: "Add ($)" })}
      <h3 className="mt-6 mb-2 text-small font-semibold">Order size add-on (by food total)</h3>
      {tierRows("sizes", { field: "max", label: () => "Food up to ($)", blank: "everything above" }, { field: "add", label: "Add ($)" })}

      <SectionTitle className="mt-8">Runner levels</SectionTitle>
      <p className="mt-1 mb-3 text-small text-ink-3">Max food value per order. Active food value can&rsquo;t exceed twice that. An upheld case drops a runner one level.</p>
      {tierRows("levels", { field: "min", label: (i) => `Level ${i + 1} from (deliveries)`, numeric: true }, { field: "max", label: "Max food per order ($)", blank: "no limit" })}

      {GROUPS.map((g) => (
        <div key={g.title}>
          <SectionTitle className="mt-8">{g.title}</SectionTitle>
          <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">
            {g.fields.map((fl) => (
              <Input key={fl.k} label={fl.l} hint={fl.hint} inputMode="decimal" value={nums[fl.k]} onChange={(e) => setNums({ ...nums, [fl.k]: e.target.value })} />
            ))}
          </div>
        </div>
      ))}

      <div className="sticky bottom-20 mt-6 flex items-center justify-between gap-4 border-t border-line bg-paper py-3 md:bottom-0">
        <p className="tnum text-small text-ink-2">
          Example: floor 14, 0.15 mi = {formatCents(cents(v.base) + cents(tiers.dist.find((t) => 0.15 <= Number(t.max))?.add ?? "0") + cents(tiers.floors.find((t) => t.max === "" || 14 <= Number(t.max))?.add ?? "0"))} before size, bags and surge
        </p>
        <Button onClick={save} loading={!!busy}>Save pricing</Button>
      </div>
    </section>
  );
}
