import { apiUser } from "@/lib/auth/session";
import { q } from "@/lib/db";
import { ApiError, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { savePhoto } from "@/lib/services/photos";
import { avatarUrl, removeObject } from "@/lib/storage";

// The browser crops to a square before upload (see lib/client/image.ts).
export const POST = route(async (req) => {
  const user = await apiUser();
  await limit(`avatar:${user.id}`, 10, 3600, "photo changes");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "no_file", "Pick a photo to upload.");
  const photo = await savePhoto(user.id, "avatar", file);
  const old = user.profile.avatar_path;
  await q("update public.profiles set avatar_path = $2 where id = $1", [user.id, photo.path]);
  if (old) await removeObject("avatars", old).catch(() => {});
  return { url: avatarUrl(photo.path) };
});

export const DELETE = route(async () => {
  const user = await apiUser();
  if (user.profile.avatar_path) await removeObject("avatars", user.profile.avatar_path).catch(() => {});
  await q("update public.profiles set avatar_path = null where id = $1", [user.id]);
  return { ok: true };
});
