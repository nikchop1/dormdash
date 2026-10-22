import path from "node:path";
import { vi } from "vitest";

// Env must be set before app modules load (they read process.env at import time).
process.env.LOCAL_STORAGE_DIR = path.resolve(".data/test-storage");
process.env.APP_SECRET = "test-secret";
process.env.ADMIN_EMAILS = "boss@nyu.edu";
delete process.env.DATABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * Each test "browser" has its own cookie jar; `useBrowser(name)` switches which jar
 * next/headers cookies() reads and writes, so one test can act as several users.
 */
type Jar = Map<string, string>;
const jars = new Map<string, Jar>();
let current = "default";
const jar = () => {
  if (!jars.has(current)) jars.set(current, new Map());
  return jars.get(current)!;
};

export function useBrowser(name: string) {
  current = name;
}
export function clearBrowsers() {
  jars.clear();
  current = "default";
}
export function cookieValue(name: string) {
  return jar().get(name);
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar().has(n) ? { name: n, value: jar().get(n)! } : undefined),
    getAll: () => [...jar()].map(([name, value]) => ({ name, value })),
    has: (n: string) => jar().has(n),
    set: (n: string | { name: string; value: string }, v?: string) => {
      if (typeof n === "object") jar().set(n.name, n.value);
      else jar().set(n, v ?? "");
    },
    delete: (n: string) => jar().delete(n),
  }),
  headers: async () => new Headers({ "x-pathname": "/home" }),
}));

// redirect()/notFound() aren't exercised by API routes, but keep them throwing like Next does.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;${url}` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
  },
}));
