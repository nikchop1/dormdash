import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const req = (path: string, signedIn = false) =>
  new NextRequest(new URL(path, "http://localhost:3000"), { headers: signedIn ? { cookie: "fd_session=abc" } : {} });

describe("route protection (proxy)", () => {
  it.each(["/home", "/orders/123", "/run", "/run/jobs/abc", "/profile", "/admin", "/admin/pricing", "/notifications"])(
    "sends signed-out visitors from %s to /login with ?next=",
    async (path) => {
      const res = await proxy(req(path));
      expect(res.status).toBe(307);
      const loc = new URL(res.headers.get("location")!);
      expect(loc.pathname).toBe("/login");
      expect(loc.searchParams.get("next")).toBe(path);
    },
  );

  it("keeps the query string in ?next=", async () => {
    const res = await proxy(req("/admin?days=90"));
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe("/admin?days=90");
  });

  it.each(["/", "/legal/terms", "/login", "/signup", "/forgot-password", "/verify-email", "/offline"])("lets anyone see %s", async (path) => {
    const res = await proxy(req(path));
    expect(res.headers.get("location")).toBeNull();
  });

  it("bounces signed-in users away from login and signup", async () => {
    for (const path of ["/login", "/signup", "/forgot-password"]) {
      const res = await proxy(req(path, true));
      expect(new URL(res.headers.get("location")!).pathname).toBe("/home");
    }
  });

  it("honors a safe ?next= for signed-in users, ignores off-site ones", async () => {
    expect(new URL((await proxy(req("/login?next=/run", true))).headers.get("location")!).pathname).toBe("/run");
    expect(new URL((await proxy(req("/login?next=//evil.com", true))).headers.get("location")!).pathname).toBe("/home");
  });

  it("lets signed-in users into app routes and passes the path through", async () => {
    const res = await proxy(req("/orders", true));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/orders");
  });
});
