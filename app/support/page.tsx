import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";
import { publicContact } from "@/lib/publicContact";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Thursday League accounts, leagues, notifications, and matchweek features.",
  robots: { index: true, follow: true }
};

export default function SupportPage() {
  return (
    <LegalLayout
      eyebrow="Thursday League support"
      title="How can we help?"
      intro="Most account and league issues can be resolved from inside the app. These are the quickest routes to the right control."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <LegalSection title="Account access">
          <p>Use “Forgot password” on the sign-in screen. Recovery requires the verified email connected to your account.</p>
          <Link href="/forgot-password" className="inline-flex font-bold text-league-gold">Recover account →</Link>
        </LegalSection>
        <LegalSection title="League access">
          <p>Invite links join directly after confirmation. League codes create a request that an owner or admin must approve.</p>
          <Link href="/login" className="inline-flex font-bold text-league-gold">Open Thursday League →</Link>
        </LegalSection>
        <LegalSection title="Notifications">
          <p>Open Profile, then Notification settings. If alerts were blocked, re-enable Thursday League in your phone or browser settings.</p>
        </LegalSection>
        <LegalSection title="Delete account">
          <p>You can permanently remove your account and personal settings. Shared league history is anonymized.</p>
          <Link href="/delete-account" className="inline-flex font-bold text-league-gold">Deletion options →</Link>
        </LegalSection>
      </div>
      <LegalSection title="Contact support">
        <p>Email <a className="font-bold text-league-gold underline decoration-league-gold/35 underline-offset-4" href={`mailto:${publicContact.supportEmail}?subject=Thursday%20League%20support`}>{publicContact.supportEmail}</a>. Include your username and league name, but never send your password, access token, database credentials, or recovery codes.</p>
      </LegalSection>
    </LegalLayout>
  );
}
