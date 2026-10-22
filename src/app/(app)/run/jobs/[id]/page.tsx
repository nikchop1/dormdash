import { redirect } from "next/navigation";

// Jobs live on the run screen now: one checklist of stops for everything you're carrying.
export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/run/active#order-${id}`);
}
