"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MailCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { api, ClientApiError } from "@/lib/client/api";

function ForgotForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>(
    params.get("error") === "expired" ? "That reset link expired or was already used. Send yourself a new one." : undefined,
  );
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter the email you signed up with.");
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      await api("/api/auth/forgot", { body: { email } });
      setSent(true);
    } catch (err) {
      setError((err as ClientApiError).message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <Notice tone="success" icon={<MailCheck />} title="Check your inbox">
          If {email} has a Dormdash account, a reset link is on its way. It works once and expires in an hour.
        </Notice>
        <p className="text-small text-ink-2">
          Nothing after a few minutes? Check spam, or{" "}
          <button type="button" onClick={() => setSent(false)} className="link font-semibold text-ink">
            try again
          </button>
          .
        </p>
        <Link href="/login" className="link text-small font-semibold">Back to log in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {error && (
        <Notice tone="danger" icon={<TriangleAlert />}>
          <span className="text-ink">{error}</span>
        </Notice>
      )}
      <Input label="NYU email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="netid@nyu.edu" />
      <Button type="submit" size="lg" block loading={loading}>
        Send reset link
      </Button>
      <Link href="/login" className="link text-small font-semibold">Back to log in</Link>
    </form>
  );
}

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display text-display leading-none font-black uppercase">Forgot it?</h1>
      <p className="mt-2 mb-8 text-body text-ink-2">Happens. We&rsquo;ll email you a link to pick a new one.</p>
      <Suspense>
        <ForgotForm />
      </Suspense>
    </>
  );
}
