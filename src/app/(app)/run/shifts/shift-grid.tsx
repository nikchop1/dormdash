"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import { hourLabel } from "@/lib/domain/time";

// Monday-first like a real calendar; values are Postgres-style (0 = Sunday).
const DAYS = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 0, l: "Sun" },
];
// Delivery day runs 10am to 2am.
const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1];

export function ShiftGrid({ initial, coverage }: { initial: string[]; coverage: Record<string, number> }) {
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = useState(new Set(initial));
  const [busy, setBusy] = useState(false);
  const dirty = sel.size !== initial.length || [...sel].some((k) => !initial.includes(k));

  function toggle(k: string) {
    const next = new Set(sel);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSel(next);
  }

  async function save() {
    setBusy(true);
    try {
      const slots = [...sel].map((k) => {
        const [d, h] = k.split("-").map(Number);
        return { day: d, hour: h };
      });
      await api("/api/runner/shifts", { method: "PUT", body: { slots } });
      toast(`Saved ${slots.length} hours a week.`);
      router.refresh();
    } catch (e) {
      toast((e as ClientApiError).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <table className="w-full min-w-[520px] border-collapse text-small">
          <caption className="sr-only">Weekly availability. Each cell is one hour.</caption>
          <thead>
            <tr>
              <th scope="col" className="w-14" />
              {DAYS.map((d) => (
                <th key={d.v} scope="col" className="pb-2 text-center text-caption font-semibold tracking-wide text-ink-3 uppercase">{d.l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <th scope="row" className="tnum pr-2 text-right text-caption font-medium text-ink-3">{hourLabel(h)}</th>
                {DAYS.map((d) => {
                  // Hours after midnight belong to the previous evening's shift day.
                  const day = h < 10 ? (d.v + 1) % 7 : d.v;
                  const k = `${day}-${h}`;
                  const on = sel.has(k);
                  const others = (coverage[k] ?? 0) - (initial.includes(k) ? 1 : 0);
                  const thin = others < 2;
                  return (
                    <td key={k} className="p-0.5">
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${d.l} ${hourLabel(h)}${on ? ", selected" : ""}${thin ? ", thin coverage" : ""}`}
                        onClick={() => toggle(k)}
                        className={cn(
                          "tnum flex h-9 w-full items-center justify-center rounded-xs text-caption font-semibold transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
                          on ? "bg-ink-fill text-accent" : "bg-surface text-ink-3 hover:bg-sunken",
                          !on && thin && "border border-dashed border-warning",
                        )}
                      >
                        {others > 0 ? others : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-ink-3">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-xs bg-ink-fill" aria-hidden /> You</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-xs border border-dashed border-warning bg-surface" aria-hidden /> Thin coverage</span>
        <span>Numbers: other runners that hour</span>
      </div>
      <div className="sticky bottom-20 mt-6 flex items-center justify-between gap-4 border-t border-line bg-paper py-3 md:bottom-0">
        <p className="tnum text-small text-ink-2">{sel.size} hours a week</p>
        <Button onClick={save} loading={busy} disabled={!dirty}>Save shifts</Button>
      </div>
    </div>
  );
}
