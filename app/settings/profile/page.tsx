"use client";

import { FormEvent, useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { cleanUsername, supabase, usernameToEmail } from "@/lib/supabase";
import { friendlyActionError } from "@/lib/actionErrors";
import { SettingsHeader, SettingsPanel } from "@/components/SettingsComponents";
import { LoadingState, PrimaryButton, TextInput } from "@/components/ui";

export default function EditProfilePage() {
  const { user, profile, loading, reloadProfile } = useAuthProfile();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setName(profile.username);
  }, [profile]);

  if (loading) return <LoadingState label="Loading profile settings" cards={1} />;
  if (!user || !profile) return null;

  async function updateName(event: FormEvent) {
    event.preventDefault();
    const cleaned = cleanUsername(name);
    if (cleaned.length < 2) {
      setMessage("Name needs at least 2 characters.");
      return;
    }
    if (cleaned === profile!.username) {
      setMessage("That is already your current username.");
      return;
    }

    setSaving(true);
    setMessage(null);
    const oldUsername = profile!.username;
    const authUpdate = await supabase.auth.updateUser({
      email: usernameToEmail(cleaned),
      data: { ...user!.user_metadata, username: cleaned }
    });
    if (authUpdate.error) {
      setSaving(false);
      setMessage(friendlyActionError(authUpdate.error, "Your login username could not be updated."));
      return;
    }

    const profileUpdate = await supabase.rpc("update_own_username", { new_username: cleaned });
    if (profileUpdate.error) {
      await supabase.auth.updateUser({
        email: usernameToEmail(oldUsername),
        data: { ...user!.user_metadata, username: oldUsername }
      });
      setSaving(false);
      setMessage(friendlyActionError(profileUpdate.error, "Your profile could not be updated."));
      return;
    }

    await reloadProfile();
    setSaving(false);
    setMessage("Profile updated. Use this username the next time you log in.");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="Edit profile" description="Change the name shown throughout Thursday League." />
      <SettingsPanel>
        <form onSubmit={updateName} className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-league-gold/20 bg-league-gold/[.055] text-league-gold"><UserRound size={20} /></span>
            <div><h2 className="font-display text-2xl uppercase">Display name</h2><p className="mt-1 text-xs leading-relaxed text-chalk/40">For now, your display name is also the username used to sign in.</p></div>
          </div>
          <label className="mt-5 block">
            <span className="text-xs font-bold text-chalk/55">Username</span>
            <TextInput value={name} maxLength={32} autoComplete="username" onChange={event => setName(event.target.value)} className="mt-2 rounded-xl border-league-gold/15" />
          </label>
          <PrimaryButton type="submit" disabled={saving} className="mt-4 w-full rounded-xl py-3 sm:w-auto">{saving ? "Saving…" : "Save profile"}</PrimaryButton>
          {message ? <p className="mt-3 text-sm text-chalk/55" role="status">{message}</p> : null}
        </form>
      </SettingsPanel>
    </div>
  );
}
