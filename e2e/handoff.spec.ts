import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PRICING } from "../src/lib/domain/pricing";
import { apiLogin, cameraContext, placeOrder, runToDoor } from "./helpers";

// Handoff edge cases: customer not here, "I'm at my door", claims on PIN orders,
// confirmed theft, runner problem reports, and a blocked camera.
test.describe.configure({ mode: "serial" });

async function setCountdown(page: Page, seconds: number) {
  await apiLogin(page, "admin@nyu.edu");
  const r = await page.request.put("/api/admin/pricing", { data: { ...DEFAULT_PRICING, doorCountdownSeconds: seconds } });
  expect(r.ok()).toBeTruthy();
}

let admin: Page;
let runner: Page;

test.beforeAll(async ({ browser }) => {
  admin = await (await browser.newContext()).newPage();
  await setCountdown(admin, 5);
  runner = await (await cameraContext(browser)).newPage();
  // Sam lives in Mercer and has no live orders; these customers live in Mercer too (door handoffs).
  await apiLogin(runner, "runner4@nyu.edu");
  expect((await runner.request.post("/api/runner/shift", { data: { on: true } })).ok()).toBeTruthy();
});

test.afterAll(async () => {
  await setCountdown(admin, DEFAULT_PRICING.doorCountdownSeconds);
});

