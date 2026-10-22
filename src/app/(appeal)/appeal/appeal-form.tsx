"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";

export function AppealForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (text.trim().length < 20) return setError("Explain what happened (20+ characters).");
        setBusy(true);
        try {
          await api(`/api/cases/${caseId}/appeal`, { body: { text } });
          toast("Appeal sent. We'll email you the decision.");
          router.refresh();
        } catch (err) {
          setError((err as ClientApiError).message);
          setBusy(false);
        }
      }}
    >
      <Textarea label="What happened" value={text} onChange={(e) => setText(e.target.value)} error={error} rows={6} maxLength={3000} />
      <Button type="submit" size="lg" loading={busy} className="self-start">Send my one appeal</Button>
    </form>
  );
}
