import Link from "next/link";
import { Logo, Tower } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-sunken p-10 md:flex">
        <Logo />
        <div className="mx-auto w-full max-w-[300px] py-8">
          <Tower floors={16} floor={14} />
        </div>
        <div>
          <p className="font-display text-display leading-none font-black uppercase">Floor 14.<br />Elevator&rsquo;s slow.<br />We got you.</p>
          <p className="mt-4 max-w-sm text-small text-ink-2">
            NYU students only. You order pickup from the spot, a verified student grabs it and brings it up.
          </p>
        </div>
      </aside>
      <main className="flex flex-col px-4 pt-6 pb-10 md:px-12 md:pt-10">
        <div className="mb-8 md:hidden">
          <Logo />
        </div>
        <div className="mx-auto w-full max-w-md flex-1">{children}</div>
        <footer className="mx-auto mt-10 flex w-full max-w-md gap-4 text-caption text-ink-3">
          <Link href="/legal/terms" className="hover:text-ink">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/legal/runner-agreement" className="hover:text-ink">Runner Agreement</Link>
        </footer>
      </main>
    </div>
  );
}
