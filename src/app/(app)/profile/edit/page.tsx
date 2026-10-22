import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { listBuildings } from "@/lib/services/places";
import { avatarUrl } from "@/lib/storage";
import { formatPhone } from "@/lib/validation";
import { PageHeader } from "@/components/ui/misc";
import { AvatarEditor, ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const user = await requireUser();
  const p = user.profile;
  const buildings = await listBuildings();
  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/profile", label: "Profile" }} title="Edit profile" />
      <AvatarEditor name={p.full_name} current={avatarUrl(p.avatar_path)} />
      <ProfileForm
        buildings={buildings.map((b) => ({ id: b.id, name: b.name, floors: b.floor_count }))}
        initial={{ fullName: p.full_name, phone: formatPhone(p.phone), buildingId: p.building_id ?? "", floor: p.floor ? String(p.floor) : "", room: p.room ?? "" }}
      />
    </div>
  );
}
