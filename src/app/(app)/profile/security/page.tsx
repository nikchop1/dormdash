import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/misc";
import { ChangeEmailForm, ChangePasswordForm } from "./security-forms";

export const metadata: Metadata = { title: "Email and password" };

export default async function SecurityPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/profile", label: "Profile" }} title="Email and password" />
      <ChangeEmailForm current={user.email} domains={env.allowedEmailDomains} />
      <ChangePasswordForm />
    </div>
  );
}
