import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";
import { publicContact } from "@/lib/publicContact";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Thursday League collects, uses, and protects account and league information.",
  robots: { index: true, follow: true }
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      eyebrow="Last updated 31 July 2026"
      title="Privacy policy"
      intro="Thursday League uses only the information needed to run private football leagues, secure accounts, deliver matchweek features, and improve reliability. We do not sell personal information or use it for advertising."
    >
      <LegalSection title="Information we handle">
        <p>Account information includes your username, verified email address, authentication identifiers, profile photo if you add one, account status, and security records used to protect sign-in and sensitive actions.</p>
        <p>League activity includes memberships and roles, match schedules and results, player records, fantasy selections and scores, virtual prediction slips and balances, and notification preferences. Other members only see information needed for the shared league experience; private pre-match fantasy picks and individual prediction activity remain access-controlled.</p>
        <p>When notifications are enabled, we store a device push token and delivery status. The website also uses privacy-conscious Vercel performance and traffic measurements with sensitive route details removed.</p>
      </LegalSection>

      <LegalSection title="How we use it">
        <p>We use this information to create and secure accounts, operate leagues, calculate results and standings, deliver requested reminders, diagnose failures, prevent abuse, and support account recovery. Thursday League predictions use virtual league coins only; there are no deposits, purchases, withdrawals, cash prizes, or real-money wagering.</p>
      </LegalSection>

      <LegalSection title="Service providers and sharing">
        <p>Thursday League relies on Supabase for authentication, database, and file storage; Vercel for website hosting and privacy-conscious performance measurement; and Expo, Apple Push Notification service, or Firebase Cloud Messaging for native notifications. These providers process information only to supply those services.</p>
        <p>We may disclose information when required by law, to protect users or the service, or during a business transfer with appropriate safeguards. We do not sell personal information or share it with advertising networks.</p>
      </LegalSection>

      <LegalSection title="Retention, security, and your choices">
        <p>Account and league information is retained while your account is active and as needed to operate league history, meet legal obligations, resolve disputes, and protect the service. Access is restricted through authenticated APIs and database row-level security, with rate limits and audit-oriented delivery records for sensitive operations.</p>
        <p>You can update your recovery email, password, profile photo, and notification choices in the app. You can permanently delete your account from Account security. Login details, personal settings, notification tokens, and profile photo are removed; shared historical competition records remain under an anonymous deleted-user label so league results are not corrupted.</p>
        <p>If you own an active league, you must transfer ownership or archive that league before deleting your account.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>Questions, privacy requests, or account help can be sent to <a className="font-bold text-league-gold underline decoration-league-gold/35 underline-offset-4" href={`mailto:${publicContact.supportEmail}`}>{publicContact.supportEmail}</a>.</p>
        <p>You can also review the <Link href="/terms" className="font-bold text-league-gold">Terms of Use</Link> or start an <Link href="/delete-account" className="font-bold text-league-gold">account deletion request</Link>.</p>
      </LegalSection>
    </LegalLayout>
  );
}
