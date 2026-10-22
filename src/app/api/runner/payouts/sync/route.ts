import { apiUser } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { syncPayoutStatus } from "@/lib/services/runners";

export const POST = route(async () => {
  const user = await apiUser();
  return syncPayoutStatus(user.id);
});
