import { apiUser } from "@/lib/auth/session";
import { ApiError, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { savePhoto, type PhotoKind } from "@/lib/services/photos";

// Who may upload what. Avatars go through /api/profile/avatar instead.
const KINDS: Record<Exclude<PhotoKind, "avatar">, "any" | "runner"> = {
  confirmation: "any",
  dispute: "any",
  id_card: "any",
  pickup: "runner",
  dropoff: "runner",
};

export const POST = route(async (req) => {
  const user = await apiUser();
  await limit(`upload:${user.id}`, 40, 3600, "uploads");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "") as keyof typeof KINDS;
  if (!(file instanceof File)) throw new ApiError(400, "no_file", "Pick a photo to upload.");
  if (!(kind in KINDS)) throw new ApiError(400, "bad_kind", "Unknown photo type.");
  if (KINDS[kind] === "runner" && !user.isRunner) throw new ApiError(403, "not_runner", "Only runners can upload that.");
  const photo = await savePhoto(user.id, kind, file);
  return { id: photo.id };
});
