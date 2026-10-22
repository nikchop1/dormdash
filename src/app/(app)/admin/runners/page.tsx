import type { Metadata } from "next";
import { q } from "@/lib/db";
import { signedUrl } from "@/lib/storage";
import { fmtDateTime } from "@/lib/domain/time";
import { formatPhone } from "@/lib/validation";
import { EmptyState, SectionTitle, Tag } from "@/components/ui/misc";
import { DecideApplication } from "./decide";

export const metadata: Metadata = { title: "Admin · Runners" };

type A = { id: string; legal_name: string; status: string; admin_note: string | null; created_at: Date; reviewed_at: Date | null; id_photo_path: string; email: string | null; phone: string | null; full_name: string; building: string; user_id: string };

export default async function AdminRunners() {
  const apps = await q<A>(
    `select a.*, p.email, p.phone, p.full_name, b.name as building from public.runner_applications a
     join public.profiles p on p.id = a.user_id join public.buildings b on b.id = a.home_building_id
     order by (a.status = 'pending') desc, a.created_at desc limit 100`,
  );
  const pending = apps.filter((a) => a.status === "pending");
  const decided = apps.filter((a) => a.status !== "pending");
  const urls = Object.fromEntries(await Promise.all(pending.map(async (a) => [a.id, await signedUrl("id-photos", a.id_photo_path, 900)] as const)));

  return (
    <div className="pb-10">
      <h1 className="pt-6 pb-4 font-display text-title font-extrabold uppercase">Runner applications</h1>
      <SectionTitle action={<span className="tnum text-small text-ink-3">{pending.length} waiting</span>}>Waiting on you</SectionTitle>
      {pending.length === 0 ? (
        <EmptyState title="Queue's empty">New applications land here and ping you.</EmptyState>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {pending.map((a) => (
            <li key={a.id} className="grid gap-4 rounded-md border border-line bg-surface p-4 md:grid-cols-[220px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[a.id]} alt={`NYU ID submitted by ${a.legal_name}`} className="aspect-[1.6] w-full rounded-xs border border-line object-cover" />
              <div className="flex flex-col gap-3">
                <div>
                  <p className="font-semibold">{a.legal_name} <span className="font-normal text-ink-3">(profile: {a.full_name})</span></p>
                  <p className="tnum text-small text-ink-2">{a.email} · {formatPhone(a.phone)} · lives in {a.building}</p>
                  <p className="tnum text-caption text-ink-3">Applied {fmtDateTime(a.created_at)}</p>
                </div>
                <p className="text-small text-ink-2">Check: name on ID matches, photo is a real NYU ID, not expired.</p>
                <DecideApplication id={a.id} name={a.legal_name} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <SectionTitle className="mt-10">Decided</SectionTitle>
      <table className="w-full text-small">
        <tbody className="tnum divide-y divide-line">
          {decided.map((a) => (
            <tr key={a.id}>
              <td className="py-2 font-semibold">{a.legal_name}</td>
              <td className="py-2"><Tag tone={a.status === "approved" ? "success" : "neutral"}>{a.status}</Tag></td>
              <td className="py-2 text-ink-2">{a.admin_note ?? ""}</td>
              <td className="py-2 text-right text-ink-3">{a.reviewed_at ? fmtDateTime(a.reviewed_at) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
