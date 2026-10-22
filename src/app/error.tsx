"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col justify-center px-4 py-16 md:px-8">
      <p className="eyebrow">Something broke</p>
      <h1 className="mt-2 font-display text-display-lg leading-none font-black uppercase">Elevator&rsquo;s out</h1>
      <p className="mt-4 max-w-md text-body-lg text-ink-2">
        That page hit an error on our end. Your orders and payments are safe. Try again, and if it keeps happening, email support@floordrop.app
        {error.digest ? <> with code <span className="tnum font-semibold text-ink">{error.digest}</span></> : null}.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/home" variant="secondary">Back to the app</ButtonLink>
      </div>
    </main>
  );
}
