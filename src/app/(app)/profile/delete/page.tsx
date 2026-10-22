"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { api, ClientApiError } from "@/lib/client/api";

export default function DeleteAccountPage() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function del() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await api<{ next: string }>("/api/account", { method: "DELETE", body: { confirm } });
      window.location.assign(res.next);
    } catch (e) {
      setError((e as ClientApiError).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/profile", label: "Profile" }} title="Delete account" />
      <div className="flex flex-col gap-5 text-body text-ink-2">
        <p>This is permanent. Here&rsquo;s exactly what happens:</p>
        <ul className="divide-y divide-line border-y border-line text-small">
          <li className="py-3">Your name, email, phone, room and photo are erased and you&rsquo;re logged out everywhere.</li>
          <li className="py-3">Past orders stay in our records as &ldquo;Deleted user&rdquo; so runners&rsquo; earnings and receipts still add up.</li>
          <li className="py-3">If you&rsquo;re a runner, any earnings not yet transferred still go to your Stripe payout account.</li>
          <li className="py-3">You can&rsquo;t delete while an order is in progress or a problem report is open.</li>
        </ul>
        <Button variant="danger" size="lg" onClick={() => setOpen(true)} className="self-start">
          Delete my account
        </Button>
      </div>
      <Sheet
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Type DELETE to confirm"
        footer={
          <Button variant="danger" block size="lg" disabled={confirm !== "DELETE"} loading={busy} onClick={del}>
            Permanently delete
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Notice tone="danger" icon={<TriangleAlert />}><span className="text-ink">{error}</span></Notice>}
          <Input label='Type "DELETE"' value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        </div>
      </Sheet>
    </div>
  );
}
