import type { Metadata } from "next";
import { getCurrentSurge, getPricing, getSurgeWindows } from "@/lib/settings";
import { Notice } from "@/components/ui/misc";
import { PricingForm, SurgeWindows, WeatherToggle } from "./pricing-forms";

export const metadata: Metadata = { title: "Admin · Pricing" };

export default async function AdminPricing() {
  const [s, windows, surge] = await Promise.all([getPricing(), getSurgeWindows(), getCurrentSurge()]);
  return (
    <div className="max-w-3xl pb-10">
      <h1 className="pt-6 pb-4 font-display text-title font-extrabold uppercase">Pricing and surge</h1>
      <Notice tone={surge ? "accent" : "info"} title={surge ? `Busy pricing is on: ${surge.multiplier}x (${surge.label})` : "Normal pricing right now"}>
        Prices are always computed on the server at checkout. Changes here apply to new orders only.
      </Notice>
      <WeatherToggle on={s.weatherSurgeOn} multiplier={s.weatherMultiplier} />
      <SurgeWindows windows={windows.map((w) => ({ ...w, id: w.id! }))} />
      <PricingForm initial={s} />
    </div>
  );
}
