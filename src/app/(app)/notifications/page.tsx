import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { fmtTime, relativeDay } from "@/lib/domain/time";
import { ElevatorMark } from "@/components/brand";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await asUser(user.id, (t) =>
    t.query<{ id: string; title: string; body: string; url: string | null; read_at: Date | null; created_at: Date }>(
      "select id, title, body, url, read_at, created_at from public.notifications order by created_at desc limit 60",
    ),
  );
  const unread = items.some((i) => !i.read_at);
  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader title="Notifications" action={unread ? <MarkRead /> : undefined} />
      {items.length === 0 ? (
        <EmptyState title="All quiet" mark={<ElevatorMark />}>Order updates, payouts and anything else we need to tell you will show up here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((n) => {
            const inner = (
              <div className="flex gap-3 py-3.5">
                <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-xs ${n.read_at ? "bg-transparent" : "bg-accent"}`} />
                <div className="min-w-0 flex-1">
                  <p className={n.read_at ? "text-ink-2" : "font-semibold"}>
                    {n.title}
                    {!n.read_at && <span className="sr-only"> (unread)</span>}
                  </p>
                  {n.body && <p className="text-small text-ink-2">{n.body}</p>}
                  <p className="tnum mt-1 text-caption text-ink-3">{relativeDay(n.created_at)} · {fmtTime(n.created_at)}</p>
                </div>
              </div>
            );
            return <li key={n.id}>{n.url ? <Link href={n.url} className="block hover:bg-sunken/60">{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
