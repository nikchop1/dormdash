import { asUser } from "@/lib/db";
import { apiUser } from "@/lib/auth/session";
import { ApiError, route } from "@/lib/http";

// Lightweight "has this order changed?" check used for live updates.
// Runs under RLS, so you can only see orders you're allowed to see.
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const user = await apiUser();
  const [row] = await asUser(user.id, (t) =>
    t.query<{ status: string; updated_at: Date }>("select status, updated_at from public.orders where id = $1", [id]),
  );
  if (!row) throw new ApiError(404, "not_found", "We couldn't find that order.");
  return { status: row.status, version: `${row.status}:${new Date(row.updated_at).getTime()}` };
});
