import type { Metadata } from "next";
import { q } from "@/lib/db";
import { FlagSwitch } from "./flag-switch";

export const metadata: Metadata = { title: "Admin · Flags" };

export default async function AdminFlags() {
  const flags = await q<{ key: string; enabled: boolean; description: string }>("select * from public.feature_flags order by key");
  return (
    <div className="max-w-2xl pb-10">
      <h1 className="pt-6 pb-4 font-display text-title font-extrabold uppercase">Feature flags</h1>
      <div className="divide-y divide-line border-y border-line">
        {flags.map((f) => <FlagSwitch key={f.key} flagKey={f.key} enabled={f.enabled} description={f.description} />)}
      </div>
    </div>
  );
}
