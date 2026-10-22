import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { paymentsMode } from "@/lib/env";
import { PageHeader } from "@/components/ui/misc";
import { DemoOnboarding } from "./demo-onboarding";

export const metadata: Metadata = { title: "Payout setup (demo)" };

// Demo stand-in for Stripe's hosted Connect onboarding (bank + identity).
export default async function DemoOnboardingPage() {
  const user = await requireUser();
  if (paymentsMode !== "demo" || !user.profile.stripe_account_id) notFound();
  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/run/earnings", label: "Earnings" }} overline="Demo mode" title="Payout setup">
        With real Stripe keys, this step happens on Stripe: you add a bank account and verify your identity. In demo mode nothing is collected.
      </PageHeader>
      <DemoOnboarding name={user.profile.full_name} />
    </div>
  );
}
