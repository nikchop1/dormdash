/** Shared pieces for the placeholder legal pages. */
export function LegalHeader({ title, updated }: { title: string; updated: string }) {
  return (
    <header className="mb-8 border-b-2 border-line-strong pb-6">
      <p className="eyebrow">Last updated {updated}</p>
      <h1 className="mt-2 font-display text-display leading-none font-black uppercase">{title}</h1>
      <p className="mt-4 rounded-sm bg-warning-soft px-4 py-3 text-small font-semibold text-ink">
        [LAWYER REVIEW NEEDED] This is a plain-language placeholder written before launch. It has not been reviewed by a lawyer and isn&rsquo;t final.
      </p>
    </header>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-6">
      <h2 className="mb-3 text-heading font-semibold">{title}</h2>
      <div className="flex flex-col gap-3 text-body text-ink-2 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export function Review({ children }: { children: React.ReactNode }) {
  return <p className="text-small font-semibold text-warning">[LAWYER REVIEW NEEDED] {children}</p>;
}
