"use client";

import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { supabase } from "@/lib/supabase";
import { friendlyActionError } from "@/lib/actionErrors";
import { SettingsHeader, SettingsPanel } from "@/components/SettingsComponents";
import { LoadingState, PrimaryButton, TextInput } from "@/components/ui";

export default function PasswordSettingsPage() {
  const { user, loading } = useAuthProfile();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return <LoadingState label="Loading password settings" cards={1} />;
  if (!user) return null;

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (!currentPassword) {
      setMessage("Enter your current password.");
      return;
    }
    if (password.length < 8) {
      setMessage("Password needs at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setSaving(true);
    setMessage(null);
    const userEmail = user?.email;
    if (!userEmail) {
      setSaving(false);
      setMessage("Your account login could not be verified.");
      return;
    }
    const verification = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword
    });
    if (verification.error) {
      setSaving(false);
      setMessage("Current password is incorrect.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    setMessage(error ? friendlyActionError(error, "Your password could not be updated.") : "Password updated.");
    if (!error) {
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="Update password" description="Choose a new password for your Thursday League account." />
      <SettingsPanel>
        <form onSubmit={updatePassword} className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-league-gold/20 bg-league-gold/[.055] text-league-gold"><KeyRound size={20} /></span>
            <div><h2 className="font-display text-2xl uppercase">Account password</h2><p className="mt-1 text-xs text-chalk/40">Confirm your current password, then use at least 8 characters for the new one.</p></div>
          </div>
          <div className="mt-5 space-y-4">
            <label className="block"><span className="text-xs font-bold text-chalk/55">Current password</span><TextInput type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" className="mt-2 rounded-xl border-league-gold/15" /></label>
            <label className="block"><span className="text-xs font-bold text-chalk/55">New password</span><TextInput type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" className="mt-2 rounded-xl border-league-gold/15" /></label>
            <label className="block"><span className="text-xs font-bold text-chalk/55">Confirm new password</span><TextInput type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" className="mt-2 rounded-xl border-league-gold/15" /></label>
          </div>
          <PrimaryButton type="submit" disabled={saving} className="mt-4 w-full rounded-xl py-3 sm:w-auto">{saving ? "Updating…" : "Update password"}</PrimaryButton>
          {message ? <p className="mt-3 text-sm text-chalk/55" role="status">{message}</p> : null}
        </form>
      </SettingsPanel>
    </div>
  );
}
