"use client";

import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/client/use-action";

/** Retries failed or review-released runner transfers (the payout cron does the same). */
export function RunPayouts() {
  const { run, busy } = useAction();
  return (
    <Button variant="secondary" size="sm" loading={!!busy} onClick={() => run("p", "/api/admin/payouts", { ok: "Retried pending payouts." })}>
      Retry payouts
    </Button>
  );
}
