import type { Metadata } from "next";
import Link from "next/link";
import { listBuildings } from "@/lib/services/places";
import { env } from "@/lib/env";
import { flag } from "@/lib/settings";
import { Notice } from "@/components/ui/misc";
import { SignupForm } from "./signup-form";

// Reads live data (settings / database), so never prerender at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  const [buildings, open] = await Promise.all([listBuildings(), flag("signups_open")]);
  return (
    <>
      <h1 className="font-display text-display leading-none font-black uppercase">Get on the list</h1>
      <p className="mt-2 mb-8 text-body text-ink-2">
        Takes a minute. You need your {env.allowedEmailDomains.map((d) => "@" + d).join(" or ")} email.
      </p>
      {open ? (
        <SignupForm
          buildings={buildings.map((b) => ({ id: b.id, name: b.name, floors: b.floor_count }))}
          domains={env.allowedEmailDomains}
        />
      ) : (
        <Notice tone="warning" title="Sign-ups are paused">
          We&rsquo;re letting the current crew settle in. Check back soon, or{" "}
          <Link href="/login" className="link">log in</Link> if you already have an account.
        </Notice>
      )}
    </>
  );
}
