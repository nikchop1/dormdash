// `npm run dev`: starts Next with Turbopack. If Turbopack panics because Windows
// refused to start one of its Node worker processes (exit 0xc0000142, see
// DECISIONS.md "Dev server"), restart on webpack automatically so dev still works.
// Pass-through args: `npm run dev -- -p 3001`. Force webpack: `npm run dev:webpack`.
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const forceWebpack = args.includes("--webpack");
const passthrough = args.filter((a) => a !== "--webpack");

const PANIC = /An unexpected Turbopack error occurred|0xc0000142|node process exited before we could connect/i;
const ALREADY = /Another next dev server is already running/i;

function start(bundler) {
  const flag = bundler === "webpack" ? ["--webpack"] : [];
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", ...flag, ...passthrough], {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });
  let switched = false;
  const watch = (chunk, out) => {
    const text = chunk.toString();
    out.write(text);
    if (bundler === "turbopack" && !switched && PANIC.test(text)) {
      switched = true;
      out.write("\n[dev] Turbopack couldn't start a worker process on this machine. Restarting with webpack (same app, slower rebuilds).\n\n");
      child.kill();
      setTimeout(() => start("webpack"), 500);
    }
    if (ALREADY.test(text)) {
      out.write("\n[dev] A dev server for this folder is already running (see the PID above). Stop it first, or open the URL it printed.\n");
    }
  };
  child.stdout.on("data", (c) => watch(c, process.stdout));
  child.stderr.on("data", (c) => watch(c, process.stderr));
  child.on("exit", (code) => {
    if (!switched) process.exit(code ?? 0);
  });
  const stop = () => child.kill();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

start(forceWebpack ? "webpack" : "turbopack");
