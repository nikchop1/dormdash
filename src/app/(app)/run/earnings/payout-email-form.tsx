"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";

export function PayoutEmailForm({ current, mode }: { current: string | null; mode: "paypal" | "demo" }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(!current);
  const [email, setEmail] = useState(current ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/runner/payout-email", { body: { payoutEmail: email } });
      toast("Payout email saved.");
      setEditing(false);
      router.refresh();
    } catch (err) {
      const e2 = err as ClientApiError;
      setError(e2.fields?.payoutEmail ?? e2.message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4 py-3">
        <div>
          <p className="text-small text-ink-3">{mode === "paypal" ? "PayPal email" : "Payout email (demo)"}</p>
          <p className="font-semibold">{current}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Change</Button>
      </div>
    );
  }
  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-3 py-3">
      <Input label="PayPal email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} hint="The email on your PayPal or Venmo-linked PayPal account. Doesn't have to be your NYU one." />
      <div className="flex gap-3">
        <Button type="submit" loading={busy}>Save</Button>
        {current && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
      </div>
    </form>
  );
}
