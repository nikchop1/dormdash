"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { PhotoPicker } from "@/components/photo-picker";
import { api, ClientApiError } from "@/lib/client/api";

export function ApplyForm({ legalName, homeBuildingId, buildings }: { legalName: string; homeBuildingId: string; buildings: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ legalName, homeBuildingId, nyuIdNumber: "", agree: false });
  const [idPhotoId, setIdPhotoId] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f: Record<string, string> = {};
    if (v.legalName.trim().length < 2) f.legalName = "Enter your legal name as it appears on your ID.";
    if (!v.homeBuildingId) f.homeBuildingId = "Pick the building you live in.";
    if (!/^N\d{8}$/i.test(v.nyuIdNumber.trim())) f.nyuIdNumber = "Your NYU ID number looks like N12345678.";
    if (!idPhotoId) f.idPhotoId = "Add a photo of your NYU ID.";
    if (!v.agree) f.agree = "You need to agree to the Runner Agreement.";
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    try {
      await api("/api/runner/apply", { body: { ...v, idPhotoId } });
      toast("Application sent. We'll let you know.");
      router.push("/run");
      router.refresh();
    } catch (err) {
      const e2 = err as ClientApiError;
      setFields(e2.fields ?? {});
      toast(e2.message, "error");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Input label="Legal name" value={v.legalName} onChange={(e) => setV({ ...v, legalName: e.target.value })} error={fields.legalName} hint="Must match your NYU ID." />
      <Input label="NYU ID number" value={v.nyuIdNumber} onChange={(e) => setV({ ...v, nyuIdNumber: e.target.value })} error={fields.nyuIdNumber} placeholder="N12345678" autoCapitalize="characters" hint="The N-number on your ID card. Admins check it against the photo." />
      <Select label="Building you live in" value={v.homeBuildingId} onChange={(e) => setV({ ...v, homeBuildingId: e.target.value })} error={fields.homeBuildingId} hint="Residents can deliver to doors in their own building. Everyone else does lobby handoffs.">
        <option value="">Pick a building</option>
        {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </Select>
      <PhotoPicker kind="id_card" label="Photo of your NYU ID" hint="Front side. Only Dormdash admins see it, and it's stored privately." error={fields.idPhotoId} onUploaded={setIdPhotoId} />
      <Checkbox
        checked={v.agree}
        onChange={(e) => setV({ ...v, agree: e.target.checked })}
        error={fields.agree}
        label={<>I&rsquo;ve read and agree to the <Link href="/legal/runner-agreement" target="_blank" className="link">Runner Agreement</Link>, including the strike policy.</>}
      />
      <Button type="submit" size="lg" loading={busy} block>Send application</Button>
    </form>
  );
}
