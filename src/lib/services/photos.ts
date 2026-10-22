import "server-only";
import { randomUUID } from "node:crypto";
import { q, q1, type Queryable } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { randomToken, sha256 } from "@/lib/crypto";
import { checkLocation, type LocationResult } from "@/lib/domain/handoff";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, putObject, removeObject, signedUrl, sniffImageType, type Bucket } from "@/lib/storage";

export type PhotoKind = "avatar" | "id_card" | "confirmation" | "pickup" | "door" | "problem" | "case";

/** Evidence must come from the in-app live camera. Never a gallery pick. */
export const EVIDENCE_KINDS: PhotoKind[] = ["pickup", "door", "problem", "case"];

export const BUCKET_FOR: Record<PhotoKind, Bucket> = {
  avatar: "avatars",
  id_card: "id-photos",
  confirmation: "order-photos",
  pickup: "order-photos",
  door: "order-photos",
  problem: "order-photos",
  case: "order-photos",
};

const CAMERA_TOKEN_TTL_SECONDS = 180;

/** Issued when the in-app camera opens; one upload per token. */
export async function issueCameraToken(userId: string, kind: PhotoKind) {
  if (!EVIDENCE_KINDS.includes(kind)) throw new ApiError(400, "bad_kind", "That photo doesn't use the camera.");
  const token = randomToken(24);
  await q("insert into public.camera_tokens (token_hash, user_id, kind, expires_at) values ($1, $2, $3, now() + make_interval(secs => $4))", [
    sha256(token),
    userId,
    kind,
    CAMERA_TOKEN_TTL_SECONDS,
  ]);
  return { token, expiresInSeconds: CAMERA_TOKEN_TTL_SECONDS };
}

async function consumeCameraToken(userId: string, kind: PhotoKind, token: string | null) {
  if (!token) return false;
  const row = await q1(
    `update public.camera_tokens set used_at = now()
     where token_hash = $1 and user_id = $2 and kind = $3 and used_at is null and expires_at > now() returning 1`,
    [sha256(token), userId, kind],
  );
  return !!row;
}

/** Gallery photos from phones almost always carry EXIF; the in-app camera's canvas output never does. */
function hasExif(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 64 * 1024))).toString("latin1");
  return head.includes("Exif\u0000\u0000");
}

export type LocationReading = { status: "ok"; lat: number; lng: number } | { status: "denied" | "unavailable" };

/** Validate and store an uploaded image. Evidence kinds require a live-camera token. */
export async function savePhoto(
  userId: string,
  kind: PhotoKind,
  file: File,
  opts: { cameraToken?: string | null; location?: { reading: LocationReading; target: { lat: number; lng: number }; radiusM: number } | null } = {},
) {
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "too_large", "That photo is over 4 MB. Try again.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type || !ALLOWED_TYPES.includes(type)) throw new ApiError(415, "bad_type", "Upload a JPG, PNG or WebP image.");
  const evidence = EVIDENCE_KINDS.includes(kind);
  if (evidence) {
    if (type !== "image/jpeg" || hasExif(bytes)) {
      throw new ApiError(400, "camera_required", "Evidence photos have to be taken with the in-app camera, not picked from your gallery.");
    }
    if (!(await consumeCameraToken(userId, kind, opts.cameraToken ?? null))) {
      throw new ApiError(400, "camera_required", "Evidence photos have to be taken with the in-app camera. Open the camera and take it again.");
    }
  }
  let locationStatus: LocationResult | null = null;
  let distanceM: number | null = null;
  if (opts.location) {
    const r = checkLocation(opts.location.reading, opts.location.target, opts.location.radiusM);
    locationStatus = r.status;
    distanceM = r.distanceM;
  }
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${kind}/${randomUUID()}.${ext}`;
  const bucket = BUCKET_FOR[kind];
  await putObject(bucket, path, bytes, type);
  const row = await q1<{ id: string; captured_at: Date }>(
    `insert into public.photos (kind, bucket, path, uploaded_by, via_camera, captured_at, location_status, distance_m)
     values ($1, $2, $3, $4, $5, now(), $6, $7) returning id, captured_at`,
    [kind, bucket, path, userId, evidence, locationStatus, distanceM],
  );
  return { id: row!.id, path, bucket, capturedAt: row!.captured_at, locationStatus, distanceM };
}

/** Claim an uploaded, still-unattached photo of the right kind for this user. */
export async function takePhoto(t: Queryable, photoId: string, userId: string, kind: PhotoKind) {
  const [p] = await t.query<{ id: string; path: string; order_id: string | null; case_id: string | null; location_status: LocationResult | null; distance_m: number | null; via_camera: boolean }>(
    "select id, path, order_id, case_id, location_status, distance_m, via_camera from public.photos where id = $1 and uploaded_by = $2 and kind = $3 and deleted_at is null",
    [photoId, userId, kind],
  );
  if (!p) throw new ApiError(400, "photo_missing", "We couldn't find that photo. Take it again.");
  if (p.order_id || p.case_id) throw new ApiError(400, "photo_used", "That photo is already attached to something else. Take a new one.");
  if (EVIDENCE_KINDS.includes(kind) && !p.via_camera) throw new ApiError(400, "camera_required", "That photo has to come from the in-app camera.");
  return p;
}

export type OrderPhoto = { id: string; kind: PhotoKind; url: string; created_at: Date; location_status: LocationResult | null; distance_m: number | null };

export async function orderPhotos(orderId: string, kinds?: PhotoKind[]): Promise<OrderPhoto[]> {
  const rows = await q<{ id: string; kind: PhotoKind; bucket: Bucket; path: string; created_at: Date; location_status: LocationResult | null; distance_m: number | null }>(
    `select ph.id, ph.kind, ph.bucket, ph.path, coalesce(ph.captured_at, ph.created_at) as created_at, ph.location_status, ph.distance_m
     from public.photos ph left join public.cases c on c.id = ph.case_id
     where (ph.order_id = $1 or c.order_id = $1) and ph.deleted_at is null order by ph.created_at`,
    [orderId],
  );
  const filtered = kinds ? rows.filter((r) => kinds.includes(r.kind)) : rows;
  return Promise.all(
    filtered.map(async (r) => ({ id: r.id, kind: r.kind, created_at: r.created_at, location_status: r.location_status, distance_m: r.distance_m, url: await signedUrl(r.bucket, r.path) })),
  );
}

/**
 * Retention: delete evidence photos N days after an order closes, unless a case on
 * that order is still open. Ledger records are kept.
 */
export async function purgeOldEvidence(days: number) {
  const rows = await q<{ id: string; bucket: Bucket; path: string }>(
    `select ph.id, ph.bucket, ph.path from public.photos ph
     join public.orders o on o.id = ph.order_id
     where ph.deleted_at is null and ph.kind in ('pickup','door','problem','case','confirmation')
       and coalesce(o.delivered_at, o.no_show_at, o.cancelled_at) < now() - make_interval(days => $1)
       and not exists (select 1 from public.cases c where c.order_id = o.id and c.status <> 'resolved')`,
    [days],
  );
  for (const r of rows) {
    await removeObject(r.bucket, r.path).catch(() => {});
    await q("update public.photos set deleted_at = now() where id = $1", [r.id]);
  }
  return { deleted: rows.length };
}
