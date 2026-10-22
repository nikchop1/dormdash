import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/domain/pricing";

/** The elevator floor indicator. Our signature motif. */
export function FloorBadge({ floor, size = "md", className }: { floor: number | string; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = {
    sm: "h-6 gap-0.5 px-1.5 text-[15px]",
    md: "h-8 gap-1 px-2 text-[20px]",
    lg: "h-12 gap-1.5 px-3 text-[34px]",
  }[size];
  const tri = { sm: "w-2", md: "w-2.5", lg: "w-3.5" }[size];
  return (
    <span
      className={cn("tnum inline-flex items-center rounded-xs bg-ink-fill font-display leading-none font-extrabold text-on-ink-fill", s, className)}
      aria-label={`Floor ${floor}`}
    >
      <svg viewBox="0 0 10 8" className={cn(tri, "text-accent")} aria-hidden>
        <path d="M5 0 10 8H0z" fill="currentColor" />
      </svg>
      <span aria-hidden>{floor}</span>
    </span>
  );
}

export function Money({ cents, className, strike, sign }: { cents: number; className?: string; strike?: boolean; sign?: boolean }) {
  return <span className={cn("tnum", strike && "line-through decoration-2", className)}>{formatCents(cents, { sign })}</span>;
}

export function PageHeader({
  title,
  overline,
  back,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  overline?: React.ReactNode;
  back?: { href: string; label: string };
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("pt-4 pb-5", className)}>
      {back && (
        <Link
          href={back.href}
          className="-ml-1 mb-3 inline-flex h-9 items-center gap-1.5 rounded-sm px-1 text-small font-medium text-ink-2 hover:text-ink"
        >
          <ArrowLeft className="size-4" strokeWidth={2} aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {overline && <p className="overline mb-1">{overline}</p>}
          <h1 className="font-display text-title font-extrabold tracking-tight md:text-display">{title}</h1>
        </div>
        {action}
      </div>
      {children && <div className="mt-2 text-body text-ink-2">{children}</div>}
    </header>
  );
}

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 border-t-2 border-line-strong pt-3 pb-2", className)}>
      <h2 className="text-heading font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/** Edge-to-edge list. Rows are separated by hairlines, not boxed. */
export function List({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cn("divide-y divide-line border-y border-line", className)}>
      {children}
    </ul>
  );
}

export function Row({
  href,
  children,
  className,
  leading,
  trailing,
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const inner = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">{children}</span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(
            "flex min-h-14 items-center gap-3 py-3 transition-colors duration-[120ms] hover:bg-sunken/70 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink active:bg-sunken",
            className,
          )}
        >
          {inner}
        </Link>
      ) : (
        <div className={cn("flex min-h-14 items-center gap-3 py-3", className)}>{inner}</div>
      )}
    </li>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-xs bg-sunken", className)} />;
}

/** Skeleton shaped like a list row: leading block, two lines, trailing price. */
export function RowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading" className="divide-y divide-line border-y border-line">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3.5">
          <Skeleton className="size-10" />
          <span className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </span>
          <Skeleton className="h-5 w-12" />
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({
  title,
  children,
  action,
  mark,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  mark?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {mark && <div className="mb-4 text-ink-3">{mark}</div>}
      <p className="font-display text-heading font-extrabold uppercase tracking-wide">{title}</p>
      {children && <p className="mt-1.5 max-w-xs text-small text-ink-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type NoticeTone = "info" | "warning" | "danger" | "success" | "accent";

/** Inline notice. Full-width tinted band with an icon, no colored side border. */
export function Notice({
  tone = "info",
  title,
  children,
  icon,
  action,
  className,
}: {
  tone?: NoticeTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const tones: Record<NoticeTone, string> = {
    info: "bg-sunken text-ink",
    warning: "bg-warning-soft text-ink",
    danger: "bg-danger-soft text-ink",
    success: "bg-success-soft text-ink",
    accent: "bg-accent-soft text-ink",
  };
  const iconTone: Record<NoticeTone, string> = {
    info: "text-ink-2",
    warning: "text-warning",
    danger: "text-danger",
    success: "text-success",
    accent: "text-accent-ink",
  };
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={cn("flex gap-3 rounded-sm px-4 py-3", tones[tone], className)}>
      {icon && <span className={cn("mt-0.5 shrink-0 [&>svg]:size-5", iconTone[tone])}>{icon}</span>}
      <div className="min-w-0 flex-1 text-small">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(!!title && "mt-0.5", "text-ink-2")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function Avatar({ src, name, size = 40, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full bg-sunken object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-display font-extrabold text-on-accent", className)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials || "?"}
    </span>
  );
}

export function Rating({ value, count, className }: { value: number | null; count?: number; className?: string }) {
  if (value === null || value === undefined) return <span className={cn("text-small text-ink-3", className)}>New runner</span>;
  return (
    <span className={cn("tnum inline-flex items-center gap-1 text-small font-medium", className)}>
      <Star className="size-3.5 fill-accent text-accent-ink" strokeWidth={1.5} aria-hidden />
      {value.toFixed(1)}
      {count !== undefined && <span className="font-normal text-ink-3">({count})</span>}
      <span className="sr-only">out of 5</span>
    </span>
  );
}

export function Tag({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "danger"; className?: string }) {
  const tones = {
    neutral: "bg-sunken text-ink-2",
    accent: "bg-accent-soft text-accent-ink",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return <span className={cn("inline-flex h-6 items-center rounded-xs px-2 text-caption font-semibold tracking-wide uppercase", tones[tone], className)}>{children}</span>;
}

export function KeyValue({ items, className }: { items: { k: React.ReactNode; v: React.ReactNode; strong?: boolean }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {items.map((it, i) => (
        <div key={i} className={cn("flex items-baseline justify-between gap-4 py-2.5", it.strong && "font-semibold")}>
          <dt className={cn("text-small", it.strong ? "text-ink" : "text-ink-2")}>{it.k}</dt>
          <dd className="tnum text-right text-body">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}
