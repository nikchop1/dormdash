import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { call, fixtures, freshDb, loginAs, makeUser, PASSWORD } from "./harness";
import { clearBrowsers, cookieValue, switchBrowser } from "./setup";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as resend } from "@/app/api/auth/resend/route";
import { POST as forgot } from "@/app/api/auth/forgot/route";
import { POST as reset } from "@/app/api/auth/reset/route";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { GET as confirm } from "@/app/auth/confirm/route";
import { GET as quote } from "@/app/api/orders/[id]/route";
import { getSessionUser } from "@/lib/auth/session";

let db: Db;
let f: Awaited<ReturnType<typeof fixtures>>;

beforeAll(async () => {
  db = await freshDb();
  f = await fixtures(db);
});
beforeEach(() => clearBrowsers());

const form = (over: Record<string, unknown> = {}) => ({
  fullName: "Jordan Lee",
  email: "jl1234@nyu.edu",
  phone: "(212) 555-0142",
  password: "elevator14",
  confirmPassword: "elevator14",
  buildingId: f.tower,
  floor: 14,
  room: "1412",
  agreeTerms: true,
  ...over,
});

async function lastLink(to: string) {
  const [m] = await db.query<{ text: string }>("select text from local.outbox where to_email = $1 order by id desc limit 1", [to]);
  return m?.text.match(/https?:\/\/\S+/)?.[0] ?? null;
}

async function follow(link: string) {
  return confirm(new Request(link));
}

describe("signup", () => {
  it("rejects non-NYU emails, bad phones and weak passwords server-side", async () => {
    let r = await call(signup, { body: form({ email: "jordan@gmail.com" }) });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/@nyu\.edu/);

    r = await call(signup, { body: form({ email: "x1@nyu.edu", phone: "555-0142" }) });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/10-digit US phone/);

    r = await call(signup, { body: form({ email: "x2@nyu.edu", phone: "2125550199", password: "password", confirmPassword: "password" }) });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/number/);
  });

  it("rejects a floor above the building's floor count", async () => {
    const r = await call(signup, { body: form({ email: "x3@nyu.edu", phone: "2125550198", buildingId: f.mercer, floor: 12 }) });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/8 floors/);
  });

  it("creates an unverified account, sends a verification email, and blocks login until verified", async () => {
    const r = await call(signup, { body: form() });
    expect(r.status).toBe(200);
    expect(cookieValue("fd_pending")).toBeTruthy();
    expect(cookieValue("fd_session")).toBeFalsy();
    const [p] = await db.query<{ phone: string; floor: number; terms_accepted_at: Date | null }>("select phone, floor, terms_accepted_at from public.profiles where email = 'jl1234@nyu.edu'");
    expect(p.phone).toBe("+12125550142");
    expect(p.floor).toBe(14);
    expect(p.terms_accepted_at).not.toBeNull();

    switchBrowser("other");
    const l = await call(login, { body: { email: "jl1234@nyu.edu", password: "elevator14" } });
    expect(l.status).toBe(200);
    expect(l.body).toMatchObject({ ok: false, verify: true, next: "/verify-email" });
    expect(cookieValue("fd_session")).toBeFalsy();
  });

  it("enforces unique email with the friendly message", async () => {
    const r = await call(signup, { body: form({ phone: "2125550177" }) });
    expect(r.status).toBe(409);
    expect((r.body as { error: { message: string } }).error.message).toBe("An account with this email already exists. Log in instead?");
  });

  it("enforces unique phone numbers", async () => {
    const r = await call(signup, { body: form({ email: "different@nyu.edu" }) });
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toMatch(/phone number is already on another account/);
  });

  it("resend has a cooldown", async () => {
    switchBrowser("resender");
    await call(login, { body: { email: "jl1234@nyu.edu", password: "elevator14" } }); // sets pending cookie
    expect((await call(resend)).status).toBe(200);
    const again = await call(resend);
    expect(again.status).toBe(429);
    expect(JSON.stringify(again.body)).toMatch(/seconds/);
  });

  it("verification link signs the user in and marks the email verified", async () => {
    switchBrowser("verifier");
    const link = await lastLink("jl1234@nyu.edu");
    expect(link).toContain("/auth/confirm?token_hash=");
    const res = await follow(link!);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/home");
    expect(cookieValue("fd_session")).toBeTruthy();
    const u = await getSessionUser();
    expect(u?.emailVerified).toBe(true);
    // The same link can't be reused.
    switchBrowser("replay");
    const again = await follow(link!);
    expect(again.headers.get("location")).toContain("error=expired_link");
  });
});

