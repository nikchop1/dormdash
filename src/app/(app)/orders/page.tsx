import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { ORDER_VIEW_SQL, type OrderView } from "@/lib/services/orders";
import { STATUS_LABEL } from "@/lib/domain/orders";
import { fmtDate, fmtTime, relativeDay } from "@/lib/domain/time";
import { BagMark } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, FloorBadge, List, Money, PageHeader, Row, SectionTitle, Tag } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
  const user = await requireUser();
  const orders = await asUser(user.id, (t) =>
    t.query<OrderView>(`${ORDER_VIEW_SQL} where o.customer_id = $1 and o.status <> 'pending_payment' order by o.created_at desc limit 100`, [user.id]),
  );
  const active = orders.filter((o) => ["requested", "claimed", "picked_up", "on_the_way"].includes(o.status));
  const past = orders.filter((o) => !active.includes(o));

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader title="Orders" />
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" mark={<BagMark />} action={<ButtonLink href="/home">Find something nearby</ButtonLink>}>
          Your first delivery is one pickup order away. Receipts show up here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {active.length > 0 && (
            <section>
              <SectionTitle>In progress</SectionTitle>
              <ul className="mt-2 flex flex-col gap-2">
                {active.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center gap-4 rounded-md border border-line bg-surface p-4 transition-colors hover:border-ink-3">
                      <FloorBadge floor={o.floor} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{o.spot_name}</span>
                        <span className="block text-small text-ink-2">
                          {STATUS_LABEL[o.status]}
                          {o.eta ? <> · ETA <span className="tnum">{fmtTime(o.eta)}</span></> : null}
                        </span>
                      </span>
                      <ChevronRight className="size-5 text-ink-3" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <SectionTitle>Past orders</SectionTitle>
              <List label="Past orders" className="border-t-0">
                {past.map((o) => (
                  <Row
                    key={o.id}
                    href={`/orders/${o.id}`}
                    trailing={
                      <span className="flex flex-col items-end">
                        <Money cents={o.total_cents - o.refunded_cents} className="font-semibold" />
                        {o.refunded_cents > 0 && <span className="text-caption text-success">refunded {o.refunded_cents >= o.total_cents ? "in full" : "part"}</span>}
                      </span>
                    }
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{o.spot_name}</span>
                      {o.status === "cancelled" && <Tag>Cancelled</Tag>}
                    </span>
                    <span className="tnum block text-small text-ink-3">
                      {relativeDay(o.created_at) === fmtDate(o.created_at) ? fmtDate(o.created_at) : relativeDay(o.created_at)} · {fmtTime(o.created_at)} · {o.code}
                    </span>
                  </Row>
                ))}
              </List>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
