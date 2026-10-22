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
          <li><strong>Orders:</strong> pickup spot, pickup name and order number, the food total you enter, your receipt screenshot, delivery times, ratings, calls placed through the app (who tapped call and when, not the call itself).</li>
          <li><strong>Runners:</strong> legal name, NYU ID number and photo, home building, shift availability, earnings, strikes, and payout details held by Stripe (bank account and identity verification happen on Stripe, not on Dormdash).</li>
          <li><strong>Evidence photos:</strong> runners&rsquo; live-camera photos of the bag at pickup and at your door or lobby, and photos attached to problem reports. Each is stamped by our server with the time and a one-time location result.</li>
          <li><strong>Location:</strong> only a one-time check at specific moments (opening heading-home mode, taking an evidence photo, arriving at the door). <strong>We don&rsquo;t track anyone continuously and we don&rsquo;t store coordinates.</strong> We keep only the result: within range, out of range, or not shared, plus the approximate distance.</li>
          <li><strong>Device:</strong> push tokens if you turn push on, and basic logs (IP address, browser) for security and rate limiting.</li>
        </ul>
      </Section>
      <Section title="Who sees what">
        <ul>
          <li>Your runner sees your first name, building, floor, room and order notes. They can call you only through the in-app button during an active order; your number is never shown to them as text, and the button disappears when the order closes.</li>
          <li>Customers see their runner&rsquo;s first name, photo and rating, and the photo of their own bag at the door or lobby. Customers can call their runner the same way.</li>
          <li>In a case, neither party sees the other&rsquo;s last name, phone number, email, NYU ID or location data. All case communication goes through Dormdash admins in separate threads.</li>
          <li>Only Dormdash admins see NYU ID photos and numbers. Photos are stored privately and shown with short-lived links.</li>
          <li>Service providers: Supabase (database, auth, storage), Vercel (hosting), Stripe (payments, payouts, runner identity verification), Resend (email). They process data only to run Dormdash.</li>
          <li><strong>Law enforcement:</strong> we share information only in response to a formal legal request, and log the agency, officer, reference number, date and exactly what was shared.</li>
        </ul>
        <p>We don&rsquo;t sell your data.</p>
      </Section>
      <Section title="How long we keep it">
        <p>Evidence photos are deleted 90 days after an order closes, unless a case on that order is still open. Financial records (the ledger) are kept for accounting and tax purposes. When you delete your account we erase your name, email, phone, room and photos and keep anonymized order records.</p>
        <p>If an account is banned for confirmed theft, we keep the email, phone number and NYU ID number on a block list so they can&rsquo;t be used to register again.</p>
        <Review>Set retention periods for ID photos and the block list; confirm tax-record obligations.</Review>
      </Section>
      <Section title="Your choices">
        <ul>
          <li>Edit your profile or change your email any time in Profile.</li>
          <li>Turn push and email notifications on or off per category. Security emails always go out.</li>
          <li>Deny camera or location access. Some actions (evidence photos, the door check) can&rsquo;t be completed without them, and the app will tell you.</li>
          <li>Delete your account in Profile, then Delete account.</li>
        </ul>
      </Section>
      <Section title="Contact">
        <p>privacy@dormdash.app</p>
        <Review>Confirm applicability of FERPA (we are not NYU), NY SHIELD Act security requirements, ID-image rules, and CCPA/other state laws for out-of-state students.</Review>
      </Section>
    </article>
  );
}
