import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";
import { publicContact } from "@/lib/publicContact";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for using Thursday League.",
  robots: { index: true, follow: true }
};

export default function TermsPage() {
  return (
    <LegalLayout
      eyebrow="Last updated 31 July 2026"
      title="Terms of use"
      intro="These terms explain the basic rules for using Thursday League. By creating an account or joining a league, you agree to use the service responsibly and lawfully."
    >
      <LegalSection title="The service">
        <p>Thursday League helps groups organize recreational football leagues, record matches and statistics, run fantasy competitions, and make entertainment-only predictions using virtual league coins.</p>
        <p>Virtual coins have no monetary value. They cannot be bought, sold, transferred for value, withdrawn, redeemed for prizes, or exchanged for money. Thursday League is not a gambling or financial service.</p>
      </LegalSection>

      <LegalSection title="Accounts and leagues">
        <p>You must provide accurate account information, keep your password private, and tell us if you believe your account has been compromised. You are responsible for activity performed through your account.</p>
        <p>League owners and admins must only add lawful content, manage members fairly, and obtain any permission needed before recording other people’s names, photos, statistics, or match information. League owners are responsible for transferring ownership or archiving a league before leaving or deleting their account.</p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>Do not attempt to access another person’s private information, bypass permissions, disrupt the service, automate abusive traffic, upload harmful content, impersonate others, manipulate results dishonestly, or use Thursday League for unlawful wagering or financial activity.</p>
        <p>We may restrict or deactivate accounts when reasonably necessary to protect users, comply with law, investigate abuse, or preserve service integrity.</p>
      </LegalSection>

      <LegalSection title="Availability and responsibility">
        <p>The service is provided on an “as available” basis. We work to keep it reliable and accurate, but recreational match data is entered by league admins and may contain mistakes. Features may change as the product develops.</p>
        <p>To the extent permitted by applicable law, Thursday League is not responsible for indirect losses, missed notifications, user-entered errors, or decisions made from fantasy scores, predictions, or statistics. Nothing in these terms removes rights that cannot legally be excluded.</p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>Material updates will be reflected by changing the date above and, when appropriate, by notifying users in the app. Continued use after an update means you accept the revised terms.</p>
        <p>Questions can be sent to <a className="font-bold text-league-gold" href={`mailto:${publicContact.supportEmail}`}>{publicContact.supportEmail}</a>.</p>
        <p>See the <Link href="/privacy" className="font-bold text-league-gold">Privacy Policy</Link> for information about personal data.</p>
      </LegalSection>
    </LegalLayout>
  );
}
