"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/form";
import { Notice, SectionTitle } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";

export function ChangeEmailForm({ current, domains }: { current: string; domains: string[] }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/auth/change-email", { body: { email } });
      setSent(email);
      setEmail("");
    } catch (err) {
      const e2 = err as ClientApiError;
      setError(e2.fields?.email ?? e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-10">
      <SectionTitle>Email</SectionTitle>
      <p className="mt-1 mb-4 text-small text-ink-2">Currently <span className="font-semibold text-ink">{current}</span>. It has to stay a {domains.map((d) => "@" + d).join(" or ")} address.</p>
      {sent ? (
        <Notice tone="success" icon={<MailCheck />} title="Check your new inbox">
          We sent a confirmation link to {sent}. Your email changes once you tap it. Until then, keep logging in with {current}.
        </Notice>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Input label="New email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} placeholder="netid@nyu.edu" />
          <Button type="submit" variant="secondary" loading={busy} className="self-start" disabled={!email}>Send confirmation link</Button>
        </form>
      )}
    </section>
  );
}

export function ChangePasswordForm() {
  const toast = useToast();
  const [v, setV] = useState({ currentPassword: "", password: "", confirmPassword: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      await api("/api/auth/change-password", { body: v });
      toast("Password changed. Other devices were logged out.");
      setV({ currentPassword: "", password: "", confirmPassword: "" });
    } catch (err) {
      const e2 = err as ClientApiError;
      setFields(e2.fields ?? { currentPassword: e2.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionTitle>Password</SectionTitle>
      <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-4">
        <PasswordInput label="Current password" autoComplete="current-password" value={v.currentPassword} onChange={set("currentPassword")} error={fields.currentPassword} />
        <PasswordInput label="New password" autoComplete="new-password" value={v.password} onChange={set("password")} error={fields.password} showStrength hint="8+ characters with at least one letter and one number." />
        <PasswordInput label="Confirm new password" autoComplete="new-password" value={v.confirmPassword} onChange={set("confirmPassword")} error={fields.confirmPassword} />
        <Button type="submit" loading={busy} className="self-start">Change password</Button>
      </form>
    </section>
  );
}
