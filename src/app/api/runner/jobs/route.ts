import { asUser } from "@/lib/db";
import { apiRunner } from "@/lib/auth/session";
import { route } from "@/lib/http";

// Board version for live updates. Runs under RLS: open jobs are only visible to
// approved runners who are on shift, so an off-shift runner gets an empty board.
export const GET = route(async () => {
  const user = await apiRunner();
  const rows = await asUser(user.id, (t) =>
    t.query<{ id: string; status: string; updated_at: Date }>(
      "select id, status, updated_at from public.orders where status = 'requested' or runner_id = $1 order by id",
      [user.id],
    ),
  );
  const version = rows.map((r) => `${r.id.slice(0, 8)}:${r.status}:${new Date(r.updated_at).getTime()}`).join("|");
  return { count: rows.filter((r) => r.status === "requested").length, version };
});
