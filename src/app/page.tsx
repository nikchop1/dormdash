import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getPricing } from "@/lib/settings";
import { formatCents } from "@/lib/domain/pricing";
import { Logo, Tower } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { OrderStatusHero } from "@/components/order-status";
import { JobRows, RunSummary, type BoardJob } from "@/components/job-board";
import { Notice } from "@/components/ui/misc";

// Demo data rendered through the app's real components (no mockups).
const demoJob = (id: string, spotName: string, floor: number, payCents: number, tipCents: number, waitedMin: number, locked: string | null = null): BoardJob => ({
  id, spotId: spotName, spotName, spotLat: 0, spotLng: 0, buildingId: "t", buildingShort: "Tower", floor, distanceMiles: 0.06,
  payCents, tipCents, foodValueCents: 1400, waitedMin, locked, createdAt: "2026-01-01T00:00:00Z",
});
const DEMO_RUN: BoardJob[] = [
  demoJob("a", "Waverly Bagel Co.", 7, 288, 100, 3),
  demoJob("b", "Waverly Bagel Co.", 12, 238, 50, 6),
  demoJob("c", "8th Street Corner Store", 14, 314, 100, 2),
  demoJob("d", "Greene Street Ramen", 16, 263, 0, 24),
  demoJob("e", "Fifth Ave Poke Bar", 9, 450, 200, 1, "Available after 6 more deliveries"),
];
function demoTimes() {
  const now = Date.now();
  const iso = (m: number) => new Date(now + m * 60000).toISOString();
  return { iso };
}

function Phone({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-[28px] border-[6px] border-ink-fill bg-paper">
        <div className="flex h-6 items-center justify-center bg-ink-fill" aria-hidden>
          <span className="h-1.5 w-14 rounded-full bg-on-ink-fill/30" />
        </div>
        <div className="pointer-events-none max-h-[520px] overflow-hidden px-4 pt-4 pb-6 select-none" inert>
          {children}
        </div>
      </div>
      <figcaption className="mt-3 text-small text-ink-2">{label}</figcaption>
    </figure>
  );
}

