import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";
import { PublicAccountDeletion } from "@/components/PublicAccountDeletion";

export const metadata: Metadata = {
  title: "Delete Account",
  description: "Permanently delete a Thursday League account and its personal information.",
  robots: { index: true, follow: true }
};

export default function DeleteAccountPage() {
  return (
    <LegalLayout
      eyebrow="Account controls"
      title="Delete your account"
      intro="Thursday League lets every user initiate permanent account deletion from the web or native app without contacting an administrator."
    >
      <LegalSection title="Before deleting">
        <p>You can instead change your password, recovery email, profile photo, or notification preferences from Account security. Deletion cannot be undone.</p>
        <p>League owners must first transfer each active league to another member or archive it. This prevents a league from being left without an owner.</p>
      </LegalSection>
      <PublicAccountDeletion />
      <p className="text-sm text-chalk/45">For more information, read the <Link href="/privacy" className="font-bold text-league-gold">Privacy Policy</Link> or visit <Link href="/support" className="font-bold text-league-gold">Support</Link>.</p>
    </LegalLayout>
  );
}

