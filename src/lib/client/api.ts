"use client";

export class ClientApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

/** JSON fetch with our error envelope. Throws ClientApiError with a human message. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ClientApiError(0, "offline", "You look offline. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ClientApiError(res.status, e.code ?? "error", e.message ?? "Something went wrong. Try again.", e.fields);
  }
  return data as T;
}

/** Upload a photo (already downscaled). Returns the photos row id. */
export async function uploadPhoto(file: Blob, kind: string): Promise<{ id: string; url?: string }> {
  const form = new FormData();
  form.append("file", file, "photo.jpg");
  form.append("kind", kind);
  let res: Response;
  try {
    res = await fetch("/api/uploads", { method: "POST", body: form, credentials: "same-origin" });
  } catch {
    throw new ClientApiError(0, "offline", "Upload failed. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ClientApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? "Upload failed. Try again.");
  return data;
}
