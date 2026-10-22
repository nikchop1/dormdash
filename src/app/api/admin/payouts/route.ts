import { apiAdmin } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { runPayouts } from "@/lib/services/payouts";

export const POST = route(async () => {
  await apiAdmin();
  return runPayouts();
});