test("customer not here: unlocks after the countdown and a call; runner paid, no refund", async ({ browser }) => {
  const customer = await (await browser.newContext()).newPage();
  await apiLogin(customer, "customer3@nyu.edu");
  const id = await placeOrder(customer, { spotName: "Mercer Street Deli", floor: 6, room: "602" });
  await runToDoor(runner, id);

  await runner.goto("/run/active");
  const notHere = runner.getByRole("button", { name: "Customer not here" });
  await expect(notHere).toBeDisabled();
  await expect(runner.getByText(/you've called at least once/)).toBeVisible();
  // The call button dials through the app; the API call is what gets logged.
  expect((await runner.request.post(`/api/runner/jobs/${id}/call`)).ok()).toBeTruthy();
  await runner.waitForTimeout(5_000);
  await runner.reload();
  await expect(notHere).toBeEnabled();
  await notHere.click();
  await expect(runner.getByText(/Marked not here\. You get \$\d+\.\d\d/)).toBeVisible();

  await customer.goto(`/orders/${id}`);
  await expect(customer.getByText("Your runner couldn't hand it off")).toBeVisible();
  await expect(customer.getByText(/there.s no refund/)).toBeVisible();
});

test("“I'm at my door” blocks “Customer not here”", async ({ browser }) => {
  const customer = await (await browser.newContext()).newPage();
  await apiLogin(customer, "customer5@nyu.edu");
  const id = await placeOrder(customer, { spotName: "Mercer Street Deli", floor: 3, room: "317" });
  await runToDoor(runner, id);

  await customer.goto(`/orders/${id}`);
  await expect(customer.getByRole("heading", { name: "Your runner is at your door" })).toBeVisible();
  await customer.getByRole("button", { name: "I'm at my door and the runner isn't here" }).click();
  await expect(customer.getByText(/We told your runner you.re waiting/)).toBeVisible();

  expect((await runner.request.post(`/api/runner/jobs/${id}/call`)).ok()).toBeTruthy();
  await runner.waitForTimeout(5_000);
  await runner.goto("/run/active");
  await expect(runner.getByText(/says they're at the door now/)).toBeVisible();
  await expect(runner.getByRole("button", { name: "Customer not here" })).toBeDisabled();

  // The runner finds them: PIN completes it.
  const pin = (await customer.getByLabel(/^PIN \d \d \d \d$/).getAttribute("aria-label"))!.replace(/\D/g, "");
  for (let i = 0; i < 4; i++) await runner.getByLabel(`PIN digit ${i + 1}`).fill(pin[i]);
  await expect(runner.getByText(/Delivered\./)).toBeVisible();

  // A theft claim on a PIN-completed order is rejected automatically...
  const claim = await customer.request.post(`/api/orders/${id}/cases`, { data: { type: "customer_claim", reason: "stolen", description: "Never got it." } });
  const c = await claim.json();
  expect(c.autoRejected).toBe(true);
  await customer.goto(`/cases/${c.caseId}`);
  await expect(customer.getByText("Rejected").first()).toBeVisible();
  await expect(customer.getByText(/proof of handoff/)).toBeVisible();

  // ...but "I gave my PIN but didn't get my food" opens a top-priority case.
  await customer.goto(`/orders/${id}`);
  await customer.getByRole("button", { name: "I gave my PIN but didn’t get my food" }).click();
  await customer.getByRole("button", { name: "Open a top-priority case" }).click();
  await expect(customer).toHaveURL(/\/cases\/[0-9a-f-]{36}$/);
  const caseUrl = customer.url();

  // ---- admin confirms theft from the case queue ----
  await admin.goto("/admin/cases");
  await expect(admin.getByRole("link", { name: /PIN given, no food/ }).first()).toBeVisible();
  await admin.goto(`/admin/cases/${caseUrl.split("/").pop()}`);
  await expect(admin.getByRole("heading", { name: "PIN given, no food" })).toBeVisible();
  await expect(admin.getByText("Photo evidence")).toBeVisible();
  await expect(admin.getByText("Bag at the door").first()).toBeVisible();
  await admin.getByRole("radio", { name: /Confirm theft/ }).click();
  await admin.getByRole("button", { name: "Confirm theft and ban" }).click();
  await expect(admin.getByText("Theft confirmed").first()).toBeVisible();

  // Customer: refund as cash + food credit.
  await customer.goto(caseUrl);
  await expect(customer.getByText("Dormdash credit (food value, fees paid with credit)")).toBeVisible();
  await customer.goto("/profile");
  await expect(customer.getByText(/\$15\.00/).first()).toBeVisible();

  // Runner: banned, sent to the appeal page.
  await runner.goto("/run");
  await expect(runner).toHaveURL(/\/appeal/);
  await expect(runner.getByRole("button", { name: "Send my one appeal" })).toBeVisible();
});

test("runner problem report refunds the customer", async ({ browser }) => {
  const customer = await (await browser.newContext()).newPage();
  await apiLogin(customer, "customer6@nyu.edu");
  const maya = await (await cameraContext(browser)).newPage();
  await apiLogin(maya, "runner1@nyu.edu");
  const id = await placeOrder(customer, { spotName: "8th Street Corner Store", floor: 16, room: "1601", foodValueCents: 1100 });
  expect((await maya.request.post("/api/runner/claim", { data: { orderIds: [id] } })).ok()).toBeTruthy();

  await maya.goto("/run/active");
  await maya.locator(`#order-${id}`).getByRole("button", { name: "Problem with this order" }).click();
  const sheet = maya.getByRole("dialog", { name: "Problem with this order" });
  await sheet.getByLabel("What happened?").selectOption("restaurant_not_ready");
  await sheet.getByLabel("Short note").fill("Closed early tonight.");
  await sheet.getByRole("button", { name: "Open camera" }).click();
  await sheet.getByRole("button", { name: "Take photo" }).click();
  await expect(sheet.getByText("Photo taken")).toBeVisible();
  await maya.getByRole("button", { name: "Report and end this order" }).click();
  await expect(maya.getByText("Reported. The customer has been refunded.")).toBeVisible();

  await customer.goto("/notifications");
  await expect(customer.getByText(/couldn't be delivered/).first()).toBeVisible();
});

test("a blocked camera explains how to allow it; there's no gallery fallback", async ({ browser }) => {
  const ctx = await cameraContext(browser);
  await ctx.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
  });
  const page = await ctx.newPage();
  await apiLogin(page, "runner1@nyu.edu");
  await page.goto("/run/active");
  await page.getByRole("button", { name: "Open camera" }).first().click();
  await expect(page.getByText("Camera access is blocked")).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});
