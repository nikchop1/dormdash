import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, emailLink } from "./helpers";

test("login, persistent session, and logout", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("NYU email").fill("customer2@nyu.edu");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password1");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/don't match\. \d tries left/)).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // Survives a reload (cookie session).
  await page.reload();
  await expect(page.getByRole("heading", { name: /What are we bringing up/i })).toBeVisible();

  // Signed-in users are bounced off /login.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/home$/);

  // Logout from the profile menu.
  await page.goto("/profile");
  await page.getByRole("button", { name: "Log out" }).last().click();
  await expect(page).toHaveURL("/");
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Forders/);
});

test("route protection returns you to the page you wanted", async ({ page }) => {
  await page.goto("/run/earnings");
  await expect(page).toHaveURL(/\/login\?next=%2Frun%2Fearnings/);
  await page.getByLabel("NYU email").fill("runner2@nyu.edu");
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/run\/earnings$/);
  await expect(page.getByRole("heading", { name: "Earnings" })).toBeVisible();
});

test("role protection: customers can't reach admin or runner pages", async ({ page }) => {
  const r = await page.request.post("/api/auth/login", { data: { email: "customer3@nyu.edu", password: DEMO_PASSWORD } });
  expect(r.ok()).toBeTruthy();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/home\?error=forbidden/);
  await expect(page.getByText("That page is admins only")).toBeVisible();
  await page.goto("/run/shifts");
  await expect(page).toHaveURL(/\/run$/);
  await expect(page.getByRole("heading", { name: "Get paid on your way home" })).toBeVisible();
  const api = await page.request.get("/api/admin/export?report=summary");
  expect(api.status()).toBe(403);
});

test("admins can reach the dashboard", async ({ page }) => {
  await page.request.post("/api/auth/login", { data: { email: "admin@nyu.edu", password: DEMO_PASSWORD } });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Last 30 days" })).toBeVisible();
  await expect(page.getByText("Platform revenue").first()).toBeVisible();
});

test("password reset by email", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("NYU email").fill("customer4@nyu.edu");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();
  const link = await emailLink(page.request, "customer4@nyu.edu", /Reset your Dormdash password/);
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password/);
  await page.getByLabel("New password", { exact: true }).fill("Brandnew2026");
  await page.getByLabel("Confirm new password").fill("Brandnew2026");
  await page.getByRole("button", { name: "Save and log in" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // Old password no longer works; new one does.
  const ctx = page.context();
  await ctx.clearCookies();
  const old = await page.request.post("/api/auth/login", { data: { email: "customer4@nyu.edu", password: DEMO_PASSWORD } });
  expect(old.status()).toBe(401);
  const fresh = await page.request.post("/api/auth/login", { data: { email: "customer4@nyu.edu", password: "Brandnew2026" } });
  expect((await fresh.json()).ok).toBe(true);
});

test("signup rejects non-NYU email in the browser", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("NYU email").fill("someone@gmail.com");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Use your @nyu\.edu email/)).toBeVisible();
});
