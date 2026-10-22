// Boots an isolated Dormdash for Playwright: fresh local database + seed, a
// production build, then `next start`. Never touches your dev database (.data/pglite).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const PORT = process.env.E2E_PORT || "3200";
const env = {
  ...process.env,
  PGLITE_DIR: ".data/e2e-db",
  LOCAL_STORAGE_DIR: ".data/e2e-storage",
  DEV_TOOLS: "1",
  SITE_URL: `http://localhost:${PORT}`,
  ADMIN_EMAILS: "admin@nyu.edu",
  NEXT_TELEMETRY_DISABLED: "1",
};
for (const k of ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "PAYMENTS_PROVIDER", "RESEND_API_KEY"]) delete env[k];

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

rmSync(".data/e2e-db", { recursive: true, force: true });
rmSync(".data/e2e-storage", { recursive: true, force: true });
run("npx", ["tsx", "--conditions=react-server", "scripts/seed.ts"]);
if (process.env.E2E_SKIP_BUILD !== "1" || !existsSync(".next/BUILD_ID")) run("npx", ["next", "build"]);

const server = spawn("npx", ["next", "start", "-p", PORT], { stdio: "inherit", env, shell: process.platform === "win32" });
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
