import "server-only";
import { q, q1, tx } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { getPricing } from "@/lib/settings";
import { notify } from "@/lib/notify";
import type { PricingSettings, SurgeWindow } from "@/lib/domain/pricing";
import { recomputeDistances } from "./places";

type BuildingInput = { name: string; shortName: string; address: string; lat: number; lng: number; floorCount: number; doorRequiresResident: boolean; active: boolean };
type SpotInput = { name: string; address: string; lat: number; lng: number; type: string; active: boolean; pickupNotes: string; verifyBeforeLaunch: boolean };

export async function upsertBuilding(id: string | null, b: BuildingInput) {
  const row = id
    ? await q1<{ id: string }>(
        `update public.buildings set name=$2, short_name=$3, address=$4, lat=$5, lng=$6, floor_count=$7, door_requires_resident=$8, active=$9
         where id=$1 returning id`,
        [id, b.name, b.shortName, b.address, b.lat, b.lng, b.floorCount, b.doorRequiresResident, b.active],
      )
    : await q1<{ id: string }>(
        `insert into public.buildings (name, short_name, address, lat, lng, floor_count, door_requires_resident, active)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [b.name, b.shortName, b.address, b.lat, b.lng, b.floorCount, b.doorRequiresResident, b.active],
      );
  if (!row) throw new ApiError(404, "not_found", "Building not found.");
  await recomputeDistances();
  return row.id;
}

export async function upsertSpot(id: string | null, s: SpotInput) {
  const row = id
    ? await q1<{ id: string }>(
        `update public.pickup_spots set name=$2, address=$3, lat=$4, lng=$5, type=$6, active=$7, pickup_notes=$8, verify_before_launch=$9
         where id=$1 returning id`,
        [id, s.name, s.address, s.lat, s.lng, s.type, s.active, s.pickupNotes, s.verifyBeforeLaunch],
      )
    : await q1<{ id: string }>(
        `insert into public.pickup_spots (name, address, lat, lng, type, active, pickup_notes, verify_before_launch)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [s.name, s.address, s.lat, s.lng, s.type, s.active, s.pickupNotes, s.verifyBeforeLaunch],
      );
  if (!row) throw new ApiError(404, "not_found", "Spot not found.");
  await recomputeDistances();
  return row.id;
}

/** Turn a spot on/off for one building. Out-of-radius pairs can never be turned on. */
export async function setDistanceEnabled(spotId: string, buildingId: string, enabled: boolean) {
  const s = await getPricing();
  const d = await q1<{ distance_miles: number }>("select distance_miles from public.spot_building_distances where spot_id=$1 and building_id=$2", [spotId, buildingId]);
  if (!d) throw new ApiError(404, "not_found", "No distance on file for that pair.");
  if (enabled && Number(d.distance_miles) > s.maxRadiusMiles + 1e-9) {
    throw new ApiError(409, "out_of_range", `That spot is ${Number(d.distance_miles).toFixed(2)} mi away, past the ${s.maxRadiusMiles} mi max radius.`);
  }
  await q("update public.spot_building_distances set enabled=$3 where spot_id=$1 and building_id=$2", [spotId, buildingId, enabled]);
}

export async function savePricing(adminId: string, p: PricingSettings) {
  const tiers = [...p.distanceTiers].sort((a, b) => a.maxMiles - b.maxMiles);
  const floors = [...p.floorTiers].sort((a, b) => (a.maxFloor ?? Infinity) - (b.maxFloor ?? Infinity));
  if (floors.filter((f) => f.maxFloor === null).length !== 1 || floors.at(-1)!.maxFloor !== null) {
    throw new ApiError(400, "invalid", "The last floor tier must be open-ended (no max floor).");
  }
  await q(
    `update public.pricing_settings set base_fee_cents=$2, distance_tiers=$3::jsonb, floor_tiers=$4::jsonb, max_radius_miles=$5,
       weather_surge_on=$6, weather_multiplier=$7, platform_fee_pct=$8, cancel_fee_cents=$9, late_grace_minutes=$10,
       unclaimed_ping_minutes=$11, unclaimed_cancel_minutes=$12, strike_threshold=$13, max_active_orders=$14,
       free_unclaims_per_week=$15, tip_presets=array(select jsonb_array_elements_text($16::jsonb)::int), payout_hold_hours=$17,
       min_payout_cents=$18, updated_at=now(), updated_by=$1 where id = 1`,
    [
      adminId, p.baseFeeCents, JSON.stringify(tiers), JSON.stringify(floors), p.maxRadiusMiles, p.weatherSurgeOn, p.weatherMultiplier,
      p.platformFeePct, p.cancelFeeCents, p.lateGraceMinutes, p.unclaimedPingMinutes, p.unclaimedCancelMinutes, p.strikeThreshold,
      p.maxActiveOrders, p.freeUnclaimsPerWeek, JSON.stringify(p.tipPresets), p.payoutHoldHours, p.minPayoutCents,
    ],
  );
  // The radius may have changed: re-apply it to every spot/building pair.
  await recomputeDistances(null, p);
}

