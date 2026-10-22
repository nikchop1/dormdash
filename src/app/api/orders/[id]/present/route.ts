import { apiUser } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { customerPresent } from "@/lib/services/orders";

// "I'm at my door and the runner isn't here."
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const user = await apiUser();
  await customerPresent(user.id, id);
  return { ok: true };
});
