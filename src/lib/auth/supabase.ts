import "server-only";
import type { EmailOtpType } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { supabaseAdmin, supabaseServer, supabaseStateless } from "@/lib/supabase/server";
import type { AuthProvider, AuthUser } from "./types";

// Production auth. Supabase sends the verification, reset and email-change emails
// itself using the templates in supabase/templates (see README: "Auth email templates").

const toUser = (u: { id: string; email?: string; email_confirmed_at?: string | null }): AuthUser => ({
  id: u.id,
  email: (u.email ?? "").toLowerCase(),
  emailVerified: !!u.email_confirmed_at,
});

export const supabaseAuth: AuthProvider = {
  async getUser() {
    const sb = await supabaseServer();
    const { data } = await sb.auth.getUser();
    return data.user ? toUser(data.user) : null;
  },

  async signUp({ email, password, metadata }) {
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: metadata, emailRedirectTo: `${env.siteUrl}/auth/confirm` },
    });
    if (error || !data.user) return { ok: false, message: error?.message ?? "Sign up failed." };
    // Supabase hides duplicate emails by returning a user with no identities.
    if (data.user.identities && data.user.identities.length === 0) return { ok: false, message: "exists" };
    return { ok: true, userId: data.user.id };
  },

  async signIn(email, password) {
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === "email_not_confirmed") return { ok: false, code: "email_not_confirmed" };
      if (error.code === "invalid_credentials" || error.status === 400) return { ok: false, code: "invalid_credentials" };
      return { ok: false, code: "error", message: error.message };
    }
    return { ok: true, user: toUser(data.user) };
  },

  async signOut() {
    const sb = await supabaseServer();
    await sb.auth.signOut({ scope: "local" });
  },

  async resendVerification(email) {
    const sb = await supabaseServer();
    await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${env.siteUrl}/auth/confirm` } });
  },

  async sendPasswordReset(email) {
    const sb = await supabaseServer();
    await sb.auth.resetPasswordForEmail(email, { redirectTo: `${env.siteUrl}/auth/confirm?next=/reset-password` });
  },

  async verifyToken(token, type) {
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.verifyOtp({ token_hash: token, type: type as EmailOtpType });
    if (error || !data.user) return { ok: false, message: "This link has expired or was already used." };
    return { ok: true, type, user: toUser(data.user) };
  },

  async updatePassword(_userId, newPassword) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },

  async checkPassword(email, password) {
    const sb = supabaseStateless();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (!error) await sb.auth.signOut({ scope: "local" });
    return !error;
  },

  async requestEmailChange(_userId, newEmail) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.updateUser({ email: newEmail }, { emailRedirectTo: `${env.siteUrl}/auth/confirm` });
    if (error) throw new Error(error.message);
  },

  async deleteUser(userId) {
    const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
  },

  async createConfirmedUser({ email, password, metadata }) {
    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user) throw new Error(error?.message ?? "createUser failed");
    return data.user.id;
  },
};
