import { getAuth } from "@/lib/auth";
import { setPendingVerification } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { q1 } from "@/lib/db";
import { ApiError, clientIp, parseJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { emailTaken, phoneTaken } from "@/lib/services/account";
import { getBuilding } from "@/lib/services/places";
import { flag } from "@/lib/settings";
import { signupSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  await limit(`signup-ip:${clientIp(req)}`, 10, 3600, "sign-ups");
  const input = await parseJson(req, signupSchema(env.allowedEmailDomains));
  if (!(await flag("signups_open"))) throw new ApiError(403, "closed", "Sign-ups are paused for a bit. Try again soon.");

  const building = await getBuilding(input.buildingId);
  if (!building?.active) throw new ApiError(400, "invalid", "Pick your building from the list.", { buildingId: "Pick your building from the list." });
  if (input.floor > building.floor_count) {
    const msg = `${building.name} has ${building.floor_count} floors.`;
    throw new ApiError(400, "invalid", msg, { floor: msg });
  }
  const blocked = await q1("select 1 from public.blocked_identities where (kind = 'email' and value = lower($1)) or (kind = 'phone' and value = $2)", [input.email, input.phone]);
  if (blocked) throw new ApiError(403, "blocked", "This email or phone number can't be used to register on Dormdash.");
  if (await emailTaken(input.email)) {
    throw new ApiError(409, "email_taken", "An account with this email already exists. Log in instead?", {
      email: "An account with this email already exists. Log in instead?",
    });
  }
  if (await phoneTaken(input.phone)) {
    throw new ApiError(409, "phone_taken", "That phone number is already on another account.", {
      phone: "That phone number is already on another account.",
    });
  }

  const res = await getAuth().signUp({
    email: input.email,
    password: input.password,
    metadata: {
      full_name: input.fullName,
      phone: input.phone,
      building_id: input.buildingId,
      floor: String(input.floor),
      room: input.room,
      terms_accepted: "true",
    },
  });
  if (!res.ok) {
    if (res.message === "exists") {
      throw new ApiError(409, "email_taken", "An account with this email already exists. Log in instead?", {
        email: "An account with this email already exists. Log in instead?",
      });
    }
    throw new ApiError(400, "signup_failed", "We couldn't create your account. Check your details and try again.");
  }
  await setPendingVerification(input.email);
  return { ok: true, next: "/verify-email" };
});
