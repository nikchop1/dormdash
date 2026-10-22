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
  size_tiers: PricingSettings["sizeTiers"];
  bag_fee_cents: number;
  max_bags: number;
  guarantee_cents: number;
  door_countdown_seconds: number;
  runner_absent_grace_seconds: number;
  present_window_after_seconds: number;
  pin_claim_window_seconds: number;
  missing_delivery_minutes: number;
  heading_home_radius_miles: number;
  level_tiers: PricingSettings["levelTiers"];
  no_show_warn_count: number;
  no_show_review_count: number;
  no_show_window_days: number;
  pattern_window_days: number;
  pattern_counterparties: number;
  no_show_rate_pct: number;
  no_show_rate_min_orders: number;
  free_problem_reports_per_30d: number;
  case_response_hours: number;
  refund_target_hours: number;
  appeal_days: number;
  evidence_retention_days: number;
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
    sizeTiers: r.size_tiers,
    bagFeeCents: r.bag_fee_cents,
    maxBags: r.max_bags,
    guaranteeCents: r.guarantee_cents,
    doorCountdownSeconds: r.door_countdown_seconds,
    runnerAbsentGraceSeconds: r.runner_absent_grace_seconds,
    presentWindowAfterSeconds: r.present_window_after_seconds,
    pinClaimWindowSeconds: r.pin_claim_window_seconds,
    missingDeliveryMinutes: r.missing_delivery_minutes,
    headingHomeRadiusMiles: Number(r.heading_home_radius_miles),
    levelTiers: r.level_tiers,
    noShowWarnCount: r.no_show_warn_count,
    noShowReviewCount: r.no_show_review_count,
    noShowWindowDays: r.no_show_window_days,
    patternWindowDays: r.pattern_window_days,
    patternCounterparties: r.pattern_counterparties,
    noShowRatePct: r.no_show_rate_pct,
    noShowRateMinOrders: r.no_show_rate_min_orders,
    freeProblemReportsPer30d: r.free_problem_reports_per_30d,
    caseResponseHours: r.case_response_hours,
    refundTargetHours: r.refund_target_hours,
    appealDays: r.appeal_days,
    evidenceRetentionDays: r.evidence_retention_days,
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
