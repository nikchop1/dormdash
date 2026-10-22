import { apiUser } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { capturePayment } from "@/lib/services/orders";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const user = await apiUser();
  return capturePayment(id, user.id);
});
