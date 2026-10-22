import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { listBuildings } from "@/lib/services/places";
import { PageHeader } from "@/components/ui/misc";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = { title: "Apply to run" };

export default async function ApplyPage() {
  const user = await requireUser();
  if (!["none", "rejected"].includes(user.profile.runner_status)) redirect("/run");
  const buildings = await listBuildings();
  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/run", label: "Run" }} title="Apply to run">
        We check every runner by hand. It takes a day, tops.
      </PageHeader>
      <ApplyForm
        legalName={user.profile.full_name}
        homeBuildingId={user.profile.building_id ?? ""}
        buildings={buildings.map((b) => ({ id: b.id, name: b.name }))}
      />
    </div>
  );
}
