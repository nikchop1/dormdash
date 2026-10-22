import { Clock } from "lucide-react";
import { formatCents } from "@/lib/domain/pricing";
import { formatMiles } from "@/lib/domain/geo";
import { FloorBadge } from "@/components/ui/misc";

export type BoardJob = {
  id: string;
  spotName: string;
  buildingShort: string;
  floor: number;
  distanceMiles: number;
  payCents: number;
  tipCents: number;
  waitedMin: number;
  scheduledLabel?: string | null;
  surge?: boolean;
};

export type BoardBatch = { key: string; buildingShort: string; jobs: BoardJob[] };

/**
 * The job board as a dense list (how real dispatch boards scan), not a card gallery.
 * Pure presentation: `action` renders the claim control so this also works on the landing page.
 */
export function JobRows({ jobs, action }: { jobs: BoardJob[]; action?: (job: BoardJob) => React.ReactNode }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {jobs.map((j) => (
        <li key={j.id} className="flex items-center gap-3 py-3">
          <FloorBadge floor={j.floor} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{j.spotName}</p>
            <p className="tnum truncate text-small text-ink-3">
              {formatMiles(j.distanceMiles)} to {j.buildingShort}
              {j.scheduledLabel ? ` · for ${j.scheduledLabel}` : ` · ${j.waitedMin} min ago`}
            </p>
          </div>
          <div className="text-right">
            <p className="tnum font-display text-heading leading-none font-extrabold">{formatCents(j.payCents)}</p>
            <p className="tnum mt-0.5 text-caption text-ink-3">{j.tipCents > 0 ? `incl. ${formatCents(j.tipCents)} tip` : j.surge ? "busy pay" : "no tip"}</p>
          </div>
          {action?.(j)}
        </li>
      ))}
    </ul>
  );
}

export function BatchSummary({ batch, action }: { batch: BoardBatch; action?: React.ReactNode }) {
  const total = batch.jobs.reduce((s, j) => s + j.payCents, 0);
  const spots = [...new Set(batch.jobs.map((j) => j.spotName))];
  return (
    <div className="rounded-md border border-line-strong bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold tracking-wide text-accent-ink uppercase">Batch · {batch.jobs.length} orders</p>
          <p className="mt-1 font-semibold">{spots.join(" + ")}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-small text-ink-2">
            <Clock className="size-3.5" aria-hidden /> One trip to {batch.buildingShort}, then up the elevator
          </p>
        </div>
        <p className="tnum font-display text-title leading-none font-extrabold">{formatCents(total)}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {batch.jobs.map((j) => (
          <FloorBadge key={j.id} floor={j.floor} size="sm" />
        ))}
        <span className="ml-1 text-caption text-ink-3">floors in elevator order</span>
      </div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
