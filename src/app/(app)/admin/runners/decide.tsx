"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useAction } from "@/lib/client/use-action";

/** One-tap approve/reject with an optional note that goes in the applicant's email. */
export function DecideApplication({ id, name }: { id: string; name: string }) {
  const { run, busy } = useAction();
  const [note, setNote] = useState("");
  const first = name.split(" ")[0];
  return (
    <div className="flex flex-col gap-3">
      <Input label="Note to applicant" optional value={note} onChange={(e) => setNote(e.target.value)} placeholder="Welcome aboard. Evenings are busiest." />
      <div className="flex gap-2">
        <Button variant="primary" loading={busy === "approve"} disabled={!!busy} onClick={() => run("approve", `/api/admin/applications/${id}`, { body: { approve: true, note }, ok: `${first} is approved.` })}>
          Approve
        </Button>
        <Button variant="secondary" loading={busy === "reject"} disabled={!!busy} onClick={() => run("reject", `/api/admin/applications/${id}`, { body: { approve: false, note }, ok: `${first} was not approved.` })}>
          Reject
        </Button>
      </div>
    </div>
  );
}
