import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function fieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function parseWith<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const fields = fieldErrors(r.error);
    throw new ApiError(400, "invalid", Object.values(fields)[0] ?? "Check the highlighted fields.", fields);
  }
  return r.data;
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "bad_json", "That request didn't make sense to us. Refresh and try again.");
  }
  return parseWith(schema, body);
}

function isNextControlFlow(e: unknown): boolean {
  if (!e || typeof e !== "object" || !("digest" in e)) return false;
  const d = (e as { digest: unknown }).digest;
  return typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR") || d === "NEXT_NOT_FOUND");
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) {
    return Response.json({ error: { code: e.code, message: e.message, fields: e.fields } }, { status: e.status });
  }
  if (isNextControlFlow(e)) throw e;
  console.error("[api]", e);
  return Response.json(
    { error: { code: "server_error", message: "Something broke on our end. Try again in a moment." } },
    { status: 500 },
  );
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response | object | void>;

/** Wrap a route handler: JSON responses, consistent error shape. */
export function route<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return Response.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
