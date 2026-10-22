import type { Metadata } from "next";
import { LegalHeader, Review, Section } from "@/components/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article>
      <LegalHeader title="Privacy Policy" updated="October 22, 2026" />
      <Section title="What we collect">
        <ul>
          <li><strong>Account:</strong> name, NYU email, phone number, dorm building, floor and room, password (stored hashed by our auth provider).</li>
          <li><strong>Orders:</strong> pickup spot, pickup name and order number, confirmation screenshots, delivery times, ratings and problem reports.</li>
          <li><strong>Runners:</strong> legal name, photo of your NYU ID, home building, shift availability, payout email, earnings and strikes.</li>
          <li><strong>Photos:</strong> profile photos, pickup and drop-off photos taken by runners.</li>
          <li><strong>Device:</strong> push notification tokens if you turn push on, and basic logs (IP address, browser) for security and rate limiting.</li>
        </ul>
      </Section>
      <Section title="What we don't collect">
        <p>We never see what you paid the restaurant or your card details. Payments go through PayPal. We don&rsquo;t track your location; distances are calculated from fixed building and spot addresses.</p>
      </Section>
      <Section title="Who sees what">
        <ul>
          <li>Your runner sees your first name, building, floor, room, order notes, confirmation screenshot and phone number, only for orders they&rsquo;re delivering.</li>
          <li>Customers see their runner&rsquo;s first name, photo and rating.</li>
          <li>Only Dormdash admins see NYU ID photos. ID and order photos are stored privately and shown with short-lived links.</li>
          <li>Service providers: Supabase (database, auth, storage), Vercel (hosting), PayPal (payments and payouts), Resend (email). They process data only to run Dormdash.</li>
        </ul>
        <p>We don&rsquo;t sell your data.</p>
      </Section>
      <Section title="How long we keep it">
        <p>Account data stays while your account is open. When you delete your account, we erase your name, email, phone, room and photos, and keep anonymized order records for accounting, tax and dispute purposes.</p>
        <Review>Set specific retention periods (e.g. ID photos deleted N days after approval decision) and confirm tax-record obligations.</Review>
      </Section>
      <Section title="Your choices">
        <ul>
          <li>Edit your profile or change your email any time in Profile.</li>
          <li>Turn push and email notifications on or off per category. Security emails always go out.</li>
          <li>Delete your account in Profile, then Delete account.</li>
        </ul>
      </Section>
      <Section title="Contact">
        <p>privacy@dormdash.app</p>
        <Review>Confirm applicability of FERPA (we are not NYU), NY SHIELD Act security requirements, and CCPA/other state laws for out-of-state students.</Review>
      </Section>
    </article>
  );
}
