import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Route protection (Next.js 16 renamed middleware.ts to proxy.ts; same thing).
// This is the optimistic first gate: it redirects signed-out users to /login (with
// ?next= so they come back) and signed-in users away from /login and /signup.
// Real authorization happens server-side in every page (requireUser/requireRunner/
// requireAdmin) and every API route (apiUser/apiRunner/apiAdmin).

const PROTECTED = ["/home", "/orders", "/order", "/run", "/profile", "/notifications", "/admin", "/cases", "/appeal"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const matches = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p + "/"));

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname + search);
  let res = NextResponse.next({ request: { headers: requestHeaders } });

  let signedIn: boolean;
  if (supabaseUrl && supabaseKey) {
    // Refresh the Supabase session cookie on every request (required by @supabase/ssr).
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: { headers: requestHeaders } });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    signedIn = !!data.user;
  } else {
    signedIn = !!req.cookies.get("fd_session")?.value;
  }

  if (!signedIn && matches(pathname, PROTECTED)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return withCookies(NextResponse.redirect(url), res);
  }
  if (signedIn && matches(pathname, AUTH_PAGES)) {
    const url = req.nextUrl.clone();
    const next = req.nextUrl.searchParams.get("next");
    url.pathname = next && next.startsWith("/") && !next.startsWith("//") ? next.split("?")[0] : "/home";
    url.search = "";
    return withCookies(NextResponse.redirect(url), res);
  }
  return res;
}

function withCookies(target: NextResponse, from: NextResponse) {
  from.cookies.getAll().forEach((c) => target.cookies.set(c));
  return target;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|icons/|sw.js|manifest.webmanifest|icon.svg|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
