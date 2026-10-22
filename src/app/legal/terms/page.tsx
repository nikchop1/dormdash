import type { Metadata } from "next";
import { LegalHeader, Review, Section } from "@/components/legal";
import { getPricing } from "@/lib/settings";
import { formatCents } from "@/lib/domain/pricing";

// Reads live data (settings / database), so never prerender at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Terms of Service" };

export default async function TermsPage() {
  const s = await getPricing();
  const mins = Math.round(s.doorCountdownSeconds / 60);
  return (
    <article>
      <LegalHeader title="Terms of Service" updated="October 22, 2026" />
      <Section title="1. What Dormdash is">
        <p>
          Dormdash is a platform that connects students who want food brought to their dorm (&ldquo;customers&rdquo;) with other students who pick it up and bring it (&ldquo;runners&rdquo;).
          <strong> Dormdash is a marketplace, not a restaurant, courier company, or employer.</strong> Runners are independent users of the platform.
        </p>
        <p>Dormdash is an independent service. It is not affiliated with, sponsored by, or endorsed by New York University or by DoorDash, Inc.</p>
        <Review>Confirm marketplace/independent-contractor framing and NY worker-classification exposure. Run a trademark clearance on the name &ldquo;Dormdash&rdquo; given DoorDash&rsquo;s marks.</Review>
      </Section>
      <Section id="how-it-works" title="2. You buy the food directly from the restaurant">
        <p>
          Customers place and pay for their food order directly with the restaurant or store, as a pickup order in their own name.
          <strong> Dormdash never sells food, never handles money paid for food, and nobody on Dormdash pays for anyone else&rsquo;s food.</strong> At checkout you enter the food total from your receipt; it caps any food credit described below.
        </p>
      </Section>
      <Section title="3. Eligibility and accounts">
        <ul>
          <li>You must be a current NYU student with a valid @nyu.edu email, and at least 18 years old.</li>
          <li>You must give accurate information, including your phone number and dorm room, and keep your password secure.</li>
          <li>One account per person. We may suspend or ban accounts that break these terms.</li>
        </ul>
        <Review>Confirm age requirement and whether users under 18 need guardian consent.</Review>
      </Section>
      <Section title="4. Fees and payment">
        <p>
          Dormdash charges customers a delivery fee, an optional tip, and a {formatCents(s.guaranteeCents)} delivery guarantee, all shown before you pay. The delivery fee depends on distance, your floor, the size of your order, extra bags, and busy pricing.
          Tips go 100% to your runner. Dormdash keeps {Math.round(s.platformFeePct * 100)}% of the delivery fee. The delivery guarantee goes into a Guarantee Fund that pays refunds for lost food.
        </p>
        <p>Payments are processed by Stripe and captured when you order. We don&rsquo;t place authorization holds or take deposits.</p>
      </Section>
      <Section id="handoff" title="5. Food for PIN">
        <ul>
          <li>Every order has a 4-digit PIN that only you see. <strong>The only way a delivery is completed is your runner entering your PIN.</strong> There is no drop-off, leave-at-door, or desk option.</li>
          <li>When your runner is about 2 minutes away, we send you a heads-up. Be at your door (or the lobby, for a lobby handoff) with your PIN.</li>
          <li>At your door, your runner takes a live photo of your bag with your room number, which we send to you, and starts a {mins}-minute countdown. Say your PIN as you take the bag.</li>
          <li>
            <strong>If you&rsquo;re not there to give your PIN before the countdown ends</strong>, and your runner was verified at your door and tried to call you, your runner may mark you not here. Your runner is paid in full,
            <strong> you get no refund</strong>, and your runner may keep or dispose of the food. That counts as a no-show on your account: two in 30 days gets a warning, three or more pauses ordering until an admin reviews your account.
          </li>
          <li>If your runner isn&rsquo;t at your door when you are, tap &ldquo;I&rsquo;m at my door and the runner isn&rsquo;t here.&rdquo; That blocks a no-show and, if no PIN follows within a few minutes, opens a case.</li>
          <li><strong>A PIN entry is proof that the order was handed to you.</strong> Theft or never-received claims on PIN-completed orders are automatically rejected, except the &ldquo;I gave my PIN but didn&rsquo;t get my food&rdquo; report, which you can make within 5 minutes of giving your PIN.</li>
        </ul>
        <Review>Confirm enforceability of no-refund and forfeiture terms for customer no-shows under NY consumer law.</Review>
      </Section>
      <Section id="lobby" title="6. Lobby handoffs">
        <p>Many dorms require a resident card to go upstairs. If your runner doesn&rsquo;t live in your building, the handoff happens in the lobby and the floor add-on is refunded automatically. You&rsquo;re told this before you pay.</p>
      </Section>
      <Section id="cancellations" title="7. Cancellations">
        <ul>
          <li><strong>Before a runner claims your order:</strong> cancel free, full refund.</li>
          <li><strong>After a runner claims it, before pickup:</strong> you can cancel; we refund everything except a {formatCents(s.cancelFeeCents)} fee that goes to the runner.</li>
          <li><strong>After pickup:</strong> the order can&rsquo;t be cancelled.</li>
          <li>Cancelling on Dormdash does not cancel your food order with the restaurant.</li>
        </ul>
      </Section>
      <Section id="refunds" title="8. Late, lost and stolen orders">
        <p>If your order arrives more than {s.lateGraceMinutes} minutes after its ETA, we automatically refund the delivery fee. Tips aren&rsquo;t refunded for lateness.</p>
        <p>
          <strong>If your order is lost or stolen</strong> (a confirmed theft, or your runner reports a problem such as a spill or a wrong order), you get your delivery fee, tip and delivery guarantee back to your original payment method, and the food value you entered (up to that total) as Dormdash credit.
          This does not apply to customer no-shows.
        </p>
        <p>
          <strong>Dormdash credit</strong> can be used on delivery fees and tips only. It has no cash value, can&rsquo;t be withdrawn or transferred, and never expires. It&rsquo;s applied automatically at checkout unless you turn that off.
        </p>
        <p>We aim to issue refunds within 24 hours of a report.</p>
      </Section>
      <Section id="cases" title="9. Cases and disputes">
        <p>
          If something goes wrong, a case opens with the evidence: pickup and door photos (time- and location-stamped), timestamps, location check results, the call log, the PIN log and your receipt. Your runner gets 24 hours to respond.
          All communication about a case goes through Dormdash admins, separately with each party. We never show either party the other&rsquo;s last name, phone number, email, NYU ID or location data.
        </p>
        <p>Admins decide the outcome. A confirmed theft results in a refund under section 8, a permanent ban of the runner, and blocking their email, phone and NYU ID. Runners may appeal a confirmed theft once, within 7 days; the decision on appeal is final.</p>
        <Review>Add dispute resolution/arbitration clause or confirm small-claims approach.</Review>
      </Section>
      <Section title="10. Abuse">
        <p>We look for patterns, such as incidents involving several different runners or customers, and may pause an account for review. Flagged customers can&rsquo;t order and flagged runners can&rsquo;t run until an admin reviews them.</p>
      </Section>
      <Section title="11. Conduct">
        <p>Be decent. No harassment, no fraud, no fake orders or claims, no using Dormdash for anything illegal, including alcohol, tobacco, or cannabis delivery. Follow your residence hall&rsquo;s rules.</p>
        <Review>Confirm NYU housing policies on non-resident access and commercial activity in residence halls.</Review>
      </Section>
      <Section title="12. Law enforcement">
        <p>We share account or case information with law enforcement only in response to a formal legal request, and we log every request.</p>
        <Review>Draft a law-enforcement response policy (subpoena vs. emergency requests, user notice).</Review>
      </Section>
      <Section title="13. Liability, changes and contact">
        <p>Dormdash is provided &ldquo;as is.&rdquo; To the extent the law allows, our total liability for any claim is limited to the fees you paid us in the 30 days before it. We may update these terms and will tell you in the app. Questions: support@dormdash.app.</p>
        <Review>Draft enforceable limitation of liability and indemnity; insert legal entity name, address, governing law (New York) and venue.</Review>
      </Section>
    </article>
  );
}
