import type { Metadata } from "next";
import { LegalHeader, Review, Section } from "@/components/legal";
import { getPricing } from "@/lib/settings";
import { formatCents } from "@/lib/domain/pricing";

export const metadata: Metadata = { title: "Terms of Service" };

export default async function TermsPage() {
  const s = await getPricing();
  return (
    <article>
      <LegalHeader title="Terms of Service" updated="October 22, 2026" />
      <Section title="1. What FloorDrop is">
        <p>
          FloorDrop is a platform that connects students who want food brought to their dorm (&ldquo;customers&rdquo;) with other students who pick it up and bring it (&ldquo;runners&rdquo;).
          <strong> FloorDrop is a marketplace, not a restaurant, courier company, or employer.</strong> Runners are independent users of the platform.
        </p>
        <p>FloorDrop is an independent service. It is not affiliated with, sponsored by, or endorsed by New York University.</p>
        <Review>Confirm marketplace/independent-contractor framing and NY worker-classification exposure.</Review>
      </Section>
      <Section id="how-it-works" title="2. You buy the food directly from the restaurant">
        <p>
          Customers place and pay for their food order directly with the restaurant or store, as a pickup order in their own name, using that business&rsquo;s app, website, or counter.
          <strong> FloorDrop never sells food, never handles money paid for food, and nobody on FloorDrop pays for anyone else&rsquo;s food.</strong>
        </p>
        <p>Questions about the food itself (quality, allergens, missing items the restaurant forgot) are between you and the restaurant. Runners carry sealed orders and don&rsquo;t open them.</p>
      </Section>
      <Section title="3. Eligibility and accounts">
        <ul>
          <li>You must be a current NYU student with a valid @nyu.edu email, and at least 18 years old.</li>
          <li>You must give accurate information, including your phone number and dorm room, and keep your password secure.</li>
          <li>One account per person. We may suspend accounts that break these terms.</li>
        </ul>
        <Review>Confirm age requirement and whether users under 18 need guardian consent.</Review>
      </Section>
      <Section title="4. Fees and payment">
        <p>
          FloorDrop charges customers a delivery fee and an optional tip, shown in full before you pay. The fee is based on the distance from the pickup spot to your building and your floor,
          and may be higher during busy periods or bad weather (&ldquo;busy pricing&rdquo;). Tips go 100% to your runner. FloorDrop keeps {Math.round(s.platformFeePct * 100)}% of the delivery fee.
        </p>
        <p>Payments are processed by our payment provider (PayPal). Your card or account details go to them, not us.</p>
      </Section>
      <Section id="cancellations" title="5. Cancellations">
        <ul>
          <li><strong>Before a runner claims your order:</strong> cancel free, full refund.</li>
          <li><strong>After a runner claims it, before pickup:</strong> you can cancel; we refund everything except a {formatCents(s.cancelFeeCents)} fee that goes to the runner for their time.</li>
          <li><strong>After pickup:</strong> the order can&rsquo;t be cancelled. Use &ldquo;Report a problem&rdquo; if something goes wrong.</li>
          <li>If nobody claims your order within {s.unclaimedCancelMinutes} minutes, we&rsquo;ll offer you a full-refund cancel.</li>
          <li>Cancelling on FloorDrop does not cancel your food order with the restaurant. Do that separately.</li>
        </ul>
      </Section>
      <Section id="refunds" title="6. Late deliveries and refunds">
        <p>Each order gets an estimated arrival time (ETA) when a runner claims it. If it arrives more than {s.lateGraceMinutes} minutes after the ETA, we automatically refund the delivery fee. Tips are not refunded for lateness.</p>
        <p>Refunds go back to your original payment method. Timing depends on PayPal and your bank.</p>
      </Section>
      <Section id="disputes" title="7. Problems and disputes">
        <p>
          Report a problem from the order screen within 72 hours of delivery. We review the customer&rsquo;s report, the runner&rsquo;s response, pickup and drop-off photos, and the handoff PIN log.
          We may refund the delivery fee, the tip, or both; give the runner a strike; suspend the runner; or close the report without action. Our decision on FloorDrop refunds is final,
          but it doesn&rsquo;t limit any rights you have under law.
        </p>
        <Review>Add dispute resolution/arbitration clause or confirm small-claims approach; consider NY consumer protection requirements.</Review>
      </Section>
      <Section title="8. Handoff">
        <p>Each order has a 4-digit PIN that only the customer sees. Runners complete delivery by entering it, or by leaving the order at your door with a photo if you don&rsquo;t answer. In buildings that require a resident card, non-resident runners hand off in the lobby.</p>
      </Section>
      <Section title="9. Conduct">
        <p>Be decent. No harassment, no fraud, no fake orders, no using FloorDrop for anything illegal, including alcohol, tobacco, or cannabis delivery. Follow your residence hall&rsquo;s rules.</p>
        <Review>Confirm NYU housing policies on guest/non-resident access and commercial activity in residence halls.</Review>
      </Section>
      <Section title="10. Liability">
        <p>FloorDrop is provided &ldquo;as is.&rdquo; To the extent the law allows, FloorDrop isn&rsquo;t liable for indirect damages, and our total liability for any claim is limited to the fees you paid us in the 30 days before it.</p>
        <Review>Draft enforceable limitation of liability, indemnity, and insurance language.</Review>
      </Section>
      <Section title="11. Changes and contact">
        <p>We may update these terms and will tell you in the app when we do. Questions: support@floordrop.app.</p>
        <Review>Insert legal entity name, address, governing law (New York) and venue.</Review>
      </Section>
    </article>
  );
}
