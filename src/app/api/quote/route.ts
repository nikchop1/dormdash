import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { quoteFor } from "@/lib/services/orders";
import { quoteSchema } from "@/lib/validation";

// Price preview. The order route recomputes this server-side; nothing here is trusted later.
export const POST = route(async (req) => {
  await apiUser();
  const input = await parseJson(req, quoteSchema);
  const { quote } = await quoteFor(input);
  return { quote };
});
