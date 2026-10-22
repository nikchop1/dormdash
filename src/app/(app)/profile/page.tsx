import type { Metadata } from "next";
import { Bell, Footprints, KeyRound, Receipt, Star, Trash2, UserRound, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getBuilding } from "@/lib/services/places";
import { avatarUrl } from "@/lib/storage";
import { formatPhone } from "@/lib/validation";
import { LogoutButton, ThemeSwitcher } from "@/components/account-controls";
import { Avatar, FloorBadge, List, Notice, Row, SectionTitle, Tag } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Profile" };

const RUNNER_TAG = {
  none: null,
  pending: <Tag tone="warning">Application in review</Tag>,
  approved: <Tag tone="success">Approved runner</Tag>,
  rejected: <Tag>Not approved</Tag>,
  suspended: <Tag tone="danger">Running paused</Tag>,
} as const;

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const p = user.profile;
  const building = p.building_id ? await getBuilding(p.building_id) : null;
  const icon = (I: typeof Bell) => <I className="size-5 text-ink-2" strokeWidth={1.75} aria-hidden />;

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      {sp.email_changed && <Notice tone="success" className="mt-4" title="Email updated">You&rsquo;ll log in with {user.email} from now on.</Notice>}
      <header className="flex items-center gap-4 pt-6 pb-6">
        <Avatar src={avatarUrl(p.avatar_path)} name={p.full_name} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-title font-extrabold">{p.full_name}</h1>
          <p className="truncate text-small text-ink-2">{user.email}</p>
          <p className="tnum text-small text-ink-3">{formatPhone(p.phone)}</p>
        </div>
      </header>
      <div className="mb-8 flex items-center gap-3 border-y border-line py-3">
        {p.floor && <FloorBadge floor={p.floor} />}
        <p className="flex-1 text-small">
          <span className="font-semibold">{building?.name ?? "No building set"}</span>
          <span className="text-ink-2"> · Room {p.room}</span>
        </p>
        {RUNNER_TAG[p.runner_status]}
      </div>

      <SectionTitle>Account</SectionTitle>
      <List className="border-t-0">
        <Row href="/profile/edit" leading={icon(UserRound)}>Edit profile and photo</Row>
        <Row href="/profile/security" leading={icon(KeyRound)}>Email and password</Row>
        <Row href="/profile/notifications" leading={icon(Bell)}>Notifications</Row>
      </List>

      <SectionTitle className="mt-8">Activity</SectionTitle>
      <List className="border-t-0">
        <Row href="/orders" leading={icon(Receipt)}>Order history and receipts</Row>
        <Row href="/profile/ratings" leading={icon(Star)}>{user.isRunner ? "Ratings you've received" : "Ratings you've given"}</Row>
        {p.runner_status === "none" || p.runner_status === "rejected" ? (
          <Row href="/run" leading={icon(Footprints)}>Become a runner</Row>
        ) : (
          <Row href="/run" leading={icon(Footprints)} trailing={RUNNER_TAG[p.runner_status]}>Runner status</Row>
        )}
        {(p.runner_status === "approved" || p.runner_status === "suspended") && (
          <Row href="/run/earnings" leading={icon(Wallet)}>Earnings and payouts</Row>
        )}
      </List>

      <SectionTitle className="mt-8">Appearance</SectionTitle>
      <div className="py-3">
        <ThemeSwitcher />
      </div>

      <div className="mt-8 border-t-2 border-line-strong">
        <List className="border-t-0">
          <Row href="/profile/delete" leading={<Trash2 className="size-5 text-ink-3" strokeWidth={1.75} aria-hidden />}>
            <span className="text-ink-2">Delete account</span>
          </Row>
          <li>
            <LogoutButton />
          </li>
        </List>
      </div>
      <p className="mt-6 text-caption text-ink-3">
        Dormdash · <a className="hover:text-ink" href="/legal/terms">Terms</a> · <a className="hover:text-ink" href="/legal/privacy">Privacy</a> · <a className="hover:text-ink" href="/legal/runner-agreement">Runner Agreement</a>
      </p>
    </div>
  );
}
