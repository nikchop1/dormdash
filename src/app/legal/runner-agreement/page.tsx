import type { Metadata } from "next";
import { LegalHeader, Review, Section } from "@/components/legal";
import { getPricing } from "@/lib/settings";
import { formatCents } from "@/lib/domain/pricing";

// Reads live data (settings / database), so never prerender at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Runner Agreement" };

export default async function RunnerAgreementPage() {
  const s = await getPricing();
  return (
    <article>
      <LegalHeader title="Runner Agreement" updated="October 22, 2026" />
      <Section title="1. Your relationship with FloorDrop">
        <p>As a runner you&rsquo;re an independent user of the FloorDrop platform, not an employee. You choose when to go on shift and which jobs to claim.</p>
        <Review>Confirm independent contractor classification under New York law and whether a separate contractor agreement is required.</Review>
      </Section>
      <Section title="2. Getting approved">
        <p>You must be a current NYU student, give your legal name and a photo of your NYU ID, and be approved by a FloorDrop admin. We can decline or revoke approval.</p>
      </Section>
      <Section title="3. Doing the job">
        <ul>
          <li>Pick up the sealed order under the customer&rsquo;s name. Never open it.</li>
          <li>Take a pickup photo showing the name or order number on the bag.</li>
          <li>Complete delivery with the customer&rsquo;s PIN, or a door photo if they don&rsquo;t answer.</li>
          <li>If you don&rsquo;t live in the customer&rsquo;s building, hand off in the lobby. Never tailgate or borrow someone&rsquo;s resident card.</li>
          <li>Follow your residence hall&rsquo;s rules and the law. Don&rsquo;t deliver alcohol, tobacco or cannabis.</li>
        </ul>
        <Review>Confirm residence hall policy compliance with NYU Residential Life.</Review>
      </Section>
      <Section title="4. Pay">
        <ul>
          <li>You earn {Math.round((1 - s.platformFeePct) * 100)}% of each delivery fee plus 100% of tips.</li>
          <li>If a customer cancels after you claim but before pickup, you get {formatCents(s.cancelFeeCents)}.</li>
          <li>If a delivery is more than {s.lateGraceMinutes} minutes past ETA, the customer&rsquo;s delivery fee is refunded and you keep only the tip.</li>
          <li>Earnings are held {s.payoutHoldHours} hours for disputes, then paid daily to your PayPal email once your balance is at least {formatCents(s.minPayoutCents)}. Upheld disputes can claw back the fee and/or tip from future earnings.</li>
          <li>You&rsquo;re responsible for your own taxes. PayPal may issue tax forms (such as a 1099-K) based on what you receive.</li>
        </ul>
        <Review>Confirm 1099 reporting responsibilities for the platform vs. PayPal, and whether W-9 collection is needed.</Review>
      </Section>
      <Section title="5. Strikes">
        <p>
          You get a strike for a delivery more than {s.lateGraceMinutes} minutes late, for an upheld problem report, and for dropping (unclaiming) jobs more than {s.freeUnclaimsPerWeek} time{s.freeUnclaimsPerWeek === 1 ? "" : "s"} a week.
          At {s.strikeThreshold} active strikes, running pauses automatically until an admin reviews your account.
        </p>
      </Section>
      <Section title="6. Safety">
        <p>Never put yourself at risk for a delivery. If something feels off, cancel the handoff and contact us. In an emergency call 911 or NYU Public Safety at (212) 998-2222.</p>
        <Review>Add insurance, assumption-of-risk and indemnity terms.</Review>
      </Section>
    </article>
  );
}
