"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";

export function DemoOnboarding({ name }: { name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <ol className="divide-y divide-line border-y border-line text-small">
        <li className="flex gap-4 py-3"><span className="tnum font-display text-heading font-black">01</span><span className="pt-0.5 text-ink-2">Bank account: simulated for {name}.</span></li>
        <li className="flex gap-4 py-3"><span className="tnum font-display text-heading font-black">02</span><span className="pt-0.5 text-ink-2">Identity verification: simulated as passed.</span></li>
      </ol>
      <Button
        size="lg"
        loading={busy}
        className="self-start"
        onClick={async () => {
          setBusy(true);
          try {
            await api("/api/runner/payouts/demo", { method: "POST" });
            toast("Payouts are set up (demo).");
            router.push("/run");
            router.refresh();
          } catch (e) {
            toast((e as ClientApiError).message, "error");
            setBusy(false);
          }
        }}
      >
        Finish setup
      </Button>
    </div>
  );
}
