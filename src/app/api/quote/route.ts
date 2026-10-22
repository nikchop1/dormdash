import { apiUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { quoteFor } from "@/lib/services/orders";
import { quoteSchema } from "@/lib/validation";

// Price preview. The order route recomputes this server-side; nothing here is trusted later.
export const POST = route(async (req) => {
  const user = await apiUser();
  const input = await parseJson(req, quoteSchema);
  const { quote } = await quoteFor({ ...input, creditBalanceCents: user.profile.credit_cents });
  // What the same order would cost as a lobby handoff (floor add-on not charged).
  const lobby = await quoteFor({ ...input, creditBalanceCents: user.profile.credit_cents, lobby: true });
  return { quote, lobbyQuote: lobby.quote };
});
