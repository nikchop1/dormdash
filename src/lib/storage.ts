import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { authMode, env } from "@/lib/env";
import { hmac, safeEqual } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export type Bucket = "avatars" | "id-photos" | "order-photos";
export const PUBLIC_BUCKETS: Bucket[] = ["avatars"];
export const BUCKETS: Bucket[] = ["avatars", "id-photos", "order-photos"];

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel's body limit is 4.5MB; clients downscale first.
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const useSupabase = () => authMode === "supabase" && !!env.supabaseServiceKey;
const localRoot = () => path.resolve(env.storageDir);

function safePath(p: string) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(p) || p.includes("..")) throw new Error("Invalid storage path");
  return p;
}

export async function putObject(bucket: Bucket, objectPath: string, bytes: Uint8Array, contentType: string) {
  safePath(objectPath);
  if (useSupabase()) {
    const { error } = await supabaseAdmin().storage.from(bucket).upload(objectPath, bytes, { contentType, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return;
  }
  const file = path.join(localRoot(), bucket, objectPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  await writeFile(file + ".type", contentType);
}

export async function removeObject(bucket: Bucket, objectPath: string) {
  if (useSupabase()) {
    await supabaseAdmin().storage.from(bucket).remove([objectPath]);
    return;
  }
  await unlink(path.join(localRoot(), bucket, safePath(objectPath))).catch(() => {});
}

/** Short-lived URL for a private object (ID cards, order photos). */
export async function signedUrl(bucket: Bucket, objectPath: string, expiresInSeconds = 600): Promise<string> {
  if (useSupabase()) {
    const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(objectPath, expiresInSeconds);
    if (error || !data) throw new Error(`Couldn't sign URL: ${error?.message}`);
    return data.signedUrl;
  }
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const sig = hmac(`${bucket}/${objectPath}:${exp}`);
  return `/api/files/${bucket}/${objectPath}?exp=${exp}&sig=${sig}`;
}

export function publicUrl(bucket: Bucket, objectPath: string): string {
  if (useSupabase()) return supabaseAdmin().storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
  return `/api/files/${bucket}/${objectPath}`;
}

export function avatarUrl(p: string | null | undefined): string | null {
  return p ? publicUrl("avatars", p) : null;
}

/** Local mode only: read an object after checking its signature. */
export async function readLocalObject(bucket: Bucket, objectPath: string, exp: string | null, sig: string | null) {
  safePath(objectPath);
  if (!PUBLIC_BUCKETS.includes(bucket)) {
    if (!exp || !sig || Number(exp) < Date.now() / 1000) return null;
    if (!safeEqual(sig, hmac(`${bucket}/${objectPath}:${exp}`))) return null;
  }
  const file = path.join(localRoot(), bucket, objectPath);
  try {
    const [bytes, type] = await Promise.all([readFile(file), readFile(file + ".type", "utf8").catch(() => "image/jpeg")]);
    return { bytes, type };
  } catch {
    return null;
  }
}

export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return null;
}
