import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { env } from "@/lib/env";
import { signPayload, verifyPayload } from "@/lib/crypto";
import { ApiError } from "@/lib/http";
import { getAuth } from "./index";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  building_id: string | null;
  floor: number | null;
  room: string | null;
  avatar_path: string | null;
  is_admin: boolean;
  runner_status: "none" | "pending" | "approved" | "rejected" | "suspended";
  runner_home_building_id: string | null;
  status: "active" | "suspended" | "deleted" | "banned";
  on_shift: boolean;
  on_shift_since: Date | null;
  credit_cents: number;
  use_credit: boolean;
  stripe_account_id: string | null;
  payouts_enabled: boolean;
  level_offset: number;
  flagged_at: Date | null;
  flag_reason: string | null;
  customer_review_required: boolean;
  banned_at: Date | null;
  created_at: Date;
};

export type SessionUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  profile: Profile;
  isAdmin: boolean;
  isRunner: boolean;
};

export async function loadProfile(id: string) {
  return q1<Profile>("select * from public.profiles where id = $1", [id]);
}

/** Promote anyone listed in ADMIN_EMAILS. Runs on every session load, so it covers signup and login. */
async function ensureAdminBootstrap(p: Profile, email: string) {
  if (!p.is_admin && env.adminEmails.includes(email.toLowerCase())) {
    await q("update public.profiles set is_admin = true where id = $1", [p.id]);
    p.is_admin = true;
  }
}

/** The signed-in user for this request, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const user = await getAuth().getUser();
  if (!user) return null;
  const profile = await loadProfile(user.id);
  if (!profile || profile.status === "deleted") return null;
  await ensureAdminBootstrap(profile, user.email);
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    profile,
    isAdmin: profile.is_admin && profile.status === "active",
    isRunner: profile.runner_status === "approved" && profile.status === "active",
  };
});

async function currentPath() {
  return (await headers()).get("x-pathname") || "/home";
}

// ---------- page guards (redirect) ----------

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) {
    // A cookie that no longer maps to a session (expired, signed out elsewhere) would
    // bounce between /login and here, so clear it on the way out.
    const stale = (await cookies()).getAll().some((c) => c.name === "fd_session" || c.name.startsWith("sb-"));
    const next = encodeURIComponent(await currentPath());
    redirect(stale ? `/auth/signout?next=${next}` : `/login?next=${next}`);
  }
  if (u.profile.status === "suspended") redirect("/login?error=suspended");
  if (u.profile.status === "banned") redirect("/appeal");
  if (!u.emailVerified) redirect("/verify-email");
  return u;
}

export async function requireRunner(): Promise<SessionUser> {
  const u = await requireUser();
  if (!u.isRunner) redirect("/run");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (!u.isAdmin) redirect("/home?error=forbidden");
  return u;
}

// ---------- API guards (throw ApiError) ----------

export async function apiUser(opts: { verified?: boolean; allowBanned?: boolean } = {}): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new ApiError(401, "unauthenticated", "You're signed out. Log in and try again.");
  if (u.profile.status === "suspended") throw new ApiError(403, "suspended", "Your account is suspended. Email support to sort it out.");
  if (u.profile.status === "banned" && !opts.allowBanned) throw new ApiError(403, "banned", "This account is banned. You can appeal from the appeal page.");
  if ((opts.verified ?? true) && !u.emailVerified) throw new ApiError(403, "unverified", "Verify your email first. Check your NYU inbox for the link.");
  return u;
}

export async function apiRunner(): Promise<SessionUser> {
  const u = await apiUser();
  if (u.profile.runner_status === "suspended") throw new ApiError(403, "runner_suspended", "Your runner account is paused pending review.");
  if (!u.isRunner) throw new ApiError(403, "not_runner", "Only approved runners can do that.");
  return u;
}

export async function apiAdmin(): Promise<SessionUser> {
  const u = await apiUser();
  if (!u.isAdmin) throw new ApiError(403, "forbidden", "Admins only.");
  return u;
}

// ---------- pending verification (signed cookie) ----------

export const PENDING_COOKIE = "fd_pending";

export async function setPendingVerification(email: string) {
  (await cookies()).set(PENDING_COOKIE, signPayload({ email }, 7 * 86400), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
    secure: env.siteUrl.startsWith("https"),
  });
}

export async function getPendingVerification(): Promise<string | null> {
  const p = verifyPayload<{ email: string }>((await cookies()).get(PENDING_COOKIE)?.value);
  return p?.email ?? null;
}

export async function clearPendingVerification() {
  (await cookies()).delete(PENDING_COOKIE);
}
