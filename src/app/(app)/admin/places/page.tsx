import type { Metadata } from "next";
import { q } from "@/lib/db";
import { listBuildings, SPOT_TYPE_LABEL, type Spot } from "@/lib/services/places";
import { getPricing, flag } from "@/lib/settings";
import { SectionTitle, Tag } from "@/components/ui/misc";
import { BuildingEditor, DistanceToggle, SpotEditor } from "./editors";

export const metadata: Metadata = { title: "Admin · Places" };

export default async function AdminPlaces() {
  const [buildings, spots, dists, s, diningOn] = await Promise.all([
    listBuildings({ includeInactive: true }),
    q<Spot>("select * from public.pickup_spots order by name"),
    q<{ spot_id: string; building_id: string; distance_miles: number; enabled: boolean }>("select * from public.spot_building_distances"),
    getPricing(),
    flag("dining_halls_enabled"),
  ]);
  const d = (sp: string, b: string) => dists.find((x) => x.spot_id === sp && x.building_id === b);

  return (
    <div className="pb-10">
      <h1 className="pt-6 pb-4 font-display text-title font-extrabold uppercase">Places</h1>

      <SectionTitle action={<BuildingEditor />}>Dorm buildings</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-small">
          <thead>
            <tr className="border-b border-line text-left text-caption tracking-wide text-ink-3 uppercase">
              <th className="py-2 font-semibold">Name</th><th className="py-2 font-semibold">Address</th><th className="py-2 font-semibold">Lat, lng</th>
              <th className="py-2 text-right font-semibold">Floors</th><th className="py-2 font-semibold">Door delivery</th><th className="py-2" />
            </tr>
          </thead>
          <tbody className="tnum divide-y divide-line">
            {buildings.map((b) => (
              <tr key={b.id}>
                <td className="py-2.5 font-semibold">{b.name} {!b.active && <Tag>Inactive</Tag>}</td>
                <td className="py-2.5 text-ink-2">{b.address}</td>
                <td className="py-2.5 text-ink-2">{b.lat.toFixed(5)}, {b.lng.toFixed(5)}</td>
                <td className="py-2.5 text-right">{b.floor_count}</td>
                <td className="py-2.5 text-ink-2">{b.door_requires_resident ? "Resident runners only" : "Any runner"}</td>
                <td className="py-2.5 text-right"><BuildingEditor building={{ id: b.id, name: b.name, shortName: b.short_name, address: b.address, lat: b.lat, lng: b.lng, floorCount: b.floor_count, doorRequiresResident: b.door_requires_resident, active: b.active }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle className="mt-10" action={<SpotEditor />}>Pickup spots</SectionTitle>
      <p className="mb-3 text-small text-ink-2">
        Max radius {s.maxRadiusMiles} mi (change it in Pricing). A spot can only be switched on for buildings inside the radius. Dining halls are {diningOn ? "on" : "off"} globally (Flags).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-small">
          <thead>
            <tr className="border-b border-line text-left text-caption tracking-wide text-ink-3 uppercase">
              <th className="py-2 font-semibold">Spot</th>
              {buildings.map((b) => <th key={b.id} className="py-2 font-semibold">{b.short_name}</th>)}
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="tnum divide-y divide-line">
            {spots.map((sp) => (
              <tr key={sp.id} className="align-top">
                <td className="py-2.5">
                  <span className="font-semibold">{sp.name}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    <Tag>{SPOT_TYPE_LABEL[sp.type]}</Tag>
                    {!sp.active && <Tag tone="danger">Inactive</Tag>}
                    {sp.verify_before_launch && <Tag tone="warning">Verify before launch</Tag>}
                  </span>
                  <span className="mt-1 block text-caption text-ink-3">{sp.address} · {sp.lat.toFixed(5)}, {sp.lng.toFixed(5)}</span>
                </td>
                {buildings.map((b) => {
                  const x = d(sp.id, b.id);
                  return (
                    <td key={b.id} className="py-2.5">
                      {x ? <DistanceToggle spotId={sp.id} buildingId={b.id} miles={Number(x.distance_miles)} enabled={x.enabled} inRange={Number(x.distance_miles) <= s.maxRadiusMiles} /> : "n/a"}
                    </td>
                  );
                })}
                <td className="py-2.5 text-right">
                  <SpotEditor spot={{ id: sp.id, name: sp.name, address: sp.address, lat: sp.lat, lng: sp.lng, type: sp.type, active: sp.active, pickupNotes: sp.pickup_notes, verifyBeforeLaunch: sp.verify_before_launch }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