describe("login, lockout and logout", () => {
  beforeAll(async () => {
    await makeUser(db, "ava@nyu.edu", { building: f.tower });
  });

  it("logs in with the right password and persists a session cookie", async () => {
    await loginAs("ava", "ava@nyu.edu");
    expect(cookieValue("fd_session")).toBeTruthy();
    expect((await getSessionUser())?.email).toBe("ava@nyu.edu");
  });

  it("gives a clear message for wrong credentials and locks after 5 failures", async () => {
    switchBrowser("attacker");
    let r = await call(login, { body: { email: "ava@nyu.edu", password: "nope12345" } });
    expect(r.status).toBe(401);
    expect(JSON.stringify(r.body)).toMatch(/don't match\. 4 tries left/);
    for (let i = 0; i < 4; i++) r = await call(login, { body: { email: "ava@nyu.edu", password: "nope12345" } });
    expect(JSON.stringify(r.body)).toMatch(/locked/);
    // Even the right password is refused while locked.
    r = await call(login, { body: { email: "ava@nyu.edu", password: PASSWORD } });
    expect(r.status).toBe(429);
    expect(JSON.stringify(r.body)).toMatch(/locked for \d+ more min/);
    await db.query("delete from public.rate_limits");
  });

  it("logout clears the session everywhere it matters", async () => {
    await loginAs("leaver", "ava@nyu.edu");
    const token = cookieValue("fd_session")!;
    expect((await call(logout)).status).toBe(200);
    expect(cookieValue("fd_session")).toBeFalsy();
    expect(await getSessionUser()).toBeNull();
    // The old token is dead server-side too.
    const [row] = await db.query("select 1 from local.sessions where token_hash = encode(sha256($1::bytea), 'hex')", [token]).catch(() => [undefined]);
    expect(row).toBeUndefined();
    // API routes now return 401.
    const r = await call(quote, { method: "GET", params: { id: "00000000-0000-0000-0000-000000000000" } });
    expect(r.status).toBe(401);
  });
});

describe("password reset", () => {
  beforeAll(async () => {
    await makeUser(db, "noah@nyu.edu", { building: f.mercer });
  });

  it("forgot → email → link → new password → logged in with it", async () => {
    switchBrowser("forgetful");
    const r = await call(forgot, { body: { email: "noah@nyu.edu" } });
    expect(r.status).toBe(200);
    // Same answer for unknown emails (no account enumeration).
    expect((await call(forgot, { body: { email: "ghost@nyu.edu" } })).status).toBe(200);
    const link = await lastLink("noah@nyu.edu");
    expect(link).toContain("type=recovery");
    const res = await follow(link!);
    expect(res.headers.get("location")).toContain("/reset-password");

    const weak = await call(reset, { body: { password: "short", confirmPassword: "short" } });
    expect(weak.status).toBe(400);
    const ok = await call(reset, { body: { password: "NewElevator99", confirmPassword: "NewElevator99" } });
    expect(ok.status).toBe(200);

    switchBrowser("fresh");
    expect((await call(login, { body: { email: "noah@nyu.edu", password: PASSWORD } })).status).toBe(401);
    await loginAs("fresh2", "noah@nyu.edu", "NewElevator99");
  });

  it("reset without a recovery session is rejected", async () => {
    switchBrowser("nobody");
    const r = await call(reset, { body: { password: "NewElevator99", confirmPassword: "NewElevator99" } });
    expect(r.status).toBe(401);
  });

  it("changing password requires the current one", async () => {
    await loginAs("changer", "noah@nyu.edu", "NewElevator99");
    const bad = await call(changePassword, { body: { currentPassword: "wrong", password: "Another1234", confirmPassword: "Another1234" } });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toMatch(/current password/);
    const good = await call(changePassword, { body: { currentPassword: "NewElevator99", password: "Another1234", confirmPassword: "Another1234" } });
    expect(good.status).toBe(200);
  });
});

describe("admin bootstrap", () => {
  it("anyone in ADMIN_EMAILS becomes admin on login", async () => {
    await makeUser(db, "boss@nyu.edu", { building: f.tower });
    await loginAs("boss", "boss@nyu.edu");
    const u = await getSessionUser();
    expect(u?.isAdmin).toBe(true);
  });
});
