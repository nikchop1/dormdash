import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPendingVerification, getSessionUser } from "@/lib/auth/session";
import { dbMode, env } from "@/lib/env";
import { ResendButton } from "./resend-button";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage() {
  const user = await getSessionUser();
  if (user?.emailVerified) redirect("/home");
  const email = (await getPendingVerification()) ?? user?.email ?? null;
  const showOutbox = dbMode === "pglite" && (!env.isProd || env.devTools);

  return (
    <>
      <p className="eyebrow mb-2">One more thing</p>
      <h1 className="font-display text-display leading-none font-black uppercase">Verify your email</h1>
      <p className="mt-3 text-body-lg text-ink-2">
        We sent a link to {email ? <strong className="font-semibold text-ink">{email}</strong> : "your NYU email"}. Tap it and you&rsquo;re in.
      </p>
      <ol className="mt-8 divide-y divide-line border-y border-line text-small">
        <li className="flex gap-4 py-3"><span className="tnum font-display text-heading font-black">01</span><span className="pt-0.5 text-ink-2">Open your NYU inbox (Gmail, since NYU uses Google).</span></li>
        <li className="flex gap-4 py-3"><span className="tnum font-display text-heading font-black">02</span><span className="pt-0.5 text-ink-2">Find &ldquo;Confirm your Dormdash email&rdquo;. Check spam if it&rsquo;s hiding.</span></li>
        <li className="flex gap-4 py-3"><span className="tnum font-display text-heading font-black">03</span><span className="pt-0.5 text-ink-2">Tap <span className="font-semibold text-ink">Confirm email</span>. You can order and apply to run after that.</span></li>
      </ol>
      <div className="mt-8 flex flex-col gap-3">
        {email ? (
          <ResendButton />
        ) : (
          <p className="text-small text-ink-2">
            <Link href="/login" className="link font-semibold text-ink">Log in</Link> and we&rsquo;ll send a fresh link.
          </p>
        )}
        <p className="text-small text-ink-2">
          Wrong email? <Link href="/signup" className="link font-semibold text-ink">Start over</Link>
        </p>
        {showOutbox && (
          <p className="mt-4 border-t border-line pt-4 text-small text-ink-3">
            Local mode: emails aren&rsquo;t really sent. Open the <Link href="/dev/outbox" className="link text-ink">dev outbox</Link> to click the link.
          </p>
        )}
      </div>
    </>
  );
}
