import type { Metadata } from "next";
import { LegalHeader, Review, Section } from "@/components/legal";
import { getPricing } from "@/lib/settings";
import { formatCents } from "@/lib/domain/pricing";

// Reads live data (settings / database), so never prerender at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Runner Agreement" };

export default async function RunnerAgreementPage() {
  const s = await getPricing();
  const mins = Math.round(s.doorCountdownSeconds / 60);
  const lv = [...s.levelTiers].sort((a, b) => a.minDeliveries - b.minDeliveries);
  return (
    <article>
      <LegalHeader title="Runner Agreement" updated="October 22, 2026" />
      <Section title="1. Your relationship with Dormdash">
        <p>As a runner you&rsquo;re an independent user of the Dormdash platform, not an employee. You choose when to go on shift and which orders to take.</p>
        <Review>Confirm independent contractor classification under New York law and whether a separate contractor agreement is required.</Review>
      </Section>
      <Section title="2. Getting approved">
        <p>
          Before you can take orders you need a verified @nyu.edu email, a unique phone number, an NYU ID (number and photo) approved by a Dormdash admin, and payouts set up through Stripe (a bank account and Stripe&rsquo;s identity verification).
          There&rsquo;s no card on file and no deposit.
        </p>
      </Section>
      <Section title="3. Runs">
        <ul>
          <li>Tap &ldquo;I&rsquo;m heading to&rdquo; your building and we show orders picked up near where you are (one location check, never continuous tracking) going to that building. You can take a whole suggested run in one tap or pick orders individually, up to {s.maxActiveOrders} at once.</li>
          <li>New runners start with an order limit by food value: {lv.map((t, i) => `${t.minDeliveries}${lv[i + 1] ? `–${lv[i + 1].minDeliveries - 1}` : "+"} deliveries: ${t.maxFoodCents === null ? "no limit" : `up to ${formatCents(t.maxFoodCents)}`}`).join("; ")}. Your total active food value can&rsquo;t exceed twice your per-order limit. An upheld case drops you back one level.</li>
          <li>You can drop an order before pickup and it goes back on the board. Your first {s.freeUnclaimsPerWeek === 1 ? "drop" : `${s.freeUnclaimsPerWeek} drops`} each week {s.freeUnclaimsPerWeek === 1 ? "is" : "are"} free; after that each counts as a strike.</li>
        </ul>
      </Section>
      <Section title="4. Food for PIN">
        <ul>
          <li>At pickup, take a live in-app photo of each bag showing the customer&rsquo;s name or order number. Gallery photos aren&rsquo;t accepted for evidence.</li>
          <li>When you head to the building (or finish the last pickup), each customer gets a heads-up to be at their door with their PIN.</li>
          <li>At each door tap &ldquo;At your door&rdquo; (or &ldquo;In the lobby&rdquo;): we do a one-time location check and you take a live photo of the bag with the room number or door sign. The customer gets the photo and a {mins}-minute countdown.</li>
          <li><strong>Enter the customer&rsquo;s PIN as you hand over the bag. That is the only way to complete a delivery.</strong> Never leave food at a door, desk, or anywhere else.</li>
          <li>If you don&rsquo;t live in the customer&rsquo;s building, the handoff is in the lobby. Never tailgate or borrow a resident card.</li>
          <li>
            <strong>Customer not here:</strong> if the countdown ends with no PIN, you were verified at the door, and you called the customer at least once through the app, you can mark them not here. You get the full delivery fee plus the tip and may keep or dispose of the food.
            If your location couldn&rsquo;t be verified, that payout waits for an admin review. If the customer says they&rsquo;re at their door, &ldquo;Customer not here&rdquo; is blocked.
          </li>
          <li>If something goes wrong before the handoff (restaurant not ready, wrong order, spilled, can&rsquo;t get in), report it with a note and a live photo. The customer is refunded and there&rsquo;s no penalty the first time in 30 days.</li>
        </ul>
      </Section>
      <Section title="5. Pay">
        <ul>
          <li>You earn {Math.round((1 - s.platformFeePct) * 100)}% of each delivery fee plus 100% of tips, paid to your Stripe account the moment the customer&rsquo;s PIN is entered. No holding period.</li>
          <li>If a customer cancels after you claim but before pickup, you get {formatCents(s.cancelFeeCents)}.</li>
          <li>If a delivery is more than {s.lateGraceMinutes} minutes past its ETA, the customer&rsquo;s delivery fee is refunded and you keep the tip.</li>
          <li>Credits customers use never reduce your pay.</li>
          <li>You&rsquo;re responsible for your own taxes. Stripe may issue tax forms based on what you receive.</li>
        </ul>
        <Review>Confirm 1099 reporting responsibilities between the platform and Stripe Connect.</Review>
      </Section>
      <Section title="6. Strikes, cases, theft">
        <p>Strikes come from late deliveries, upheld cases, and repeated drops. At {s.strikeThreshold} active strikes, running pauses until an admin reviews your account. Patterns of incidents with several different customers, or marking &ldquo;Customer not here&rdquo; on more than {s.noShowRatePct}% of your recent orders, also pause your account for review.</p>
        <p>
          You&rsquo;re notified of any case about your orders and have 24 hours to respond. All case communication goes through Dormdash admins. <strong>If theft is confirmed</strong>, the customer is refunded, your unpaid earnings are deducted toward the Guarantee Fund, your account is permanently banned, and your email, phone and NYU ID are blocked from registering again.
          You may appeal once within 7 days; the decision on appeal is final. We share information with law enforcement only in response to a formal request.
        </p>
      </Section>
      <Section title="7. Safety">
        <p>Never put yourself at risk for a delivery. If something feels off, don&rsquo;t hand over the food, report a problem, and contact us. In an emergency call 911 or NYU Public Safety at (212) 998-2222.</p>
        <Review>Add insurance, assumption-of-risk and indemnity terms.</Review>
      </Section>
    </article>
  );
}
