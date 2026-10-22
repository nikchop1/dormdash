import "server-only";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Anything else is rejected. */
export function cronAuthorized(req: Request): boolean {
  if (!env.cronSecret) return false;
  const header = req.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${env.cronSecret}`);
}

export function cronHandler(job: () => Promise<object>) {
  return async (req: Request) => {
    if (!cronAuthorized(req)) return Response.json({ error: { code: "unauthorized", message: "Bad cron secret." } }, { status: 401 });
    try {
      const result = await job();
      return Response.json({ ok: true, ...result, at: new Date().toISOString() });
    } catch (e) {
      console.error("[cron]", e);
      return Response.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
    }
  };
}
