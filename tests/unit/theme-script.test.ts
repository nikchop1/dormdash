import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeScript, themeScript } from "@/components/theme-script";

/** Run the inline script against a fake document + storage, like the browser does before paint. */
function runScript(stored: string | null, opts: { storageThrows?: boolean } = {}) {
  const documentElement = { dataset: {} as Record<string, string> };
  const localStorage = {
    getItem: () => {
      if (opts.storageThrows) throw new Error("SecurityError");
      return stored;
    },
  };
  new Function("localStorage", "document", themeScript)(localStorage, { documentElement });
  return documentElement.dataset.theme;
}

describe("theme script", () => {
  it("is in the server HTML so the saved theme applies before first paint", () => {
    const html = renderToString(createElement(ThemeScript));
    expect(html).toBe(`<script>${themeScript}</script>`);
  });

  it("applies a saved light or dark theme and ignores anything else", () => {
    expect(runScript("dark")).toBe("dark");
    expect(runScript("light")).toBe("light");
    expect(runScript(null)).toBeUndefined();
    expect(runScript("<img onerror=alert(1)>")).toBeUndefined();
  });

  it("doesn't break the page when storage is blocked", () => {
    expect(runScript("dark", { storageThrows: true })).toBeUndefined();
  });
});
