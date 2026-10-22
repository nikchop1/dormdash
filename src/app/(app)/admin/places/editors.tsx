"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/client/use-action";

type B = { id?: string; name: string; shortName: string; address: string; lat: number | string; lng: number | string; floorCount: number | string; doorRequiresResident: boolean; active: boolean };
type S = { id?: string; name: string; address: string; lat: number | string; lng: number | string; type: string; active: boolean; pickupNotes: string; verifyBeforeLaunch: boolean };

export function BuildingEditor({ building }: { building?: B }) {
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<B>(building ?? { name: "", shortName: "", address: "", lat: "", lng: "", floorCount: "", doorRequiresResident: true, active: true });
  const set = (k: keyof B) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  async function save() {
    const ok = await run("save", building ? `/api/admin/buildings/${building.id}` : "/api/admin/buildings", {
      method: building ? "PATCH" : "POST",
      body: { ...v, lat: Number(v.lat), lng: Number(v.lng), floorCount: Number(v.floorCount) },
      ok: "Saved. Distances recalculated.",
    });
    if (ok) setOpen(false);
  }
  return (
    <>
      <Button variant={building ? "ghost" : "secondary"} size="sm" onClick={() => setOpen(true)}>{building ? "Edit" : "Add building"}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={building ? `Edit ${building.name}` : "Add a building"} footer={<Button block loading={!!busy} onClick={save}>Save building</Button>}>
        <div className="flex flex-col gap-4">
          <Input label="Name" value={v.name} onChange={set("name")} />
          <Input label="Short name" value={v.shortName} onChange={set("shortName")} hint="Shown on the job board, like 'Tower'." />
          <Input label="Address" value={v.address} onChange={set("address")} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude" inputMode="decimal" value={String(v.lat)} onChange={set("lat")} />
            <Input label="Longitude" inputMode="decimal" value={String(v.lng)} onChange={set("lng")} />
          </div>
          <Input label="Floors" inputMode="numeric" value={String(v.floorCount)} onChange={set("floorCount")} />
          <Checkbox label="Door delivery needs a resident runner (building requires a resident card)" checked={v.doorRequiresResident} onChange={set("doorRequiresResident")} />
          <Checkbox label="Active" checked={v.active} onChange={set("active")} />
        </div>
      </Sheet>
    </>
  );
}

export function SpotEditor({ spot }: { spot?: S }) {
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<S>(spot ?? { name: "", address: "", lat: "", lng: "", type: "restaurant", active: true, pickupNotes: "", verifyBeforeLaunch: true });
  const set = (k: keyof S) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV({ ...v, [k]: e.target instanceof HTMLInputElement && e.target.type === "checkbox" ? e.target.checked : e.target.value });
  async function save() {
    const ok = await run("save", spot ? `/api/admin/spots/${spot.id}` : "/api/admin/spots", {
      method: spot ? "PATCH" : "POST",
      body: { ...v, lat: Number(v.lat), lng: Number(v.lng) },
      ok: "Saved. Distances recalculated.",
    });
    if (ok) setOpen(false);
  }
  return (
    <>
      <Button variant={spot ? "ghost" : "secondary"} size="sm" onClick={() => setOpen(true)}>{spot ? "Edit" : "Add spot"}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={spot ? `Edit ${spot.name}` : "Add a pickup spot"} footer={<Button block loading={!!busy} onClick={save}>Save spot</Button>}>
        <div className="flex flex-col gap-4">
          <Input label="Name" value={v.name} onChange={set("name")} />
          <Input label="Address" value={v.address} onChange={set("address")} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude" inputMode="decimal" value={String(v.lat)} onChange={set("lat")} hint="Right-click the spot in any map to copy it." />
            <Input label="Longitude" inputMode="decimal" value={String(v.lng)} onChange={set("lng")} />
          </div>
          <Select label="Type" value={v.type} onChange={set("type")}>
            <option value="restaurant">Restaurant</option>
            <option value="cafe">Café</option>
            <option value="convenience">Bodega & convenience</option>
            <option value="dining_hall">Dining hall (hidden unless the flag is on)</option>
          </Select>
          <Textarea label="Pickup notes for runners" optional value={v.pickupNotes} onChange={set("pickupNotes")} rows={2} />
          <Checkbox label="Active" checked={v.active} onChange={set("active")} />
          <Checkbox label="Still needs verifying before launch" checked={v.verifyBeforeLaunch} onChange={set("verifyBeforeLaunch")} />
        </div>
      </Sheet>
    </>
  );
}

export function DistanceToggle({ spotId, buildingId, miles, enabled, inRange }: { spotId: string; buildingId: string; miles: number; enabled: boolean; inRange: boolean }) {
  const { run, busy } = useAction();
  return (
    <button
      type="button"
      disabled={!inRange || !!busy}
      onClick={() => run("t", "/api/admin/distances", { method: "PATCH", body: { spotId, buildingId, enabled: !enabled }, ok: enabled ? "Turned off for that building." : "Turned on for that building." })}
      aria-pressed={enabled && inRange}
      title={!inRange ? "Outside the max radius" : enabled ? "Click to turn off for this building" : "Click to turn on for this building"}
      className={cn(
        "tnum inline-flex h-8 items-center gap-1.5 rounded-xs px-2 text-caption font-semibold",
        !inRange ? "cursor-not-allowed text-ink-3 line-through" : enabled ? "bg-success-soft text-success" : "bg-sunken text-ink-2 hover:text-ink",
      )}
    >
      {miles.toFixed(2)} mi · {!inRange ? "too far" : enabled ? "on" : "off"}
    </button>
  );
}
