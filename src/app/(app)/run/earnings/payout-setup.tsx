"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";

/** Stripe Connect Express onboarding: bank account + Stripe's identity verification. */
export function PayoutSetup({ enabled, started, returning, mode }: { enabled: boolean; started: boolean; returning: boolean; mode: "stripe" | "demo" }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const synced = useRef(false);

  useEffect(() => {
    if (!returning || synced.current) return;
    synced.current = true;
    api<{ payoutsEnabled: boolean }>("/api/runner/payouts/sync", { method: "POST" })
      .then((r) => {
        toast(r.payoutsEnabled ? "Payouts are set up." : "Stripe still needs a few details. Finish setup to get paid.", r.payoutsEnabled ? "success" : "error");
        router.replace("/run/earnings");
        router.refresh();
      })
      .catch(() => {});
  }, [returning, router, toast]);

  async function start() {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>("/api/runner/payouts/setup", { method: "POST" });
      window.location.assign(url);
    } catch (e) {
      toast((e as ClientApiError).message, "error");
      setBusy(false);
    }
  }

  if (enabled) {
    return (
      <p className="flex items-center gap-2 py-3 text-small">
        <BadgeCheck className="size-5 text-success" aria-hidden />
        <span><span className="font-semibold">Payouts are on.</span> {mode === "demo" ? "Demo mode: payouts are simulated." : "You're paid through Stripe the moment a customer gives you their PIN."}</span>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 py-3">
      <p className="text-small text-ink-2">
        Dormdash pays you through Stripe. You&rsquo;ll add a bank account and Stripe will verify your identity. No card on file, no deposits, no holds.
      </p>
      <Button onClick={start} loading={busy} className="self-start">{started ? "Finish payout setup" : "Set up payouts"}</Button>
    </div>
  );
}
