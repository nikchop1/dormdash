// Generates the PWA PNG icons from the logo geometry (elevator doors + lit up-arrow).
// Run: npx tsx scripts/make-icons.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { png, type Rect } from "./png";

const INK: [number, number, number] = [27, 26, 23];
const PAPER: [number, number, number] = [244, 239, 230];
const MUSTARD: [number, number, number] = [239, 178, 28];

function icon(size: number, padding: number) {
  const u = (size - padding * 2) / 28; // logo is drawn on a 28-unit grid
  const at = (x: number) => Math.round(padding + x * u);
  const rects: Rect[] = [];
  // up-arrow: stacked rows approximating the triangle (14,4.5)-(18,9.5)-(10,9.5)
  const rows = Math.max(4, Math.round(5 * u));
  for (let i = 0; i < rows; i++) {
    const t = (i + 1) / rows;
    const half = 4 * t;
    rects.push({ x: at(14 - half), y: at(4.5 + 5 * (i / rows)), w: Math.max(1, Math.round(half * 2 * u)), h: Math.ceil((5 * u) / rows) + 1, color: MUSTARD });
  }
  rects.push({ x: at(6), y: at(12), w: Math.round(7 * u), h: Math.round(12 * u), color: PAPER });
  rects.push({ x: at(15), y: at(12), w: Math.round(7 * u), h: Math.round(12 * u), color: PAPER });
  return png(size, size, INK, rects);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", icon(192, 8));
writeFileSync("public/icons/icon-512.png", icon(512, 20));
writeFileSync("public/icons/maskable-512.png", icon(512, 90));
writeFileSync("public/icons/apple-touch-icon.png", icon(180, 14));
console.log("Icons written to public/icons");
