import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT || "3200";

export default defineConfig({
  testDir: "e2e",
  testIgnore: ["**/screenshots.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Evidence photos come from the live camera: Chromium's fake camera stands in for it.
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${PORT}/offline`,
    timeout: 600_000,
    reuseExistingServer: !!process.env.E2E_REUSE,
    stdout: "ignore",
    stderr: "pipe",
  },
});
