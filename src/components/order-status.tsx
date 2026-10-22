import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, STATUS_STEPS, type OrderStatus } from "@/lib/domain/orders";
import { fmtTime } from "@/lib/domain/time";
import { Avatar, FloorBadge, Rating } from "@/components/ui/misc";
import { Countdown } from "@/components/countdown";

export type StatusHeroProps = {
  code: string;
  status: OrderStatus;
  eta: string | null;
  scheduledFor: string | null;
  createdAt: string;
  spotName: string;
  buildingShort: string;
  floor: number;
  room: string;
  handoff: "door" | "lobby" | null;
  runner: { firstName: string; avatarUrl: string | null; rating: number | null; ratings: number } | null;
  steps: { status: OrderStatus; at: string | null }[];
  lateRefunded?: boolean;
};

const STEP_COPY: Partial<Record<OrderStatus, string>> = {
  requested: "On the board",
  claimed: "Runner on it",
  picked_up: "Bag in hand",
  on_the_way: "Heading up",
  delivered: "Delivered",
};

/** The order screen's top half: ETA like an elevator display, the runner, the timeline. */
export function OrderStatusHero(p: StatusHeroProps) {
  const idx = STATUS_STEPS.indexOf(p.status);
  const cancelled = p.status === "cancelled";
  const live = idx >= 1 && idx <= 3;

  return (
    <section aria-label="Order status">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">
            Order <span className="tnum">{p.code}</span> · {p.spotName}
          </p>
          {cancelled ? (
            <p className="mt-2 font-display text-display-lg font-black uppercase">Cancelled</p>
          ) : p.status === "delivered" ? (
            <p className="mt-2 font-display text-display-lg font-black uppercase">Delivered</p>
          ) : p.status === "requested" || p.status === "pending_payment" ? (
            <>
              <p className="mt-2 font-display text-display leading-none font-black uppercase">
                {p.status === "pending_payment" ? "Waiting on payment" : p.scheduledFor ? "Scheduled" : "Finding a runner"}
              </p>
              <p className="mt-2 text-small text-ink-2">
                {p.scheduledFor ? (
                  <>Goes on the board before <span className="tnum font-semibold text-ink">{fmtTime(p.scheduledFor)}</span></>
                ) : (
                  <>
                    Posted <Countdown since={p.createdAt} /> ago. Runners on shift got pinged.
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-caption font-semibold tracking-wide text-ink-3 uppercase">Arriving</p>
              <p className="tnum font-display text-display-lg leading-none font-black" aria-live="polite">
                {p.eta ? fmtTime(p.eta) : "Soon"}
              </p>
              {p.eta && (
                <p className="tnum mt-1 text-small text-ink-2">
                  <Countdown to={p.eta} />
                  {p.lateRefunded && <span className="text-danger"> · running late, fee refunded</span>}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-1">
          <FloorBadge floor={p.floor} size="lg" />
          <span className="tnum text-caption font-semibold text-ink-3">{p.buildingShort} · {p.room}</span>
        </div>
      </div>

      {p.runner && !cancelled && (
        <div className="mt-6 flex items-center gap-3 border-y border-line py-3">
          <Avatar src={p.runner.avatarUrl} name={p.runner.firstName} size={48} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{p.runner.firstName} {live ? "is running it" : "ran it"}</p>
            <Rating value={p.runner.rating} count={p.runner.ratings} />
          </div>
          {p.handoff && (
            <span
              className={cn(
                "rounded-xs px-2 py-1 text-caption font-semibold tracking-wide uppercase",
                p.handoff === "door" ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
              )}
            >
              {p.handoff === "door" ? "To your door" : "Lobby handoff"}
            </span>
          )}
        </div>
      )}

      {!cancelled && p.status !== "pending_payment" && (
        <ol className="relative mt-6 ml-1" aria-label="Progress">
          {STATUS_STEPS.map((s, i) => {
            const done = i <= idx;
            const current = i === idx;
            const at = p.steps.find((x) => x.status === s)?.at;
            return (
              <li key={s} className="relative flex gap-4 pb-5 last:pb-0" aria-current={current ? "step" : undefined}>
                {i < STATUS_STEPS.length - 1 && (
                  <span aria-hidden className="absolute top-6 bottom-0 left-[11px] w-0.5 bg-line">
                    <span className={cn("absolute inset-0 origin-top bg-ink-fill", i < idx ? "animate-rise" : "scale-y-0")} />
                  </span>
                )}
                <span
                  aria-hidden
                  className={cn(
                    "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-xs border-2 transition-colors duration-200",
                    done ? "border-ink bg-ink-fill text-accent-on-fill" : "border-line bg-paper",
                  )}
                >
                  {done && <Check className="size-3.5" strokeWidth={3.5} />}
                </span>
                <div className="flex flex-1 items-baseline justify-between gap-3">
                  <span className={cn("text-body", current ? "font-semibold" : done ? "text-ink" : "text-ink-3")}>
                    {STEP_COPY[s] ?? STATUS_LABEL[s]}
                  </span>
                  <span className="tnum text-small text-ink-3">{at ? fmtTime(at) : ""}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
