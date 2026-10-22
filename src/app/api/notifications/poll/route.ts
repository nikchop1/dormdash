import { asUser } from "@/lib/db";
import { apiUser } from "@/lib/auth/session";
import { route } from "@/lib/http";

// Local-mode stand-in for Supabase Realtime: "anything new since X?"
export const GET = route(async (req) => {
  const user = await apiUser({ verified: false });
  const since = new URL(req.url).searchParams.get("since");
  const sinceDate = since && !isNaN(Date.parse(since)) ? since : new Date().toISOString();
  const items = await asUser(user.id, (t) =>
    t.query<{ title: string; created_at: Date }>(
      "select title, created_at from public.notifications where created_at > $1::timestamptz order by created_at desc limit 5",
      [sinceDate],
    ),
  );
  return { items };
});