export default async function Landing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [user, s] = await Promise.all([getSessionUser(), getPricing()]);
  const { iso } = demoTimes();
  const example = s.baseFeeCents + (s.distanceTiers.find((t) => 0.15 <= t.maxMiles)?.addCents ?? 0) + (s.floorTiers.find((t) => t.maxFloor === null || 14 <= t.maxFloor)?.addCents ?? 0);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-2">
          {user ? (
            <ButtonLink href="/home" variant="ink" size="sm">Open the app</ButtonLink>
          ) : (
            <>
              <Link href="/login" className="inline-flex h-9 items-center px-3 text-small font-semibold hover:underline">Log in</Link>
              <ButtonLink href="/signup" size="sm">Sign up</ButtonLink>
            </>
          )}
        </nav>
      </header>

      <main>
        {sp.deleted && (
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <Notice tone="success" title="Your account is deleted">Thanks for being here. Your personal info is gone.</Notice>
          </div>
        )}

        {/* Hero: copy left, tower right. Asymmetric on purpose. */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pt-8 pb-16 md:grid-cols-12 md:px-8 md:pt-16">
          <div className="md:col-span-7">
            <p className="eyebrow">NYU dorms · around Washington Square</p>
            <h1 className="mt-4 font-display text-[4.25rem] leading-[0.86] font-black tracking-tight uppercase md:text-[7.5rem]">
              Floor 14.<br />Elevator&rsquo;s<br />slow.
              <span className="mt-3 block w-fit bg-accent px-3 pt-2 pb-1 text-on-accent md:mt-4">We got you.</span>
            </h1>
            <p className="mt-8 max-w-md text-body-lg text-ink-2">
              Order pickup from a spot near your dorm like you normally would. Another NYU student grabs the bag on their way back and brings it up to your floor. You pay them a couple bucks, not a delivery app markup.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ButtonLink href={user ? "/home" : "/signup"} size="lg">{user ? "Order something" : "Get on the list"}</ButtonLink>
              <Link href={user ? "/run" : "/signup?next=/run"} className="link text-body font-semibold">Or get paid to run</Link>
            </div>
          </div>
          <div className="relative md:col-span-5">
            <div className="mx-auto max-w-[340px] md:ml-auto">
              <Tower floors={16} floor={14} animate />
            </div>
          </div>
        </section>

        {/* How it works: two honest numbered lists, no icon cards. */}
        <section aria-labelledby="how" className="border-y-2 border-line-strong bg-sunken">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 md:grid-cols-12 md:px-8">
            <div className="md:col-span-4">
              <h2 id="how" className="font-display text-display leading-none font-black uppercase">How it actually works</h2>
              <p className="mt-4 text-body text-ink-2">No restaurant partnerships, no menus to keep in sync. You buy the food. We move it.</p>
            </div>
            <div className="grid gap-10 md:col-span-8 md:grid-cols-2">
              {[
                {
                  title: "If you're hungry",
                  steps: [
                    ["Order pickup yourself", "In the spot's own app or site, under your name. You pay them directly. We never touch food money."],
                    ["Tell us where it's going", "Screenshot the confirmation, pick ASAP or a time, and pay the delivery fee plus an optional tip."],
                    ["Be there with your PIN", "We ping you when your runner is 2 minutes out. Say your 4-digit PIN as you take the bag. No PIN, no handoff."],
                  ],
                },
                {
                  title: "If you're running",
                  steps: [
                    ["Get verified", "Apply with your NYU ID and set up payouts. We check every runner by hand."],
                    ["Heading home? Take a run", "Tap \"I'm heading to my building\" and grab two or three orders picked up near you, going where you're already going."],
                    ["Get paid on the PIN", `Keep ${Math.round((1 - s.platformFeePct) * 100)}% of every delivery fee and 100% of tips, paid the moment the customer says their PIN. Not home? You still get paid in full.`],
                  ],
                },
              ].map((col) => (
                <div key={col.title}>
                  <h3 className="border-b-2 border-line-strong pb-2 text-heading font-semibold">{col.title}</h3>
                  <ol className="divide-y divide-line">
                    {col.steps.map(([t, d], i) => (
                      <li key={t} className="flex gap-4 py-4">
                        <span className="tnum font-display text-title leading-none font-black">{String(i + 1).padStart(2, "0")}</span>
                        <span>
                          <span className="block font-semibold">{t}</span>
                          <span className="block text-small text-ink-2">{d}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The real UI, rendered from the real components. */}
        <section aria-labelledby="app" className="mx-auto max-w-6xl px-4 py-20 md:px-8">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-4">
              <h2 id="app" className="font-display text-display leading-none font-black uppercase">The ETA is the headline</h2>
              <p className="mt-4 text-body text-ink-2">
                The order screen leads with when it&rsquo;s arriving, who&rsquo;s bringing it, and your PIN. Runners get a board that reads like a dispatch list: where, which floor, what it pays.
              </p>
              <p className="mt-4 text-small text-ink-3">These are the app&rsquo;s own screens with sample data.</p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 md:col-span-8">
              <Phone label="What you see after a runner claims it." className="sm:mt-12">
                <OrderStatusHero
                  code="K7P2Q"
                  status="on_the_way"
                  eta={iso(7)}
                  scheduledFor={null}
                  createdAt={iso(-14)}
                  spotName="Mercer Street Deli"
                  buildingShort="Tower"
                  floor={14}
                  room="1412"
                  handoff="door"
                  runner={{ firstName: "Maya", avatarUrl: null, rating: 4.9, ratings: 112 }}
                  steps={[
                    { status: "requested", at: iso(-14) },
                    { status: "claimed", at: iso(-12) },
                    { status: "picked_up", at: iso(-4) },
                    { status: "on_the_way", at: iso(-2) },
                    { status: "delivered", at: null },
                  ]}
                />
              </Phone>
              <Phone label="What runners see on their way home.">
                <p className="eyebrow">Heading to Tower Hall</p>
                <div className="mt-3 flex flex-col gap-3">
                  <RunSummary label="3 orders · 2 pickups · $8.40" headingHome jobs={DEMO_RUN.slice(0, 3)} />
                  <JobRows jobs={DEMO_RUN.slice(3)} />
                </div>
              </Phone>
            </div>
          </div>
        </section>

        {/* Pricing, stated plainly. */}
        <section aria-labelledby="pricing" className="border-t-2 border-line-strong">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-12 md:px-8">
            <div className="md:col-span-5">
              <h2 id="pricing" className="font-display text-display leading-none font-black uppercase">What it costs</h2>
              <p className="mt-4 text-body text-ink-2">Shown before you pay, every time. Farther spots and higher floors cost a little more, because they take longer.</p>
              <p className="mt-6 text-small text-ink-2">Example: floor 14, a spot 0.15 mi away.</p>
              <p className="tnum font-display text-display-lg font-black">{formatCents(example)}</p>
            </div>
            <div className="md:col-span-7">
              <table className="w-full text-small">
                <tbody className="tnum divide-y divide-line border-y border-line">
                  <tr><th scope="row" className="py-3 text-left font-semibold">Base fee</th><td className="py-3 text-right">{formatCents(s.baseFeeCents)}</td></tr>
                  {s.distanceTiers.map((t, i) => (
                    <tr key={i}><th scope="row" className="py-3 text-left font-normal text-ink-2">Spot within {t.maxMiles} mi</th><td className="py-3 text-right">+{formatCents(t.addCents)}</td></tr>
                  ))}
                  {s.floorTiers.map((t, i) => (
                    <tr key={`f${i}`}>
                      <th scope="row" className="py-3 text-left font-normal text-ink-2">
                        {t.maxFloor === null ? `Floor ${(s.floorTiers[i - 1]?.maxFloor ?? 0) + 1} and up` : `Floors ${(s.floorTiers[i - 1]?.maxFloor ?? 0) + 1} to ${t.maxFloor}`}
                      </th>
                      <td className="py-3 text-right">+{formatCents(t.addCents)}</td>
                    </tr>
                  ))}
                  <tr><th scope="row" className="py-3 text-left font-normal text-ink-2">Busy nights and bad weather</th><td className="py-3 text-right">up to {s.weatherMultiplier}x the fee</td></tr>
                  <tr><th scope="row" className="py-3 text-left font-normal text-ink-2">Tip</th><td className="py-3 text-right">your call, 100% to the runner</td></tr>
                </tbody>
              </table>
              <p className="mt-3 text-small text-ink-3">Dormdash keeps {Math.round(s.platformFeePct * 100)}% of the delivery fee to run the platform. Never any of the tip.</p>
            </div>
          </div>
        </section>

        {/* The fine print, up front. */}
        <section aria-labelledby="fine" className="bg-ink-fill text-on-ink-fill">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-12 md:px-8">
            <h2 id="fine" className="font-display text-display leading-none font-black uppercase md:col-span-4">The fine print, up front</h2>
            <dl className="divide-y divide-on-ink-fill/20 md:col-span-8">
              {[
                ["Late?", `If it shows up more than ${s.lateGraceMinutes} minutes after the ETA, your delivery fee comes back automatically. You don't have to ask.`],
                ["Changed your mind?", `Cancel free until someone claims it. After that, ${formatCents(s.cancelFeeCents)} goes to the runner for their time. Once the food's picked up, it's coming.`],
                ["Not at your door?", `Your runner sends a photo from your door and gives you ${Math.round(s.doorCountdownSeconds / 60)} minutes. No PIN by then means they're paid in full, may keep the food, and there's no refund.`],
                ["Lost or stolen?", "Your delivery fee, tip and guarantee come back to your card, and your food's value comes back as Dormdash credit. Every order carries a small delivery guarantee that pays for this."],
                ["Lobby or door?", "Most dorms need a resident card to get upstairs. If your runner lives in your building, it comes to your door. Otherwise you meet them in the lobby and the floor fee is refunded. You'll know before you pay."],
                ["Who are the runners?", "NYU students who applied with their student ID and got approved by a person. Three strikes and they're paused."],
              ].map(([t, d]) => (
                <div key={t} className="grid gap-1 py-5 md:grid-cols-3 md:gap-6">
                  <dt className="font-semibold text-accent-on-fill">{t}</dt>
                  <dd className="text-small opacity-85 md:col-span-2">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-small text-ink-3 md:flex-row md:items-center md:justify-between md:px-8">
        <p>Dormdash is an independent student marketplace. Not affiliated with or endorsed by New York University or DoorDash.</p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/legal/terms" className="hover:text-ink">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/legal/runner-agreement" className="hover:text-ink">Runner Agreement</Link>
        </nav>
      </footer>
    </div>
  );
}
