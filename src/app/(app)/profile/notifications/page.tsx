import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/misc";
import { NotificationPrefs, type Prefs } from "./prefs-form";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsSettingsPage() {
  const user = await requireUser();
  const [prefs] = await asUser(user.id, (t) => t.query<Prefs>("select * from public.notification_preferences where user_id = $1", [user.id]));
  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/profile", label: "Profile" }} title="Notifications" />
      <NotificationPrefs initial={prefs} vapidKey={env.vapidPublicKey || null} isRunner={user.isRunner} />
    </div>
  );
}
