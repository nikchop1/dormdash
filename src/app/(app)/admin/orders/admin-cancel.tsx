"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { useAction } from "@/lib/client/use-action";

export function AdminCancel({ id, code }: { id: string; code: string }) {
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Cancel</Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel ${code}?`}
        description="Admin cancels refund whatever is left to the customer. No runner fee is paid."
        footer={
          <Button
            variant="danger"
            block
            loading={busy === "cancel"}
            disabled={reason.trim().length < 3}
            onClick={async () => {
              const ok = await run("cancel", `/api/admin/orders/${id}/cancel`, { body: { reason }, ok: `Cancelled ${code} and refunded.` });
              if (ok) setOpen(false);
            }}
          >
            Cancel and refund
          </Button>
        }
      >
        <Input label="Reason (the customer sees this)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Spot closed early tonight." />
      </Sheet>
    </>
  );
}
