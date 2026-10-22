import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getPricing } from "@/lib/settings";
import { formatCents } from "@/lib/domain/pricing";
import { Logo, Tower } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { OrderStatusHero } from "@/components/order-status";
import { JobRows } from "@/components/job-board";
import { Notice } from "@/components/ui/misc";

// Demo data rendered through the app's real components (no mockups).
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
            <p className="overline">NYU dorms · around Washington Square</p>
            <h1 className="mt-4 font-display text-[4.25rem] leading-[0.86] font-black tracking-tight uppercase md:text-[7.5rem]">
              Floor 14.<br />Elevator&rsquo;s<br />slow.<br />
              <span className="bg-accent px-2 text-on-accent">We got you.</span>
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
                    ["Meet your runner", "Watch it move live. Give them your 4-digit PIN at the door, or in the lobby if they don't live in your building."],
                  ],
                },
                {
                  title: "If you're running",
                  steps: [
                    ["Get verified", "Apply with your NYU ID. We check every runner by hand."],
                    ["Go on shift when you're free", "Claim one job or a batch going to the same building. Floors are sorted so you ride the elevator once."],
                    ["Get paid daily", `Keep ${Math.round((1 - s.platformFeePct) * 100)}% of every delivery fee and 100% of tips, paid out to PayPal.`],
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
              <Phone label="What runners see on shift.">
                <p className="overline">Job board · 4 open</p>
                <div className="mt-3">
                  <JobRows
                    jobs={[
                      { id: "a", spotName: "Waverly Bagel Co.", buildingShort: "Tower", floor: 7, distanceMiles: 0.06, payCents: 288, tipCents: 100, waitedMin: 3 },
                      { id: "b", spotName: "Waverly Bagel Co.", buildingShort: "Tower", floor: 12, distanceMiles: 0.06, payCents: 238, tipCents: 50, waitedMin: 6 },
                      { id: "c", spotName: "West 4th Dumpling House", buildingShort: "Mercer", floor: 6, distanceMiles: 0.08, payCents: 413, tipCents: 200, waitedMin: 4 },
                      { id: "d", spotName: "Greene Street Ramen", buildingShort: "Tower", floor: 16, distanceMiles: 0.21, payCents: 263, tipCents: 0, waitedMin: 24 },
                    ]}
                  />
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
              <p className="mt-3 text-small text-ink-3">FloorDrop keeps {Math.round(s.platformFeePct * 100)}% of the delivery fee to run the platform. Never any of the tip.</p>
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
                ["Lobby or door?", "Most dorms need a resident card to get upstairs. If your runner lives in your building, it comes to your door. Otherwise you meet them in the lobby. You'll know before you pay."],
                ["Something wrong?", "Report it from the order. We look at the pickup and drop-off photos and the PIN log, then refund what's fair."],
                ["Who are the runners?", "NYU students who applied with their student ID and got approved by a person. Three strikes and they're paused."],
              ].map(([t, d]) => (
                <div key={t} className="grid gap-1 py-5 md:grid-cols-3 md:gap-6">
                  <dt className="font-semibold text-accent">{t}</dt>
                  <dd className="text-small opacity-85 md:col-span-2">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-small text-ink-3 md:flex-row md:items-center md:justify-between md:px-8">
        <p>FloorDrop is an independent student marketplace. Not affiliated with or endorsed by New York University.</p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/legal/terms" className="hover:text-ink">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/legal/runner-agreement" className="hover:text-ink">Runner Agreement</Link>
        </nav>
      </footer>
    </div>
  );
}
