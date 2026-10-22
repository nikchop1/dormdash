import { readLocalObject, BUCKETS, type Bucket } from "@/lib/storage";

// Local-mode file server. Private buckets require a valid signature from signedUrl().
// In Supabase mode, URLs point at Supabase Storage and this route is unused.
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const [bucket, ...rest] = path;
  if (!BUCKETS.includes(bucket as Bucket) || rest.length === 0) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const obj = await readLocalObject(bucket as Bucket, rest.join("/"), url.searchParams.get("exp"), url.searchParams.get("sig")).catch(() => null);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(obj.bytes), {
    headers: {
      "Content-Type": obj.type,
      "Cache-Control": bucket === "avatars" ? "public, max-age=3600" : "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
