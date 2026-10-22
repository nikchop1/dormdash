"use client";

async function load(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = URL.createObjectURL(file);
  });
}

function toBlob(canvas: HTMLCanvasElement, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image."))), "image/jpeg", quality));
}

/** Downscale so the longest side is <= max px and re-encode as JPEG (keeps uploads well under 4MB). */
export async function downscale(file: File, max = 1600): Promise<Blob> {
  const img = await load(file);
  const w = img.width;
  const h = img.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return toBlob(canvas);
}

/** Square crop. `zoom` >= 1 and offsets in -1..1 move the crop window. */
export async function cropSquare(file: File, opts: { zoom: number; x: number; y: number; size?: number }): Promise<Blob> {
  const img = await load(file);
  const size = opts.size ?? 512;
  const side = Math.min(img.width, img.height) / opts.zoom;
  const maxX = (img.width - side) / 2;
  const maxY = (img.height - side) / 2;
  const sx = maxX + opts.x * maxX;
  const sy = maxY + opts.y * maxY;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return toBlob(canvas, 0.88);
}
