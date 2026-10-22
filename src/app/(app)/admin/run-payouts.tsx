"use client";

import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/client/use-action";

/** Runs the same job as the daily payout cron, on demand. */
export function RunPayouts() {
  const { run, busy } = useAction();
  return (
    <Button variant="secondary" size="sm" loading={!!busy} onClick={() => run("p", "/api/admin/payouts", { ok: "Payout run finished. Check runners' earnings." })}>
      Run payouts now
    </Button>
  );
}
