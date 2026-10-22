import type { Metadata } from "next";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { Notice } from "@/components/ui/misc";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "New password" };

export default async function ResetPasswordPage() {
  const user = await getAuth().getUser();
  return (
    <>
      <h1 className="font-display text-display leading-none font-black uppercase">New password</h1>
      {user ? (
        <>
          <p className="mt-2 mb-8 text-body text-ink-2">For {user.email}. You&rsquo;ll stay logged in after this.</p>
          <ResetForm />
        </>
      ) : (
        <div className="mt-6">
          <Notice tone="warning" title="This link has expired">
            Reset links work once and only for an hour. <Link href="/forgot-password" className="link">Send a new one</Link>.
          </Notice>
        </div>
      )}
    </>
  );
}
