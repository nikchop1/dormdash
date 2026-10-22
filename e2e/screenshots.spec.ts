import { mkdirSync } from "node:fs";
import { test, type Browser, type Page } from "@playwright/test";
import { DEMO_PASSWORD } from "./helpers";

// Visual audit capture. Every major page, as each role, at phone and desktop widths,
// in light and dark. Output: docs/screenshots/<role>--<page>--<width>-<theme>.png
const OUT = "docs/screenshots";
const WIDTHS = [390, 1280] as const;
const THEMES = ["light", "dark"] as const;
const ONLY = process.env.SHOT_FILTER ? new RegExp(process.env.SHOT_FILTER) : null;

type Shot = { name: string; path: string | ((page: Page) => Promise<string>) };

async function firstHref(page: Page, url: string, selector: string) {
  await page.goto(url);
  const href = await page.locator(selector).first().getAttribute("href");
  if (!href) throw new Error(`No link for ${selector} on ${url}`);
  return href;
}

const ROLES: { role: string; email: string | null; shots: Shot[] }[] = [
  {
    role: "public",
    email: null,
    shots: [
      { name: "landing", path: "/" },
      { name: "login", path: "/login" },
      { name: "signup", path: "/signup" },
      { name: "forgot-password", path: "/forgot-password" },
      { name: "terms", path: "/legal/terms" },
      { name: "not-found", path: "/this-floor-does-not-exist" },
      { name: "offline", path: "/offline" },
    ],
  },
  {
    role: "customer",
    email: "customer1@nyu.edu",
    shots: [
      { name: "home", path: "/home" },
      { name: "order-new", path: (p) => firstHref(p, "/home", 'ul[aria-label="Pickup spots"] a') },
      { name: "orders", path: "/orders" },
      { name: "order-live", path: (p) => firstHref(p, "/orders", 'section:has(h2:text("In progress")) a') },
      { name: "order-delivered", path: (p) => firstHref(p, "/orders", 'ul[aria-label="Past orders"] a') },
      { name: "profile", path: "/profile" },
      { name: "profile-edit", path: "/profile/edit" },
      { name: "notification-settings", path: "/profile/notifications" },
      { name: "notifications", path: "/notifications" },
      { name: "run-pitch", path: "/run" },
    ],
  },
  {
    role: "runner",
    email: "runner1@nyu.edu",
    shots: [
      { name: "run-board", path: "/run" },
      { name: "job", path: (p) => firstHref(p, "/run", 'section:has(h2:text("Your jobs")) a') },
      { name: "shifts", path: "/run/shifts" },
      { name: "earnings", path: "/run/earnings" },
    ],
  },
  { role: "pending-runner", email: "pending@nyu.edu", shots: [{ name: "run-pending", path: "/run" }] },
  {
    role: "admin",
    email: "admin@nyu.edu",
    shots: [
      { name: "dashboard", path: "/admin" },
      { name: "orders", path: "/admin/orders" },
      { name: "disputes", path: "/admin/disputes" },
      { name: "dispute", path: (p) => firstHref(p, "/admin/disputes", 'ul a[href^="/admin/disputes/"]') },
      { name: "runner-applications", path: "/admin/runners" },
      { name: "users", path: "/admin/users" },
      { name: "places", path: "/admin/places" },
      { name: "pricing", path: "/admin/pricing" },
      { name: "flags", path: "/admin/flags" },
    ],
  },
];

async function capture(browser: Browser, role: (typeof ROLES)[number], width: number, theme: "light" | "dark") {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: theme, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  if (role.email) {
    const r = await page.request.post("/api/auth/login", { data: { email: role.email, password: DEMO_PASSWORD } });
    if (!r.ok()) throw new Error(`login ${role.email} failed`);
  }
  for (const s of role.shots) {
    const file = `${role.role}--${s.name}--${width}-${theme}`;
    if (ONLY && !ONLY.test(file)) continue;
    const path = typeof s.path === "string" ? s.path : await s.path(page);
    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    // Grow the viewport to the page height so fixed bars (nav, checkout) sit where a user sees them.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height: Math.min(Math.max(height, 600), 8000) });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/${file}.png` });
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  }
  await ctx.close();
}

test("capture design audit screenshots", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  for (const role of ROLES) for (const w of WIDTHS) for (const t of THEMES) await capture(browser, role, w, t);
});

test("capture the verify-email screen for a new signup", async ({ browser }) => {
  for (const w of WIDTHS)
    for (const t of THEMES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, colorScheme: t });
      const page = await ctx.newPage();
      await page.goto("/signup");
      const buildingId = await page.locator('select option[value]:not([value=""])').first().getAttribute("value");
      const n = String(Date.now()).slice(-4);
      const r = await page.request.post("/api/auth/signup", {
        data: { fullName: "Casey Morgan", email: `shot${w}${t}${n}@nyu.edu`, phone: `646555${n}`, password: "elevator14", confirmPassword: "elevator14", buildingId, floor: 4, room: "402", agreeTerms: true },
      });
      if (!r.ok()) throw new Error(`signup failed: ${await r.text()}`);
      await page.goto("/verify-email", { waitUntil: "networkidle" });
      await page.screenshot({ path: `${OUT}/unverified--verify-email--${w}-${t}.png`, fullPage: true });
      await ctx.close();
      await new Promise((res) => setTimeout(res, 5)); // unique phone suffix per capture
    }
});
