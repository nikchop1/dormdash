import Link from "next/link";
import { cn } from "@/lib/cn";

/** Mark: elevator doors with the up-indicator lit. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={cn("size-7", className)} aria-hidden>
      <rect x="1" y="1" width="26" height="26" rx="2" fill="var(--ink-fill)" />
      <path d="M14 4.5 18 9.5H10z" fill="var(--accent-on-fill)" />
      <rect x="6" y="12" width="7" height="12" fill="var(--on-ink-fill)" />
      <rect x="15" y="12" width="7" height="12" fill="var(--on-ink-fill)" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-xs", className)} aria-label="FloorDrop home">
      <LogoMark />
      <span className="font-display text-[26px] leading-none font-black tracking-tight uppercase">FloorDrop</span>
    </Link>
  );
}

/** A takeout bag. Used in empty states and the tower illustration. */
export function BagMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-12", className)} aria-hidden>
      <path d="M17 15v-3a7 7 0 0 1 14 0v3" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M9 15h30l-2.5 28h-25z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M17 25h14" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

/** Elevator up/down panel for empty states. */
export function ElevatorMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-12", className)} aria-hidden>
      <rect x="10" y="4" width="28" height="40" rx="2" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="24" cy="17" r="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M24 14l3 4h-6z" fill="currentColor" />
      <circle cx="24" cy="32" r="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M24 35l-3-4h6z" fill="currentColor" />
    </svg>
  );
}

/**
 * Cross-section of a dorm tower. The elevator shaft is on the right; a bag rides
 * up it to `floor`. With `animate`, the bag climbs (paused under reduced motion).
 */
export function Tower({
  floors = 16,
  floor = 14,
  animate = false,
  className,
}: {
  floors?: number;
  floor?: number;
  animate?: boolean;
  className?: string;
}) {
  const fh = 26; // floor height
  const w = 260;
  const top = 18;
  const h = top + floors * fh + 30;
  const shaftX = 196;
  const shaftW = 40;
  const ground = top + floors * fh;
  const bagY = (f: number) => ground - f * fh + 5;
  const travel = bagY(1) - bagY(floor);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-auto w-full", className)} role="img" aria-label={`A dorm tower with a delivery bag riding the elevator up to floor ${floor}`}>
      <style>{`
        @keyframes fd-ride { 0%,12% { transform: translateY(0) } 62%,88% { transform: translateY(-${travel}px) } 100% { transform: translateY(0) } }
        @keyframes fd-lit { 0%,55% { opacity: 0 } 62%,88% { opacity: 1 } 100% { opacity: 0 } }
        .fd-ride { animation: fd-ride 7s cubic-bezier(.5,0,.3,1) infinite; }
        .fd-lit { animation: fd-lit 7s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .fd-ride { animation: none; transform: translateY(-${travel}px) } .fd-lit { animation: none; opacity: 1 } }
      `}</style>
      {/* roof */}
      <path d={`M14 ${top} H${w - 14}`} stroke="var(--ink)" strokeWidth="3" />
      <rect x="40" y={top - 12} width="34" height="12" fill="var(--ink)" />
      {/* floors */}
      {Array.from({ length: floors }).map((_, i) => {
        const f = floors - i;
        const y = top + i * fh;
        const target = f === floor;
        return (
          <g key={f}>
            <line x1="14" x2={w - 14} y1={y + fh} y2={y + fh} stroke="var(--line)" strokeWidth="1.5" />
            <text x="22" y={y + 17} className="tnum" fontFamily="var(--font-display)" fontWeight="800" fontSize="13" fill={target ? "var(--ink)" : "var(--ink-3)"}>
              {String(f).padStart(2, "0")}
            </text>
            {[0, 1, 2, 3].map((k) => (
              <g key={k}>
                <rect x={52 + k * 34} y={y + 7} width="22" height="12" fill="var(--sunken)" />
                {target && (
                  <rect x={52 + k * 34} y={y + 7} width="22" height="12" fill="var(--accent)" className={animate ? "fd-lit" : undefined} />
                )}
              </g>
            ))}
          </g>
        );
      })}
      {/* walls + shaft */}
      <rect x="14" y={top} width={w - 28} height={floors * fh} fill="none" stroke="var(--ink)" strokeWidth="3" />
      <rect x={shaftX} y={top} width={shaftW} height={floors * fh} fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
      <line x1={shaftX + shaftW / 2} x2={shaftX + shaftW / 2} y1={top} y2={ground} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" />
      {/* bag in the car */}
      <g className={animate ? "fd-ride" : undefined} transform={animate ? undefined : `translate(0 ${-travel})`}>
        <rect x={shaftX + 4} y={bagY(1) - 1} width={shaftW - 8} height={fh - 6} fill="var(--ink-fill)" />
        <path
          d={`M${shaftX + 13} ${bagY(1) + 6} h14 l-1.5 12 h-11 z`}
          fill="var(--accent)"
        />
        <path d={`M${shaftX + 16} ${bagY(1) + 6} v-2 a4 4 0 0 1 8 0 v2`} fill="none" stroke="var(--accent)" strokeWidth="1.8" />
      </g>
      {/* ground + door */}
      <path d={`M0 ${ground} H${w}`} stroke="var(--ink)" strokeWidth="3" />
      <rect x="110" y={ground - 22} width="30" height="22" fill="var(--ink)" />
      <text x="14" y={h - 8} fontFamily="var(--font-sans)" fontSize="10" fontWeight="600" letterSpacing="1.2" fill="var(--ink-3)">
        LOBBY · RESIDENT CARD REQUIRED
      </text>
    </svg>
  );
}
