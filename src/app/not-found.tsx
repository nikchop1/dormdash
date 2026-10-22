import { Logo } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { FloorBadge } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-6 md:px-8">
      <Logo />
      <div className="flex flex-1 flex-col justify-center py-16">
        <FloorBadge floor="404" size="lg" className="self-start" />
        <h1 className="mt-6 font-display text-display-lg leading-none font-black uppercase">This floor doesn&rsquo;t exist</h1>
        <p className="mt-4 max-w-md text-body-lg text-ink-2">The link is broken, or the page moved. Either way, nothing to deliver here.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/home">Back to the app</ButtonLink>
          <ButtonLink href="/" variant="secondary">Home page</ButtonLink>
        </div>
      </div>
    </main>
  );
}
