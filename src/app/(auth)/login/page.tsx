import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  suspended: "This account is suspended. Email support@dormdash.app if you think that's a mistake.",
  expired_link: "That link expired or was already used. Log in and we'll send a fresh one if you still need to verify.",
  bad_link: "That link looks broken. Try copying the whole thing from the email.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="font-display text-display leading-none font-black uppercase">Welcome back</h1>
      <p className="mt-2 mb-8 text-body text-ink-2">Log in with your NYU email.</p>
      <LoginForm next={sp.next} initialError={sp.error ? ERRORS[sp.error] : undefined} />
    </>
  );
}
