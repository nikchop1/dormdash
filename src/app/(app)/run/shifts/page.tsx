import type { Metadata } from "next";
import { requireRunner } from "@/lib/auth/session";
import { myShifts } from "@/lib/services/runners";
import { shiftCoverage } from "@/lib/services/coverage";
import { PageHeader } from "@/components/ui/misc";
import { ShiftGrid } from "./shift-grid";

export const metadata: Metadata = { title: "Shifts" };

export default async function ShiftsPage() {
  const user = await requireRunner();
  const [mine, cov] = await Promise.all([myShifts(user.id), shiftCoverage()]);
  return (
    <div className="mx-auto max-w-3xl px-4 md:px-6">
      <PageHeader back={{ href: "/run", label: "Run" }} title="Your week">
        Tap the hours you&rsquo;re usually free. Hours with a dashed outline have fewer than 2 runners, so you&rsquo;ll get more jobs there.
      </PageHeader>
      <ShiftGrid initial={mine.map((s) => `${s.day_of_week}-${s.start_hour}`)} coverage={Object.fromEntries(cov)} />
    </div>
  );
}
