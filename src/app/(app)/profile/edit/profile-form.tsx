"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import { cropSquare } from "@/lib/client/image";

type B = { id: string; name: string; floors: number };

export function ProfileForm({ buildings, initial }: { buildings: B[]; initial: { fullName: string; phone: string; buildingId: string; floor: string; room: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const building = buildings.find((b) => b.id === v.buildingId);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      await api("/api/profile", { method: "PATCH", body: { ...v, floor: Number(v.floor) } });
      toast("Saved.");
      router.push("/profile");
      router.refresh();
    } catch (err) {
      const e2 = err as ClientApiError;
      setFields(e2.fields ?? {});
      toast(e2.message, "error");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="mt-8 flex flex-col gap-5">
      <Input label="Full name" value={v.fullName} onChange={set("fullName")} error={fields.fullName} autoComplete="name" />
      <Input label="Phone" type="tel" value={v.phone} onChange={set("phone")} error={fields.phone} autoComplete="tel-national" hint="Runners only see it if you're their customer." />
      <Select label="Dorm building" value={v.buildingId} onChange={set("buildingId")} error={fields.buildingId}>
        {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </Select>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Floor" inputMode="numeric" value={v.floor} onChange={set("floor")} error={fields.floor} hint={building ? `1 to ${building.floors}` : undefined} />
        <Input label="Room" value={v.room} onChange={set("room")} error={fields.room} />
      </div>
      <Button type="submit" size="lg" loading={busy} className="self-start">Save changes</Button>
    </form>
  );
}

export function AvatarEditor({ name, current }: { name: string; current: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [busy, setBusy] = useState(false);

  async function refreshPreview(f: File, z: number, px: number, py: number) {
    const blob = await cropSquare(f, { zoom: z, x: px, y: py, size: 240 });
    setPreview(URL.createObjectURL(blob));
  }

  async function onPick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setZoom(1);
    setX(0);
    setY(0);
    try {
      await refreshPreview(f, 1, 0, 0);
    } catch {
      toast("Couldn't read that image. Try a JPG or PNG.", "error");
      setFile(null);
    }
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await cropSquare(file, { zoom, x, y, size: 512 });
      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed.");
      toast("Looking good.");
      setFile(null);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const slider = (label: string, value: number, min: number, max: number, on: (n: number) => void) => (
    <label className="flex flex-col gap-1 text-small font-medium">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          on(n);
        }}
        onPointerUp={() => file && refreshPreview(file, zoom, x, y)}
        onKeyUp={() => file && refreshPreview(file, zoom, x, y)}
        className="accent-[var(--ink)]"
      />
    </label>
  );

  return (
    <div className="flex items-center gap-4">
      <Avatar src={current} name={name} size={80} />
      <div className="flex flex-col gap-2">
        <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} aria-label="Choose a profile photo" />
        <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>{current ? "Change photo" : "Add a photo"}</Button>
        <p className="text-caption text-ink-3">Runners show it to customers. Square crop.</p>
      </div>
      <Sheet
        open={!!file}
        onClose={() => !busy && setFile(null)}
        title="Crop your photo"
        footer={<Button block size="lg" loading={busy} onClick={upload}>Save photo</Button>}
      >
        <div className="flex flex-col items-center gap-5">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Crop preview" className="size-48 rounded-full object-cover" />
          )}
          <div className="grid w-full gap-4">
            {slider("Zoom", zoom, 1, 3, setZoom)}
            {slider("Left / right", x, -1, 1, setX)}
            {slider("Up / down", y, -1, 1, setY)}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
