import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { getOrderView } from "@/lib/services/orders";
import { Notice, PageHeader } from "@/components/ui/misc";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Report a problem" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const o = await asUser(user.id, (t) => getOrderView(t, id));
  if (!o || o.customer_id !== user.id) notFound();
  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: `/orders/${id}`, label: "Order" }} title="Report a problem">
        Order {o.code} from {o.spot_name}. A real person reads every report, usually within a day.
      </PageHeader>
      {o.status !== "delivered" ? (
        <Notice tone="warning" title="Not delivered yet">You can report a problem once the order is marked delivered. Need to stop it? Cancel from the order screen.</Notice>
      ) : (
        <ReportForm orderId={id} />
      )}
    </div>
  );
}
