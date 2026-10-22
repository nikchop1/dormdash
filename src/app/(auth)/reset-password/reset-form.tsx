"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import { checkPassword } from "@/lib/validation";

export function ResetForm() {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pw = checkPassword(password);
    const f: Record<string, string> = {};
    if (!pw.ok) f.password = `Password needs: ${pw.problems.join(", ").toLowerCase()}.`;
    if (confirm !== password) f.confirmPassword = "Passwords don't match.";
    setFields(f);
    if (Object.keys(f).length) return;
    setLoading(true);
    try {
      const res = await api<{ next: string }>("/api/auth/reset", { body: { password, confirmPassword: confirm } });
      toast("Password updated. You're in.");
      router.replace(res.next);
      router.refresh();
    } catch (err) {
      const e2 = err as ClientApiError;
      setFields(e2.fields ?? { password: e2.message });
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <PasswordInput label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} hint="8+ characters with at least one letter and one number." showStrength />
      <PasswordInput label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={fields.confirmPassword} />
      <Button type="submit" size="lg" block loading={loading}>
        Save and log in
      </Button>
    </form>
  );
}
