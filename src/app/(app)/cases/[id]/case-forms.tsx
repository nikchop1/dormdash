"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";

export function RespondForm({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      className="mt-3 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (text.trim().length < 5) return setError("Add a sentence or two.");
        setBusy(true);
        try {
          await api(`/api/cases/${id}/respond`, { body: { response: text } });
          toast("Thanks. An admin will take it from here.");
          router.refresh();
        } catch (err) {
          setError((err as ClientApiError).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Textarea label="What happened from your end?" value={text} onChange={(e) => setText(e.target.value)} error={error} rows={4} maxLength={2000} placeholder="I was at the door at 9:41 with the photo, called twice, nobody answered." />
      <Button type="submit" loading={busy} className="self-start">Send response</Button>
    </form>
  );
}

export function CaseMessageForm({ id, endpoint }: { id: string; endpoint?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      className="mt-4 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        try {
          await api(endpoint ?? `/api/cases/${id}/messages`, { body: { body: text } });
          setText("");
          router.refresh();
        } catch (err) {
          toast((err as ClientApiError).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Textarea label="Message the Dormdash team" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} />
      <Button type="submit" variant="secondary" loading={busy} className="self-start">Send</Button>
    </form>
  );
}
