import Link from "next/link";
import { Logo } from "@/components/brand";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 md:px-8">
        <Logo />
        <nav aria-label="Legal" className="flex gap-4 text-small font-semibold">
          <Link href="/legal/terms" className="hover:underline">Terms</Link>
          <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
          <Link href="/legal/runner-agreement" className="hover:underline">Runners</Link>
        </nav>
      </header>
      <main className="legal mx-auto max-w-3xl px-4 pt-6 pb-20 md:px-8">{children}</main>
    </div>
  );
}
