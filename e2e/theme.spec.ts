import { expect, test } from "@playwright/test";
import { apiLogin } from "./helpers";

// The saved theme must be on <html> before the body is parsed (no flash of the wrong
// theme), and React must never be left holding a <script> it rendered on the client
// (React warns: "Encountered a script tag while rendering React component").
for (const [system, saved] of [
  ["light", "dark"],
  ["dark", "light"],
] as const) {
  test(`saved ${saved} theme on a ${system} system applies before first paint`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: system });
    await ctx.addInitScript((t) => localStorage.setItem("fd-theme", t), saved);
    await ctx.addInitScript(() => {
      const w = window as unknown as { __themeAtBody?: string };
      const mo = new MutationObserver(() => {
        if (document.body && w.__themeAtBody === undefined) {
          w.__themeAtBody = document.documentElement.dataset.theme ?? "";
          mo.disconnect();
        }
      });
      mo.observe(document, { childList: true, subtree: true });
    });
    const page = await ctx.newPage();
    const scriptWarnings: string[] = [];
    page.on("console", (m) => {
      if (m.text().includes("Encountered a script tag")) scriptWarnings.push(m.text());
    });
    const check = async (path: string) => {
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await page.evaluate(() => (window as unknown as { __themeAtBody?: string }).__themeAtBody), path).toBe(saved);
      await expect(page.locator("html")).toHaveAttribute("data-theme", saved);
      // The inline script ran from the server HTML; React doesn't keep a copy in the DOM.
      expect(await page.evaluate(() => [...document.scripts].filter((s) => s.textContent?.includes("fd-theme")).length), path).toBe(0);
    };

    for (const path of ["/", "/login", "/legal/terms"]) await check(path);
    // Client-side navigation keeps the theme.
    await page.goto("/login");
    await page.getByRole("link", { name: "Terms" }).first().click();
    await expect(page).toHaveURL(/\/legal\/terms/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", saved);

    await apiLogin(page, "customer1@nyu.edu");
    for (const path of ["/home", "/orders", "/profile", "/orders/not-a-real-order"]) await check(path);
    expect(scriptWarnings).toEqual([]);
    await ctx.close();
  });
}
