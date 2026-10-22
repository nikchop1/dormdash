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

/** 1x1 JPEG with no EXIF, the shape the in-app camera uploads. */
export const cameraJpeg = () =>
  Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

/** Tower Hall: what the fake GPS reports for runners at the door. */
export const TOWER = { latitude: 40.7339, longitude: -73.9962 };

/** Browser context with a fake camera stream and GPS, both already allowed. */
export async function cameraContext(browser: import("@playwright/test").Browser, geo = TOWER) {
  return browser.newContext({ permissions: ["camera", "geolocation"], geolocation: geo });
}

/** Place a demo-paid order through the API as the logged-in customer (ids read from the real pages). */
export async function placeOrder(page: Page, o: { spotName: string; floor: number; room: string; foodValueCents?: number; tipCents?: number }) {
  await page.goto("/home");
  const href = await page.locator(`a[href^="/order/"]`, { hasText: o.spotName }).first().getAttribute("href");
  const spotId = href!.split("/").pop()!;
  await page.goto(href!);
  const buildingId = await page.getByLabel("Building").inputValue();
  const up = await page.request.post("/api/uploads", { multipart: { kind: "confirmation", file: { name: "r.png", mimeType: "image/png", buffer: testPng() } } });
  const { id: confirmationPhotoId } = await up.json();
  const r = await page.request.post("/api/orders", {
    data: { spotId, pickupName: "E2E T", orderNumber: "77", buildingId, floor: o.floor, room: o.room, notes: "", tipCents: o.tipCents ?? 100, foodValueCents: o.foodValueCents ?? 1500, bags: 1, useCredit: false, scheduledFor: null, confirmationPhotoId },
  });
  const body = await r.json();
  if (!r.ok()) throw new Error(`order failed: ${JSON.stringify(body)}`);
  return body.orderId as string;
}

/** Live-camera evidence through the API (token + JPEG + location), as the in-app camera does. */
export async function cameraPhoto(page: Page, kind: "pickup" | "door", orderId: string, location: { status: "ok"; lat: number; lng: number } | { status: "denied" } = { status: "ok", lat: TOWER.latitude, lng: TOWER.longitude }) {
  const { token } = await (await page.request.post("/api/camera/token", { data: { kind } })).json();
  const r = await page.request.post("/api/camera/upload", {
    multipart: { file: { name: "c.jpg", mimeType: "image/jpeg", buffer: cameraJpeg() }, meta: JSON.stringify({ kind, token, orderId, location }) },
  });
  const body = await r.json();
  if (!r.ok()) throw new Error(`camera upload failed: ${JSON.stringify(body)}`);
  return body.id as string;
}

/** Runner: claim, pick up and arrive at the door, all through the API. */
export async function runToDoor(page: Page, orderId: string) {
  expect((await page.request.post("/api/runner/claim", { data: { orderIds: [orderId] } })).ok()).toBeTruthy();
  expect((await page.request.post(`/api/runner/jobs/${orderId}/pickup`, { data: { photoId: await cameraPhoto(page, "pickup", orderId) } })).ok()).toBeTruthy();
  const r = await page.request.post(`/api/runner/jobs/${orderId}/at-door`, { data: { photoId: await cameraPhoto(page, "door", orderId) } });
  expect(r.ok()).toBeTruthy();
}
