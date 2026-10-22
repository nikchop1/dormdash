import { apiUser } from "@/lib/auth/session";
import { ApiError, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { savePhoto } from "@/lib/services/photos";

// Non-evidence uploads only (receipt screenshots, NYU ID photos). Evidence photos
// (pickup, door, problem, case) must go through /api/camera/upload with a live-camera token.
const KINDS = ["confirmation", "id_card"] as const;

export const POST = route(async (req) => {
  const user = await apiUser();
  await limit(`upload:${user.id}`, 40, 3600, "uploads");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "");
  if (!(file instanceof File)) throw new ApiError(400, "no_file", "Pick a photo to upload.");
  if (["pickup", "door", "problem", "case", "dropoff", "dispute"].includes(kind)) {
    throw new ApiError(400, "camera_required", "Evidence photos have to be taken with the in-app camera, not uploaded from your gallery.");
  }
  if (!(KINDS as readonly string[]).includes(kind)) throw new ApiError(400, "bad_kind", "Unknown photo type.");
  const photo = await savePhoto(user.id, kind as (typeof KINDS)[number], file);
  return { id: photo.id };
});
