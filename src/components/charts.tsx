"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/domain/pricing";

/**
 * Single-series bar chart. One series means one color (ink) and no legend; the
 * title names it. Bars have 4px rounded data-ends anchored to the baseline, a 2px
 * gap between them, a recessive baseline, and a hover tooltip per bar.
 */
export function BarChart({
  data,
  label,
  format: kind = "count",
  height = 160,
}: {
  data: { key: string; label: string; value: number }[];
  label: string;
  /** A string, not a function, so server components can pass it. */
  format?: "count" | "cents";
  height?: number;
}) {
  const format = (n: number) => (kind === "cents" ? formatCents(n) : String(n));
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const h = hover !== null ? data[hover] : null;
  return (
    <figure className="relative">
      <div className="mb-2 flex h-5 items-baseline justify-between text-small" aria-hidden>
        <span className="tnum text-ink-3">max {format(max)}</span>
        {h && (
          <span className="tnum">
            <span className="text-ink-3">{h.label} · </span>
            <span className="font-semibold">{format(h.value)}</span>
          </span>
        )}
      </div>
      <div className="flex items-end gap-[2px] border-b border-line" style={{ height }} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div
            key={d.key}
            className="group relative flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            tabIndex={-1}
            title={`${d.label}: ${format(d.value)}`}
          >
            <div
              className={cn("w-full rounded-t-[4px] transition-colors duration-[120ms]", hover === i ? "bg-accent" : "bg-ink-fill")}
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <figcaption className="tnum mt-1.5 flex justify-between text-caption text-ink-3">
        <span>{data[0]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </figcaption>
    </figure>
  );
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Weekday × hour heatmap. Sequential single hue (mustard), light to dark; empty cells stay paper. */
export function Heatmap({ cells }: { cells: { dow: number; hour: number; orders: number }[] }) {
  const [hover, setHover] = useState<{ dow: number; hour: number; n: number } | null>(null);
  const max = Math.max(1, ...cells.map((c) => c.orders));
  const get = (d: number, h: number) => cells.find((c) => c.dow === d && c.hour === h)?.orders ?? 0;
  // Five sequential steps: more accent over the surface = more orders, in both themes.
  const step = (n: number) => (n === 0 ? 0 : Math.min(5, Math.ceil((n / max) * 5)));
  const fills = ["var(--surface)", ...[15, 35, 60, 85].map((n) => `color-mix(in oklab, var(--accent) ${n}%, var(--surface))`), "var(--accent)"];
  return (
    <figure>
      <div className="mb-2 flex h-5 items-baseline justify-between text-small" aria-live="polite">
        <span className="text-ink-3">Hour of day, New York time</span>
        {hover && (
          <span className="tnum">
            <span className="text-ink-3">{DOW[hover.dow]} {hover.hour}:00 · </span>
            <span className="font-semibold">{hover.n} orders</span>
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-[2px]" onMouseLeave={() => setHover(null)}>
          <caption className="sr-only">Orders by weekday and hour</caption>
          <thead>
            <tr>
              <th className="w-10" aria-hidden />
              {Array.from({ length: 24 }).map((_, h) => (
                <th key={h} scope="col" className="tnum text-[10px] font-medium text-ink-3">{h % 3 === 0 ? h : ""}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDER.map((d) => (
              <tr key={d}>
                <th scope="row" className="pr-1 text-left text-caption font-medium text-ink-3">{DOW[d]}</th>
                {Array.from({ length: 24 }).map((_, h) => {
                  const n = get(d, h);
                  return (
                    <td
                      key={h}
                      onMouseEnter={() => setHover({ dow: d, hour: h, n })}
                      title={`${DOW[d]} ${h}:00, ${n} orders`}
                      className="h-6 rounded-[2px] border border-line/60"
                      style={{ background: fills[step(n)] }}
                    >
                      <span className="sr-only">{n}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="mt-2 flex items-center gap-2 text-caption text-ink-3">
        Fewer
        {fills.map((f, i) => (
          <span key={i} aria-hidden className="h-3 w-5 rounded-[2px] border border-line/60" style={{ background: f }} />
        ))}
        More
      </figcaption>
    </figure>
  );
}
