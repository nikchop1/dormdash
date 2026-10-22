import "server-only";
import { q, q1, tx } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { getAuth } from "@/lib/auth";
import { removeObject } from "@/lib/storage";

export async function phoneTaken(phone: string, exceptUserId?: string) {
  const r = await q1("select 1 from public.profiles where phone = $1 and id <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000')", [phone, exceptUserId ?? null]);
  return !!r;
}

export async function emailTaken(email: string) {
  const a = await q1("select 1 from public.profiles where lower(email) = lower($1)", [email]);
  if (a) return true;
  // Also check auth.users directly: covers accounts mid-signup.
  try {
    return !!(await q1("select 1 from auth.users where lower(email) = lower($1)", [email]));
  } catch {
    return false;
  }
}

export async function updateProfile(userId: string, p: { fullName: string; phone: string; buildingId: string; floor: number; room: string }) {
  if (await phoneTaken(p.phone, userId)) throw new ApiError(409, "phone_taken", "That phone number is on another account.", { phone: "That phone number is on another account." });
  const b = await q1<{ floor_count: number }>("select floor_count from public.buildings where id = $1 and active", [p.buildingId]);
  if (!b) throw new ApiError(400, "bad_building", "Pick your building from the list.", { buildingId: "Pick your building from the list." });
  if (p.floor > b.floor_count) throw new ApiError(400, "bad_floor", `That building has ${b.floor_count} floors.`, { floor: `That building has ${b.floor_count} floors.` });
  await q("update public.profiles set full_name = $2, phone = $3, building_id = $4, floor = $5, room = $6 where id = $1", [
    userId, p.fullName, p.phone, p.buildingId, p.floor, p.room,
  ]);
}

/**
 * Delete an account without breaking history: orders, ratings and payouts keep
 * pointing at the profile row, which is scrubbed of personal info. The auth user
 * is removed so the email can sign up again later.
 */
export async function deleteAccount(userId: string) {
  const active = await q1<{ n: number }>(
    `select count(*)::int as n from public.orders
     where (customer_id = $1 or runner_id = $1) and status in ('pending_payment','requested','claimed','picked_up','on_the_way')`,
    [userId],
  );
  if ((active?.n ?? 0) > 0) {
    throw new ApiError(409, "active_order", "You have an order in progress. Wait for it to finish (or cancel it), then delete your account.");
  }
  const openDispute = await q1("select 1 from public.disputes where (customer_id = $1 or runner_id = $1) and status <> 'resolved'", [userId]);
  if (openDispute) throw new ApiError(409, "open_dispute", "There's an open problem report on one of your orders. Once it's resolved you can delete your account.");

  const prof = await q1<{ avatar_path: string | null }>("select avatar_path from public.profiles where id = $1", [userId]);
  await tx(async (t) => {
    await t.query(
      `update public.profiles set email = null, phone = null, full_name = 'Deleted user', room = null, floor = null,
         avatar_path = null, payout_email = null, on_shift = false, status = 'deleted', deleted_at = now(),
         runner_status = case when runner_status = 'none' then 'none'::public.runner_status else 'rejected'::public.runner_status end
       where id = $1`,
      [userId],
    );
    await t.query("delete from public.push_subscriptions where user_id = $1", [userId]);
    await t.query("delete from public.notifications where user_id = $1", [userId]);
    await t.query("delete from public.shifts where runner_id = $1", [userId]);
    await t.query("update public.orders set room = 'deleted', pickup_name = 'deleted', notes = '' where customer_id = $1", [userId]);
  });
  if (prof?.avatar_path) await removeObject("avatars", prof.avatar_path).catch(() => {});
  await getAuth().deleteUser(userId);
}
