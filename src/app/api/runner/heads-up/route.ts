import { apiRunner } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { headingToBuilding } from "@/lib/services/orders";

// "Heading to building": every customer in the run with picked-up food gets the 2-minute heads-up.
export const POST = route(async () => {
  const user = await apiRunner();
  return headingToBuilding(user.id);
});
