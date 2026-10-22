import { expect, test } from "@playwright/test";
import { apiLogin, cameraContext, emailLink, photoFile } from "./helpers";

// The whole marketplace loop, in two browsers:
// sign up -> verify -> order (food total) -> runner takes it -> live-camera pickup ->
// heads-up -> live-camera door photo -> wrong PIN -> right PIN -> paid -> rating.
test("customer and runner complete a food-for-PIN delivery end to end", async ({ browser }) => {
  const email = `e2e${Date.now()}@nyu.edu`;
  const phone = `(212) 555-${String(Date.now()).slice(-4)}`;
  const customer = await (await browser.newContext()).newPage();

  // ---- sign up ----
  await customer.goto("/signup");
  await customer.getByLabel("Full name").fill("Riley Park");
  await customer.getByLabel("NYU email").fill(email);
  await customer.getByLabel("Phone").fill(phone);
  await customer.getByLabel("Password", { exact: true }).fill("elevator1411");
  await customer.getByLabel("Confirm password").fill("elevator1411");
  await customer.getByLabel("Dorm building").selectOption({ label: "Tower Hall" });
  await customer.getByLabel("Floor", { exact: true }).fill("11");
  await customer.getByLabel("Room", { exact: true }).fill("1104");
  await customer.getByRole("checkbox").check();
  await customer.getByRole("button", { name: "Create account" }).click();
  await expect(customer).toHaveURL(/\/verify-email/);

  // Unverified users can't reach the app.
  await customer.goto("/home");
  await expect(customer).toHaveURL(/\/login/);

  // ---- verify (simulated inbox) ----
  const link = await emailLink(customer.request, email, /Confirm your Dormdash email/);
  await customer.goto(link);
  await expect(customer).toHaveURL(/\/home\?welcome=1/);

  // ---- place an order: food total, no PIN shown before paying ----
  await customer.getByRole("link", { name: /8th Street Corner Store/ }).click();
  await expect(customer.getByRole("heading", { name: "8th Street Corner Store" })).toBeVisible();
  await customer.getByLabel("Order number").fill("7731");
  await customer.getByLabel("Confirmation screenshot").setInputFiles(photoFile("receipt.png"));
  await expect(customer.getByText("Uploaded")).toBeVisible();
  await customer.getByLabel("Food total on your receipt ($)").fill("14.50");
  await expect(customer.getByRole("button", { name: "Review" })).toBeEnabled();
  await customer.getByRole("button", { name: "Review" }).click();
  const sheet = customer.getByRole("dialog", { name: "Confirm and pay" });
  await expect(sheet.getByText("Delivery fee", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Delivery guarantee").first()).toBeVisible();
  await sheet.getByRole("button", { name: /^Pay \$\d+\.\d\d and place order$/ }).click();
  await expect(customer).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(customer.getByText("Finding a runner")).toBeVisible();
  const orderUrl = customer.url();

  // ---- runner takes it from the board ----
  const runnerCtx = await cameraContext(browser);
  const runner = await runnerCtx.newPage();
  // Diego has no live orders, so the run screen holds just this one.
  await apiLogin(runner, "runner2@nyu.edu");
  expect((await runner.request.post("/api/runner/shift", { data: { on: true } })).ok()).toBeTruthy();
  await runner.goto("/run");
  await runner.getByRole("checkbox", { name: "Pick 8th Street Corner Store to floor 11" }).check();
  await runner.getByRole("button", { name: /^Take 1 · / }).click();
  await expect(runner).toHaveURL(/\/run\/active/);

  // Customer sees the claim (live refresh).
  await expect(customer.getByText(/Diego/).first()).toBeVisible({ timeout: 20_000 });

  // ---- pickup: live camera, no gallery ----
  await expect(runner.locator('input[type="file"]')).toHaveCount(0);
  await runner.getByRole("button", { name: "Open camera" }).first().click();
  await runner.getByRole("button", { name: "Take photo" }).click();
  await expect(runner.getByText("Photo taken")).toBeVisible();
  await runner.getByRole("button", { name: "Picked up", exact: true }).click();
  await expect(runner.getByText("Picked up").first()).toBeVisible();

  // Last pickup of the run: the customer gets the 2-minute heads-up automatically.
  await customer.goto(orderUrl);
  await expect(customer.getByText("Your runner is about 2 minutes away")).toBeVisible({ timeout: 20_000 });
  await expect(customer.getByText("Say your PIN as you take the bag.")).toBeVisible();

  // ---- at the door: live photo with a location check ----
  await runner.getByRole("button", { name: "Open camera" }).click();
  await runner.getByRole("button", { name: "Take photo" }).click();
  await expect(runner.getByText("Photo taken")).toBeVisible();
  await runner.getByRole("button", { name: "At your door" }).click();
  await expect(runner.getByText("Location verified")).toBeVisible();
  await expect(runner.getByRole("button", { name: "Customer not here" })).toBeDisabled();

  await customer.reload();
  await expect(customer.getByRole("heading", { name: "Your runner is at your door" })).toBeVisible();
  await expect(customer.getByRole("img", { name: "Your bag at your door" })).toBeVisible();
  const pinLabel = await customer.getByLabel(/^PIN \d \d \d \d$/).getAttribute("aria-label");
  const pin = pinLabel!.replace(/\D/g, "");

  // ---- PIN: wrong first, then right ----
  const wrong = pin === "0000" ? "1111" : "0000";
  for (let i = 0; i < 4; i++) await runner.getByLabel(`PIN digit ${i + 1}`).fill(wrong[i]);
  await expect(runner.getByText(/That's not the PIN|didn't work/).first()).toBeVisible();
  await runner.reload();
  for (let i = 0; i < 4; i++) await runner.getByLabel(`PIN digit ${i + 1}`).fill(pin[i]);
  await expect(runner.getByText(/Delivered\. .* is on its way to you\./)).toBeVisible();

  // ---- customer sees delivered and rates ----
  await customer.reload();
  await expect(customer.getByText("Delivered", { exact: true }).first()).toBeVisible();
  await customer.getByRole("radio", { name: "5 stars" }).click();
  await customer.getByLabel("Anything to add?").fill("Up to 11 in no time.");
  await customer.getByRole("button", { name: "Send rating" }).click();
  await expect(customer.getByRole("heading", { name: "You rated Diego" })).toBeVisible();

  // Paid immediately: the earnings page shows the transfer.
  await runner.goto("/run/earnings");
  await expect(runner.getByText(/Paid|Sent/).first()).toBeVisible();
});
