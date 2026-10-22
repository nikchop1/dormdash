import { NextResponse } from "next/server";
import { getAuth, type TokenType } from "@/lib/auth";
import { clearPendingVerification } from "@/lib/auth/session";
import { env } from "@/lib/env";

// Landing point for every emailed auth link (verify, reset, email change).
// Supabase templates and the local mailer both link here with ?token_hash=&type=.
const TYPES: TokenType[] = ["signup", "email", "recovery", "email_change"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as TokenType | null;
  const nextParam = url.searchParams.get("next");
  const base = env.siteUrl;

  if (!token || !type || !TYPES.includes(type)) {
    return NextResponse.redirect(`${base}/login?error=bad_link`);
  }
  const res = await getAuth().verifyToken(token, type);
  if (!res.ok) {
    const dest = type === "recovery" ? "/forgot-password?error=expired" : "/login?error=expired_link";
    return NextResponse.redirect(`${base}${dest}`);
  }
  await clearPendingVerification();
  if (type === "recovery") return NextResponse.redirect(`${base}/reset-password`);
  if (type === "email_change") return NextResponse.redirect(`${base}/profile?email_changed=1`);
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/home?welcome=1";
  return NextResponse.redirect(`${base}${next}`);
}
