"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { isInternalAuthEmail, isValidEmail, normalizeEmail } from "@/lib/authIdentity";
import { supabase } from "@/lib/supabase";
import { SettingsHeader, SettingsPanel } from "@/components/SettingsComponents";
import { LoadingState, PrimaryButton, TextInput } from "@/components/ui";

export default function RecoveryEmailSettingsPage() {
  const { user, loading, reloadProfile } = useAuthProfile();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const verifiedEmail = useMemo(() => user?.email && supabaseUrl && !isInternalAuthEmail(user.email, supabaseUrl)
    ? user.email
    : null, [supabaseUrl, user?.email]);
  const pendingEmail = user?.new_email || null;

  if (loading) return <LoadingState label="Loading recovery email" cards={1} />;
  if (!user) return null;

  async function requestVerification(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) return setMessage("Enter a valid email address.");
    setSaving(true);
    setMessage(null);
    const redirect = new URL("/auth/confirm", window.location.origin);
    redirect.searchParams.set("flow", "verify-email");
    const { error } = await supabase.auth.updateUser(
      { email: normalized },
      { emailRedirectTo: redirect.toString() }
    );
    setSaving(false);
    if (error) {
      setMessage("The verification email could not be sent. Wait a moment and try again.");
      return;
    }
    setEmail("");
    setMessage(`Verification sent to ${normalized}. Your current login keeps working until you confirm it.`);
    await reloadProfile();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="Recovery email" description="Verify a private email for password recovery and optional email sign-in." />
      <SettingsPanel>
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-league-gold/20 bg-league-gold/[.055] text-league-gold">{verifiedEmail ? <CheckCircle2 size={20} /> : <MailCheck size={20} />}</span>
            <div><h2 className="font-display text-2xl uppercase">{verifiedEmail ? "Email verified" : pendingEmail ? "Verification pending" : "Protect your account"}</h2><p className="mt-1 text-xs leading-relaxed text-chalk/40">{verifiedEmail ? `${verifiedEmail} can be used to sign in or reset your password.` : pendingEmail ? `Open the message sent to ${pendingEmail}.` : "Your username still signs you in. Adding an email makes secure recovery possible."}</p></div>
          </div>
          <form onSubmit={requestVerification} className="mt-5">
            <label className="block"><span className="text-xs font-bold text-chalk/55">{verifiedEmail ? "Change recovery email" : pendingEmail ? "Send to a different email" : "Email address"}</span><TextInput type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" placeholder="you@example.com" className="mt-2 rounded-xl border-league-gold/15" /></label>
            <PrimaryButton disabled={saving} className="mt-4 w-full rounded-xl py-3 sm:w-auto">{saving ? "Sending..." : pendingEmail ? "Send another link" : verifiedEmail ? "Verify new email" : "Send verification"}</PrimaryButton>
          </form>
          {message ? <p className="mt-3 text-sm leading-relaxed text-chalk/55" role="status">{message}</p> : null}
        </div>
      </SettingsPanel>
    </div>
  );
}
