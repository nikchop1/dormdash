import { requireUser } from "@/lib/auth/session";
import { q1 } from "@/lib/db";
import { BottomNav, MobileTopBar, SideNav } from "@/components/nav";
import { LiveRefresh } from "@/components/live-refresh";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = (await q1<{ n: number }>("select count(*)::int as n from public.notifications where user_id = $1 and read_at is null", [user.id]))?.n ?? 0;
  return (
    <div className="flex min-h-dvh">
      <SideNav isAdmin={user.isAdmin} unread={unread} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar unread={unread} />
        <main id="main" className="flex-1 pb-28 md:pb-12">{children}</main>
      </div>
      <BottomNav isAdmin={user.isAdmin} />
      <LiveRefresh userId={user.id} />
    </div>
  );
}
