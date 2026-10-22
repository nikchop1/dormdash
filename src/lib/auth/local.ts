import "server-only";
import { cookies } from "next/headers";
import { q, q1, tx } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword, randomToken, sha256, verifyPassword } from "@/lib/crypto";
import { sendEmail, templates } from "@/lib/email";
import type { AuthProvider, AuthUser, TokenType } from "./types";

// A small, faithful stand-in for Supabase Auth used when no Supabase project is
// configured (local dev, tests). Same tables Supabase uses (auth.users), same
// email-link flow (/auth/confirm?token_hash=...&type=...).

export const LOCAL_SESSION_COOKIE = "fd_session";
const SESSION_DAYS = 30;

type UserRow = { id: string; email: string; encrypted_password: string; email_confirmed_at: Date | null };

const toUser = (u: UserRow): AuthUser => ({ id: u.id, email: u.email, emailVerified: !!u.email_confirmed_at });

async function createSession(userId: string) {
  const token = randomToken();
  await q("insert into local.sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))", [
    sha256(token),
    userId,
    SESSION_DAYS,
  ]);
  await q("update auth.users set last_sign_in_at = now() where id = $1", [userId]);
  (await cookies()).set(LOCAL_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd && env.siteUrl.startsWith("https"),
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

async function issueToken(userId: string, type: TokenType, ttlMinutes: number, newEmail?: string) {
  const token = randomToken();
  await q(
    "insert into local.auth_tokens (token_hash, user_id, type, new_email, expires_at) values ($1, $2, $3, $4, now() + make_interval(mins => $5))",
    [sha256(token), userId, type, newEmail ?? null, ttlMinutes],
  );
  const next = type === "recovery" ? "&next=/reset-password" : "";
  return `${env.siteUrl}/auth/confirm?token_hash=${token}&type=${type}${next}`;
}

export const localAuth: AuthProvider = {
  async getUser() {
    const token = (await cookies()).get(LOCAL_SESSION_COOKIE)?.value;
    if (!token) return null;
    const u = await q1<UserRow>(
      `select u.* from local.sessions s join auth.users u on u.id = s.user_id
       where s.token_hash = $1 and s.expires_at > now()`,
      [sha256(token)],
    );
    return u ? toUser(u) : null;
  },

  async signUp({ email, password, metadata }) {
    const existing = await q1("select 1 from auth.users where lower(email) = lower($1)", [email]);
    if (existing) return { ok: false, message: "exists" };
    const hash = await hashPassword(password);
    const user = await q1<{ id: string }>(
      "insert into auth.users (email, encrypted_password, raw_user_meta_data) values (lower($1), $2, $3::jsonb) returning id",
      [email, hash, JSON.stringify(metadata)],
    );
    const url = await issueToken(user!.id, "signup", 24 * 60);
    await sendEmail({ to: email, ...templates.verify(url) });
    return { ok: true, userId: user!.id };
  },

  async signIn(email, password) {
    const u = await q1<UserRow>("select * from auth.users where lower(email) = lower($1)", [email]);
    if (!u || !(await verifyPassword(password, u.encrypted_password))) return { ok: false, code: "invalid_credentials" };
    if (!u.email_confirmed_at) return { ok: false, code: "email_not_confirmed" };
    await createSession(u.id);
    return { ok: true, user: toUser(u) };
  },

  async signOut() {
    const jar = await cookies();
    const token = jar.get(LOCAL_SESSION_COOKIE)?.value;
    if (token) await q("delete from local.sessions where token_hash = $1", [sha256(token)]);
    jar.delete(LOCAL_SESSION_COOKIE);
  },

  async resendVerification(email) {
    const u = await q1<UserRow>("select * from auth.users where lower(email) = lower($1)", [email]);
    if (!u || u.email_confirmed_at) return;
    const url = await issueToken(u.id, "signup", 24 * 60);
    await sendEmail({ to: u.email, ...templates.verify(url) });
  },

  async sendPasswordReset(email) {
    const u = await q1<UserRow>("select * from auth.users where lower(email) = lower($1)", [email]);
    if (!u) return; // never reveal whether an account exists
    const url = await issueToken(u.id, "recovery", 60);
    await sendEmail({ to: u.email, ...templates.reset(url) });
  },

  async verifyToken(token, type) {
    const result = await tx(async (t) => {
      const [row] = await t.query<{ user_id: string; type: string; new_email: string | null }>(
        `update local.auth_tokens set used_at = now()
         where token_hash = $1 and used_at is null and expires_at > now()
         returning user_id, type, new_email`,
        [sha256(token)],
      );
      if (!row) return null;
      const kind = row.type as TokenType;
      if (kind !== type && !(kind === "signup" && type === "email")) return null;
      if (kind === "signup") {
        await t.query("update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1", [row.user_id]);
      }
      if (kind === "email_change" && row.new_email) {
        const taken = await t.query("select 1 from auth.users where lower(email) = lower($1) and id <> $2", [row.new_email, row.user_id]);
        if (taken.length) return null;
        await t.query("update auth.users set email = lower($1), updated_at = now() where id = $2", [row.new_email, row.user_id]);
      }
      const [u] = await t.query<UserRow>("select * from auth.users where id = $1", [row.user_id]);
      return { kind, user: u };
    });
    if (!result) return { ok: false, message: "This link has expired or was already used." };
    await createSession(result.user.id);
    return { ok: true, type: result.kind, user: toUser(result.user) };
  },

  async updatePassword(userId, newPassword) {
    await q("update auth.users set encrypted_password = $1, updated_at = now() where id = $2", [await hashPassword(newPassword), userId]);
    // Sign out every other session.
    const token = (await cookies()).get(LOCAL_SESSION_COOKIE)?.value ?? "";
    await q("delete from local.sessions where user_id = $1 and token_hash <> $2", [userId, sha256(token)]);
  },

  async checkPassword(email, password) {
    const u = await q1<UserRow>("select * from auth.users where lower(email) = lower($1)", [email]);
    return !!u && (await verifyPassword(password, u.encrypted_password));
  },

  async requestEmailChange(userId, newEmail) {
    const url = await issueToken(userId, "email_change", 24 * 60, newEmail);
    await sendEmail({ to: newEmail, ...templates.emailChange(url, newEmail) });
  },

  async deleteUser(userId) {
    await q("delete from auth.users where id = $1", [userId]);
  },

  async createConfirmedUser({ email, password, metadata }) {
    const row = await q1<{ id: string }>(
      "insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at) values (lower($1), $2, $3::jsonb, now()) returning id",
      [email, await hashPassword(password), JSON.stringify(metadata)],
    );
    return row!.id;
  },
};
