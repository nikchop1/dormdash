import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// `npm run screenshots`: captures every major page for the design audit into docs/screenshots.
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ["**/screenshots.spec.ts"],
  timeout: 600_000,
});
