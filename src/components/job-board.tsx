import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/domain/pricing";
import { formatMiles } from "@/lib/domain/geo";
import { FloorBadge } from "@/components/ui/misc";

export type BoardJob = {
  id: string;
  spotId: string;
  spotName: string;
  spotLat: number;
  spotLng: number;
  buildingId: string;
  buildingShort: string;
  floor: number;
  distanceMiles: number;
  payCents: number;
  tipCents: number;
  foodValueCents: number;
  waitedMin: number;
  scheduledLabel?: string | null;
  surge?: boolean;
  /** "Unlocks after 4 more deliveries" when above the runner's level limit. */
  locked?: string | null;
  createdAt: string;
};

/**
 * The job board as a dense list (how real dispatch boards scan), not a card gallery.
 * Pure presentation: `action` renders the control so this also works on the landing page.
 */
export function JobRows({ jobs, action }: { jobs: BoardJob[]; action?: (job: BoardJob) => React.ReactNode }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {jobs.map((j) => (
        <li key={j.id} className={cn("flex items-center gap-3 py-3", j.locked && "opacity-55")}>
          <FloorBadge floor={j.floor} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{j.spotName}</p>
            <p className="tnum truncate text-small text-ink-3">
              {j.locked ? (
                <span className="inline-flex items-center gap-1"><Lock className="size-3.5" aria-hidden /> {j.locked}</span>
              ) : (
                <>
                  {formatMiles(j.distanceMiles)} to {j.buildingShort}
                  {j.scheduledLabel ? ` · for ${j.scheduledLabel}` : ` · ${j.waitedMin}m ago`}
                </>
              )}
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

/** A suggested run: total payout up front, then pickups and floors in elevator order. */
export function RunSummary({ label, jobs, action, headingHome }: { label: string; jobs: BoardJob[]; action?: React.ReactNode; headingHome?: boolean }) {
  const spots = [...new Map(jobs.map((j) => [j.spotId, j.spotName])).values()];
  return (
    <div className="rounded-md border border-line-strong bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-semibold tracking-wide text-accent-ink uppercase">{headingHome ? "On your way home" : "Suggested run"}</p>
          <p className="tnum mt-1 font-display text-title leading-none font-extrabold">{label}</p>
          <p className="mt-1.5 truncate text-small text-ink-2">{spots.join(" + ")} to {jobs[0]?.buildingShort}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {jobs.map((j) => (
          <FloorBadge key={j.id} floor={j.floor} size="sm" />
        ))}
        <span className="ml-1 text-caption text-ink-3">floors in elevator order</span>
      </div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
