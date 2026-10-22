"use client";

import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/client/use-action";

/** A no-show whose door location couldn't be verified: approve pays the runner, reject refunds the customer. */
export function NoShowReview({ id }: { id: string }) {
  const { run, busy } = useAction();
  return (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="ink" loading={busy === "a"} onClick={() => run("a", `/api/admin/orders/${id}/no-show-review`, { body: { approve: true }, ok: "Runner paid." })}>Pay runner</Button>
      <Button size="sm" variant="secondary" loading={busy === "r"} onClick={() => run("r", `/api/admin/orders/${id}/no-show-review`, { body: { approve: false }, ok: "Customer refunded." })}>Refund</Button>
    </span>
  );
}
