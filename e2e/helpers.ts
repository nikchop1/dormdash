import { deflateSync } from "node:zlib";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "Dormdash123";

/** Log a browser context in via the real login API (sets the session cookie). */
export async function apiLogin(page: Page, email: string, password = DEMO_PASSWORD) {
  const r = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(r.ok()).toBeTruthy();
  expect((await r.json()).ok).toBe(true);
}

/** Latest link emailed to `to` (local dev outbox). */
export async function emailLink(request: APIRequestContext, to: string, subject?: RegExp) {
  for (let i = 0; i < 20; i++) {
    const res = await request.get(`/api/dev/outbox?to=${encodeURIComponent(to)}`);
    const mails = (await res.json()) as { subject: string; link: string | null }[];
    const m = mails.find((x) => !subject || subject.test(x.subject));
    if (m?.link) return m.link;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email for ${to}`);
}

/** A small valid PNG to upload as a photo. */
export function testPng(): Buffer {
  const w = 64;
  const h = 64;
  const raw = Buffer.alloc((w * 3 + 1) * h, 200);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export const photoFile = (name = "photo.png") => ({ name, mimeType: "image/png", buffer: testPng() });
