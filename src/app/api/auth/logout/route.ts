import { cookies } from "next/headers";
import { getAuth } from "@/lib/auth";
import { PENDING_COOKIE } from "@/lib/auth/session";
import { route } from "@/lib/http";

export const POST = route(async () => {
  await getAuth().signOut();
  const jar = await cookies();
  // Belt and braces: drop every auth-related cookie we know about.
  for (const c of jar.getAll()) {
    if (c.name === "fd_session" || c.name === PENDING_COOKIE || c.name.startsWith("sb-")) jar.delete(c.name);
  }
  return { ok: true, next: "/" };
});
