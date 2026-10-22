import "server-only";
import { q, q1 } from "@/lib/db";
import { activeSurge, DEFAULT_PRICING, type PricingSettings, type SurgeWindow } from "@/lib/domain/pricing";

type PricingRow = {
  base_fee_cents: number;
  distance_tiers: PricingSettings["distanceTiers"];
  floor_tiers: PricingSettings["floorTiers"];
  max_radius_miles: number;
  weather_surge_on: boolean;
  weather_multiplier: number;
  platform_fee_pct: number;
  cancel_fee_cents: number;
  late_grace_minutes: number;
  unclaimed_ping_minutes: number;
  unclaimed_cancel_minutes: number;
  strike_threshold: number;
  max_active_orders: number;
  free_unclaims_per_week: number;
  tip_presets: number[];
  payout_hold_hours: number;
  min_payout_cents: number;
};

export async function getPricing(): Promise<PricingSettings> {
  const r = await q1<PricingRow>("select * from public.pricing_settings where id = 1");
  if (!r) return DEFAULT_PRICING;
  return {
    baseFeeCents: r.base_fee_cents,
    distanceTiers: r.distance_tiers,
    floorTiers: r.floor_tiers,
    maxRadiusMiles: Number(r.max_radius_miles),
    weatherSurgeOn: r.weather_surge_on,
    weatherMultiplier: Number(r.weather_multiplier),
    platformFeePct: Number(r.platform_fee_pct),
    cancelFeeCents: r.cancel_fee_cents,
    lateGraceMinutes: r.late_grace_minutes,
    unclaimedPingMinutes: r.unclaimed_ping_minutes,
    unclaimedCancelMinutes: r.unclaimed_cancel_minutes,
    strikeThreshold: r.strike_threshold,
    maxActiveOrders: r.max_active_orders,
    freeUnclaimsPerWeek: r.free_unclaims_per_week,
    tipPresets: (r.tip_presets ?? []).map(Number),
    payoutHoldHours: r.payout_hold_hours,
    minPayoutCents: r.min_payout_cents,
  };
}

export async function getSurgeWindows(): Promise<SurgeWindow[]> {
  const rows = await q<{ id: string; label: string; days: number[]; start_minute: number; end_minute: number; multiplier: number; active: boolean }>(
    "select * from public.surge_windows order by created_at",
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    days: r.days.map(Number),
    startMinute: r.start_minute,
    endMinute: r.end_minute,
    multiplier: Number(r.multiplier),
    active: r.active,
  }));
}

export async function getCurrentSurge(now = new Date()) {
  const [s, w] = await Promise.all([getPricing(), getSurgeWindows()]);
  return activeSurge(now, w, s);
}

export async function getFlags(): Promise<Record<string, boolean>> {
  const rows = await q<{ key: string; enabled: boolean }>("select key, enabled from public.feature_flags");
  return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
}

export async function flag(key: string): Promise<boolean> {
  const r = await q1<{ enabled: boolean }>("select enabled from public.feature_flags where key = $1", [key]);
  return !!r?.enabled;
}
