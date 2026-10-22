import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuth } from "@/lib/auth";
import { env } from "@/lib/env";

// Clears a stale session and sends the user to log in again (see requireUser).
export async function GET(req: Request) {
  const next = new URL(req.url).searchParams.get("next") ?? "/home";
  await getAuth().signOut().catch(() => {});
  const jar = await cookies();
  for (const c of jar.getAll()) if (c.name === "fd_session" || c.name.startsWith("sb-")) jar.delete(c.name);
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/home";
  return NextResponse.redirect(`${env.siteUrl}/login?next=${encodeURIComponent(safe)}`);
}