export async function setWeatherSurge(adminId: string, on: boolean) {
  await q("update public.pricing_settings set weather_surge_on=$2, updated_at=now(), updated_by=$1 where id=1", [adminId, on]);
}

export async function upsertSurgeWindow(id: string | null, w: Omit<SurgeWindow, "id">) {
  const days = JSON.stringify(w.days);
  if (id) {
    const r = await q1(
      "update public.surge_windows set label=$2, days=array(select jsonb_array_elements_text($3::jsonb)::int), start_minute=$4, end_minute=$5, multiplier=$6, active=$7 where id=$1 returning id",
      [id, w.label, days, w.startMinute, w.endMinute, w.multiplier, w.active],
    );
    if (!r) throw new ApiError(404, "not_found", "Surge window not found.");
    return;
  }
  await q(
    "insert into public.surge_windows (label, days, start_minute, end_minute, multiplier, active) values ($1, array(select jsonb_array_elements_text($2::jsonb)::int), $3, $4, $5, $6)",
    [w.label, days, w.startMinute, w.endMinute, w.multiplier, w.active],
  );
}

export async function deleteSurgeWindow(id: string) {
  await q("delete from public.surge_windows where id=$1", [id]);
}

export async function setFlag(key: string, enabled: boolean) {
  const r = await q1("update public.feature_flags set enabled=$2 where key=$1 returning key", [key, enabled]);
  if (!r) throw new ApiError(404, "not_found", "Unknown flag.");
}

export type UserAction = "suspend" | "unsuspend" | "make_admin" | "remove_admin" | "reinstate_runner" | "suspend_runner" | "void_strikes";

export async function adminUserAction(adminId: string, userId: string, action: UserAction) {
  if (userId === adminId && (action === "suspend" || action === "remove_admin")) {
    throw new ApiError(400, "self", "You can't do that to your own account. Ask another admin.");
  }
  const p = await q1<{ id: string; runner_status: string; status: string }>("select id, runner_status, status from public.profiles where id=$1", [userId]);
  if (!p || p.status === "deleted") throw new ApiError(404, "not_found", "User not found.");
  await tx(async (t) => {
    switch (action) {
      case "suspend":
        await t.query("update public.profiles set status='suspended', on_shift=false where id=$1", [userId]);
        break;
      case "unsuspend":
        await t.query("update public.profiles set status='active' where id=$1", [userId]);
        break;
      case "make_admin":
        await t.query("update public.profiles set is_admin=true where id=$1", [userId]);
        break;
      case "remove_admin":
        await t.query("update public.profiles set is_admin=false where id=$1", [userId]);
        break;
      case "suspend_runner":
        await t.query("update public.profiles set runner_status='suspended', on_shift=false where id=$1 and runner_status='approved'", [userId]);
        break;
      case "reinstate_runner":
        if (p.runner_status !== "suspended") throw new ApiError(409, "not_suspended", "This runner isn't suspended.");
        await t.query("update public.strikes set voided=true where runner_id=$1 and not voided", [userId]);
        await t.query("update public.profiles set runner_status='approved' where id=$1", [userId]);
        break;
      case "void_strikes":
        await t.query("update public.strikes set voided=true where runner_id=$1 and not voided", [userId]);
        break;
    }
  });
  if (action === "reinstate_runner") {
    await notify(userId, { category: "account", title: "You're back on", body: "An admin reviewed your account and reinstated running. Strikes were cleared.", url: "/run" });
  }
  if (action === "suspend_runner") {
    await notify(userId, { category: "account", title: "Running is paused", body: "An admin paused your runner account pending review.", url: "/run" });
  }
}
