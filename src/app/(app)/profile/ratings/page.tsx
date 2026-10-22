import type { Metadata } from "next";
import { Star } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { fmtDate } from "@/lib/domain/time";
import { EmptyState, List, PageHeader, Rating, Row } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Ratings" };

type R = { stars: number; comment: string; created_at: Date; code: string; spot: string; other: string };

export default async function RatingsPage() {
  const user = await requireUser();
  const received = user.isRunner || user.profile.runner_status === "suspended";
  const rows = await asUser(user.id, (t) =>
    t.query<R>(
      `select r.stars, r.comment, r.created_at, o.code, sp.name as spot, split_part(p.full_name, ' ', 1) as other
       from public.ratings r join public.orders o on o.id = r.order_id join public.pickup_spots sp on sp.id = o.spot_id
       join public.profiles p on p.id = ${received ? "r.customer_id" : "r.runner_id"}
       where ${received ? "r.runner_id" : "r.customer_id"} = $1 order by r.created_at desc limit 100`,
      [user.id],
    ),
  );
  const avg = rows.length ? rows.reduce((s, r) => s + r.stars, 0) / rows.length : null;
  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/profile", label: "Profile" }} title={received ? "Your ratings" : "Ratings you gave"}>
        {received && avg !== null && (
          <span className="flex items-center gap-2">
            <span className="tnum font-display text-display font-black text-ink">{avg.toFixed(2)}</span>
            <span className="text-small">average from {rows.length} {rows.length === 1 ? "delivery" : "deliveries"}</span>
          </span>
        )}
      </PageHeader>
      {rows.length === 0 ? (
        <EmptyState title="No ratings yet" mark={<Star className="size-10" strokeWidth={1.5} />}>
          {received ? "Customers rate you after each delivery. Fast and friendly gets you fives." : "After a delivery, rate your runner from the order screen."}
        </EmptyState>
      ) : (
        <List>
          {rows.map((r, i) => (
            <Row key={i} trailing={<Rating value={r.stars} />}>
              <span className="block font-semibold">{r.spot}</span>
              <span className="tnum block text-small text-ink-3">{fmtDate(r.created_at)} · {received ? "from" : "for"} {r.other} · {r.code}</span>
              {r.comment && <span className="mt-1 block text-small text-ink-2">&ldquo;{r.comment}&rdquo;</span>}
            </Row>
          ))}
        </List>
      )}
    </div>
  );
}
