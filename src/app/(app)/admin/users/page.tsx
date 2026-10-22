import type { Metadata } from "next";
import Link from "next/link";
import { q } from "@/lib/db";
import { fmtDate } from "@/lib/domain/time";
import { formatPhone } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { EmptyState, Tag } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Admin · Users" };

type U = { id: string; full_name: string; email: string | null; phone: string | null; is_admin: boolean; runner_status: string; status: string; created_at: Date; orders: number; strikes: number };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const term = sp.q?.trim();
  const users = await q<U>(
    `select p.id, p.full_name, p.email, p.phone, p.is_admin, p.runner_status, p.status, p.created_at,
       (select count(*)::int from public.orders o where o.customer_id = p.id and o.status <> 'pending_payment') as orders,
       (select count(*)::int from public.strikes s where s.runner_id = p.id and not s.voided) as strikes
     from public.profiles p
     where p.status <> 'deleted' ${term ? "and (p.full_name ilike $1 or p.email ilike $1 or p.phone ilike $1)" : ""}
     order by p.created_at desc limit 200`,
    term ? [`%${term}%`] : [],
  );
  return (
    <div className="pb-10">
      <h1 className="pt-6 pb-4 font-display text-title font-extrabold uppercase">Users</h1>
      <form method="get" className="flex items-end gap-3 border-y border-line py-4">
        <Input label="Search name, email or phone" name="q" defaultValue={term ?? ""} fieldClassName="flex-1 max-w-md" />
        <Button type="submit" variant="ink" size="md">Search</Button>
      </form>
      {users.length === 0 ? (
        <EmptyState title="Nobody by that name">Try part of their email or the last 4 of their phone.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-small">
            <thead>
              <tr className="border-b border-line text-left text-caption tracking-wide text-ink-3 uppercase">
                <th className="py-2 font-semibold">Name</th>
                <th className="py-2 font-semibold">Email</th>
                <th className="py-2 font-semibold">Phone</th>
                <th className="py-2 font-semibold">Roles</th>
                <th className="py-2 text-right font-semibold">Orders</th>
                <th className="py-2 text-right font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody className="tnum divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5"><Link href={`/admin/users/${u.id}`} className="link font-semibold">{u.full_name}</Link></td>
                  <td className="py-2.5 text-ink-2">{u.email}</td>
                  <td className="py-2.5 text-ink-2">{formatPhone(u.phone)}</td>
                  <td className="py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {u.is_admin && <Tag tone="accent">Admin</Tag>}
                      {u.runner_status !== "none" && <Tag tone={u.runner_status === "approved" ? "success" : u.runner_status === "suspended" ? "danger" : "neutral"}>Runner: {u.runner_status}</Tag>}
                      {u.status === "suspended" && <Tag tone="danger">Suspended</Tag>}
                      {u.strikes > 0 && <Tag tone="warning">{u.strikes} strikes</Tag>}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">{u.orders}</td>
                  <td className="py-2.5 text-right text-ink-2">{fmtDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
