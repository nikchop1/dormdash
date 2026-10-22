// Tiny PNG encoder for seed placeholder photos (no image libraries needed).
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

type RGB = [number, number, number];
export type Rect = { x: number; y: number; w: number; h: number; color: RGB };

/** Draw filled rectangles on a solid background and encode as PNG. */
export function png(width: number, height: number, bg: RGB, rects: Rect[]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      let c = bg;
      for (const r of rects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) c = r.color;
      raw[row + 1 + x * 3] = c[0];
      raw[row + 2 + x * 3] = c[1];
      raw[row + 3 + x * 3] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const INK: RGB = [27, 26, 23];
const PAPER: RGB = [244, 239, 230];
const MUSTARD: RGB = [239, 178, 28];
const LINE: RGB = [217, 208, 193];

/** A mock order-confirmation screenshot. */
export function receiptPng() {
  const rects: Rect[] = [{ x: 0, y: 0, w: 240, h: 44, color: INK }, { x: 16, y: 64, w: 150, h: 18, color: INK }];
  for (let i = 0; i < 6; i++) rects.push({ x: 16, y: 104 + i * 30, w: 140 + ((i * 37) % 60), h: 10, color: LINE });
  rects.push({ x: 16, y: 300, w: 208, h: 2, color: INK }, { x: 16, y: 316, w: 90, h: 14, color: INK }, { x: 160, y: 316, w: 64, h: 14, color: INK });
  rects.push({ x: 16, y: 352, w: 208, h: 40, color: MUSTARD });
  return png(240, 420, PAPER, rects);
}

/** A mock "bag with name on it" pickup photo. */
export function bagPng() {
  return png(320, 320, [120, 108, 92], [
    { x: 80, y: 70, w: 160, h: 210, color: [214, 196, 160] },
    { x: 110, y: 40, w: 100, h: 34, color: [184, 166, 130] },
    { x: 100, y: 150, w: 120, h: 40, color: [250, 250, 245] },
    { x: 112, y: 162, w: 70, h: 14, color: INK },
  ]);
}

export function doorPng() {
  return png(320, 320, [200, 190, 172], [
    { x: 70, y: 20, w: 180, h: 300, color: [110, 80, 52] },
    { x: 210, y: 160, w: 16, h: 16, color: MUSTARD },
    { x: 120, y: 250, w: 80, h: 70, color: [214, 196, 160] },
  ]);
}

export function idPng() {
  return png(340, 214, [236, 236, 236], [
    { x: 0, y: 0, w: 340, h: 40, color: INK },
    { x: 20, y: 60, w: 100, h: 120, color: LINE },
    { x: 140, y: 70, w: 160, h: 14, color: INK },
    { x: 140, y: 100, w: 120, h: 10, color: LINE },
    { x: 140, y: 124, w: 140, h: 10, color: LINE },
  ]);
}
