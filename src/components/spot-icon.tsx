import { Coffee, School, Store, UtensilsCrossed } from "lucide-react";

const ICONS = { restaurant: UtensilsCrossed, cafe: Coffee, convenience: Store, dining_hall: School } as const;

export function SpotIcon({ type, className = "size-5" }: { type: keyof typeof ICONS; className?: string }) {
  const Icon = ICONS[type] ?? UtensilsCrossed;
  return (
    <span className="flex size-10 items-center justify-center rounded-sm bg-sunken text-ink-2" aria-hidden>
      <Icon className={className} strokeWidth={1.75} />
    </span>
  );
}
