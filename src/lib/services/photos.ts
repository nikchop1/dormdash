import "server-only";
import { randomUUID } from "node:crypto";
import { q, q1, type Queryable } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, putObject, signedUrl, sniffImageType, type Bucket } from "@/lib/storage";

export type PhotoKind = "avatar" | "id_card" | "confirmation" | "pickup" | "dropoff" | "dispute";

export const BUCKET_FOR: Record<PhotoKind, Bucket> = {
  avatar: "avatars",
  id_card: "id-photos",
  confirmation: "order-photos",
  pickup: "order-photos",
  dropoff: "order-photos",
  dispute: "order-photos",
};

/** Validate and store an uploaded image. Returns the photos row id and path. */
export async function savePhoto(userId: string, kind: PhotoKind, file: File) {
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "too_large", "That photo is over 4 MB. Try a screenshot instead of the original.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type || !ALLOWED_TYPES.includes(type)) throw new ApiError(415, "bad_type", "Upload a JPG, PNG or WebP image.");
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${kind}/${randomUUID()}.${ext}`;
  const bucket = BUCKET_FOR[kind];
  await putObject(bucket, path, bytes, type);
  const row = await q1<{ id: string }>(
    "insert into public.photos (kind, bucket, path, uploaded_by) values ($1, $2, $3, $4) returning id",
    [kind, bucket, path, userId],
  );
  return { id: row!.id, path, bucket };
}

/** Claim an uploaded, still-unattached photo of the right kind for this user. */
export async function takePhoto(t: Queryable, photoId: string, userId: string, kind: PhotoKind) {
  const [p] = await t.query<{ id: string; path: string; order_id: string | null; dispute_id: string | null }>(
    "select id, path, order_id, dispute_id from public.photos where id = $1 and uploaded_by = $2 and kind = $3",
    [photoId, userId, kind],
  );
  if (!p) throw new ApiError(400, "photo_missing", "We couldn't find that photo. Upload it again.");
  if (p.order_id || p.dispute_id) throw new ApiError(400, "photo_used", "That photo is already attached to something else. Upload a new one.");
  return p;
}

export type OrderPhoto = { id: string; kind: PhotoKind; url: string; created_at: Date };

export async function orderPhotos(orderId: string, kinds?: PhotoKind[]): Promise<OrderPhoto[]> {
  const rows = await q<{ id: string; kind: PhotoKind; bucket: Bucket; path: string; created_at: Date }>(
    `select ph.id, ph.kind, ph.bucket, ph.path, ph.created_at from public.photos ph
     left join public.disputes d on d.id = ph.dispute_id
     where ph.order_id = $1 or d.order_id = $1 order by ph.created_at`,
    [orderId],
  );
  const filtered = kinds ? rows.filter((r) => kinds.includes(r.kind)) : rows;
  return Promise.all(filtered.map(async (r) => ({ id: r.id, kind: r.kind, created_at: r.created_at, url: await signedUrl(r.bucket, r.path) })));
}
