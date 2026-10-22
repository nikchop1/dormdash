"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { SectionTitle } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";

export function RespondForm({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 5) return setError("Add a sentence or two.");
    setBusy(true);
    try {
      await api(`/api/runner/disputes/${id}`, { body: { response: text } });
      toast("Thanks. An admin will take it from here.");
      router.refresh();
    } catch (err) {
      setError((err as ClientApiError).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <SectionTitle>Your side</SectionTitle>
      <Textarea label="What happened from your end?" value={text} onChange={(e) => setText(e.target.value)} error={error} rows={4} maxLength={1000} placeholder="Grabbed the bag labeled Jordan L, #4821. Handed it over in the lobby, PIN matched." />
      <Button type="submit" loading={busy} className="self-start">Send response</Button>
    </form>
  );
}
