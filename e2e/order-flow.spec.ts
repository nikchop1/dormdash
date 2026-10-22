import { expect, test } from "@playwright/test";
import { apiLogin, emailLink, photoFile } from "./helpers";

// The whole marketplace loop, in two browsers:
// sign up -> verify email -> place order -> runner claims -> pickup -> deliver with PIN -> rating.
test("customer and runner complete a delivery end to end", async ({ browser }) => {
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
  await expect(customer.getByRole("heading", { name: "Verify your email" })).toBeVisible();

  // Unverified users can't reach the app.
  await customer.goto("/home");
  await expect(customer).toHaveURL(/\/login/);

  // ---- verify (simulated inbox) ----
  const link = await emailLink(customer.request, email, /Confirm your FloorDrop email/);
  await customer.goto(link);
  await expect(customer).toHaveURL(/\/home\?welcome=1/);
  await expect(customer.getByText("You're verified. Welcome in.")).toBeVisible();

  // ---- place an order ----
  await customer.getByRole("link", { name: /8th Street Corner Store/ }).click();
  await expect(customer.getByRole("heading", { name: "8th Street Corner Store" })).toBeVisible();
  await customer.getByLabel("Order number").fill("7731");
  await customer.getByLabel("Confirmation screenshot").setInputFiles(photoFile("receipt.png"));
  await expect(customer.getByText("Uploaded")).toBeVisible();
  await expect(customer.getByRole("button", { name: "Review" })).toBeEnabled();
  await customer.getByRole("button", { name: "Review" }).click();
  const sheet = customer.getByRole("dialog", { name: "Confirm and pay" });
  await expect(sheet.getByText("Delivery fee", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: /^Pay \$\d+\.\d\d and place order$/ }).click();
  await expect(customer).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(customer.getByText("Finding a runner")).toBeVisible();
  const orderUrl = customer.url();

  // ---- runner claims ----
  const runner = await (await browser.newContext()).newPage();
  await apiLogin(runner, "runner1@nyu.edu");
  await runner.goto("/run");
  await expect(runner.getByRole("switch", { name: /On shift/ })).toBeVisible();
  await runner.getByRole("button", { name: "Claim 8th Street Corner Store to floor 11" }).click();
  await expect(runner).toHaveURL(/\/run\/jobs\//);
  await expect(runner.getByText("Name on order")).toBeVisible();

  // Customer sees the claim (live refresh).
  await expect(customer.getByText("Maya is running it")).toBeVisible({ timeout: 20_000 });
  await expect(customer.getByText("Arriving")).toBeVisible();

  // ---- pickup with bag photo ----
  await runner.getByLabel("Photo of the bag").setInputFiles(photoFile("bag.png"));
  await expect(runner.getByText("Uploaded")).toBeVisible();
  await runner.getByRole("button", { name: "I have the bag" }).click();
  await runner.getByRole("button", { name: "Heading over now" }).click();
  await expect(runner.getByLabel("PIN digit 1")).toBeVisible();

  // ---- deliver with the customer's PIN ----
  await customer.goto(orderUrl);
  const pinLabel = await customer.getByLabel(/^PIN \d \d \d \d$/).getAttribute("aria-label");
  const pin = pinLabel!.replace(/\D/g, "");
  expect(pin).toMatch(/^\d{4}$/);

  // A wrong PIN is rejected first.
  const wrong = pin === "0000" ? "1111" : "0000";
  for (let i = 0; i < 4; i++) await runner.getByLabel(`PIN digit ${i + 1}`).fill(wrong[i]);
  await expect(runner.getByText(/That's not the PIN/)).toBeVisible();
  await runner.reload();
  for (let i = 0; i < 4; i++) await runner.getByLabel(`PIN digit ${i + 1}`).fill(pin[i]);
  await expect(runner.getByText(/Delivered\. Nice\./)).toBeVisible();

  // ---- customer sees delivered and rates ----
  await customer.reload();
  await expect(customer.getByText("Delivered", { exact: true }).first()).toBeVisible();
  await customer.getByRole("radio", { name: "5 stars" }).click();
  await customer.getByLabel("Anything to add?").fill("Up to 11 in no time.");
  await customer.getByRole("button", { name: "Send rating" }).click();
  await expect(customer.getByRole("heading", { name: "You rated Maya" })).toBeVisible();
});
