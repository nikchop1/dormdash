"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { useAction } from "@/lib/client/use-action";

const EMPTY = { agency: "", officer: "", reference: "", requestDate: "", shared: "", caseId: "" };

export function LawEnforcementForm() {
  const { run, busy } = useAction();
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="mt-3 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run("le", "/api/admin/law-enforcement", { body: { ...f, caseId: f.caseId.trim() || null }, ok: "Request logged." });
        if (ok) setF(EMPTY);
      }}
    >
      <Input label="Agency" value={f.agency} onChange={set("agency")} placeholder="NYPD 6th Precinct" required />
      <Input label="Officer" value={f.officer} onChange={set("officer")} required />
      <Input label="Reference / subpoena number" value={f.reference} onChange={set("reference")} required />
      <Input label="Date of request" type="date" value={f.requestDate} onChange={set("requestDate")} required />
      <Textarea label="Exactly what was shared" value={f.shared} onChange={set("shared")} rows={4} maxLength={2000} required />
      <Input label="Case ID" optional value={f.caseId} onChange={set("caseId")} />
      <Button type="submit" variant="ink" loading={!!busy}>Log request</Button>
    </form>
  );
}
