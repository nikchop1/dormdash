import { devToolsEnabled, firstLink, outbox } from "@/lib/dev";

export async function GET(req: Request) {
  if (!devToolsEnabled()) return new Response("Not found", { status: 404 });
  const to = new URL(req.url).searchParams.get("to") ?? undefined;
  const mails = await outbox(to);
  return Response.json(mails.map((m) => ({ id: m.id, to: m.to_email, subject: m.subject, link: firstLink(m.text), createdAt: m.created_at })));
}
