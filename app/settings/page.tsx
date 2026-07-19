"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, UserRound } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { cleanUsername, supabase, usernameToEmail } from "@/lib/supabase";
import { Card, LoadingState, PrimaryButton, TextInput } from "@/components/ui";
import { NotificationSettings } from "@/components/NotificationSettings";

export default function SettingsPage() {
  const { user, profile, loading, reloadProfile } = useAuthProfile();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  useEffect(() => { if (profile) setName(profile.username); }, [profile]);
  if (loading) return <LoadingState label="Loading settings" cards={2} />;
  if (!user || !profile) return null;

  async function updateName(event: React.FormEvent) {
    event.preventDefault();
    const cleaned = cleanUsername(name);
    if (cleaned.length < 2) return setNameMessage("Name needs at least 2 characters.");
    const oldUsername = profile!.username;
    const { error: authError } = await supabase.auth.updateUser({ email: usernameToEmail(cleaned), data: { ...user!.user_metadata, username: cleaned } });
    if (authError) return setNameMessage(authError.message);
    const { error: profileError } = await supabase.rpc("update_own_username", { new_username: cleaned });
    if (profileError) {
      await supabase.auth.updateUser({ email: usernameToEmail(oldUsername), data: { ...user!.user_metadata, username: oldUsername } });
      return setNameMessage(profileError.message);
    }
    setNameMessage("Username updated. Use the new username next time you log in.");
    reloadProfile();
  }
  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 6) return setPasswordMessage("Password needs at least 6 characters.");
    if (password !== confirmPassword) return setPasswordMessage("Passwords do not match.");
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordMessage(error ? error.message : "Password updated.");
    if (!error) { setPassword(""); setConfirmPassword(""); }
  }

  return <div className="space-y-6"><Link href="/profile" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-chalk/70 transition hover:text-chalk"><ArrowLeft size={16} /> Back to Profile</Link><div><h1 className="font-display text-5xl uppercase">Settings</h1><p className="mt-2 text-chalk/60">Manage your account details and security.</p></div><div className="grid gap-6 lg:grid-cols-2"><Card><div className="flex items-center gap-3"><UserRound className="text-perimeter-400" /><h2 className="font-display text-3xl uppercase">Change username</h2></div><p className="mt-2 text-sm text-chalk/55">This changes both your league display name and the username you use to log in. Your Supabase project must keep email confirmation disabled for the current username-only login system.</p><form onSubmit={updateName} className="mt-5 space-y-3"><label className="block text-sm font-semibold text-chalk/70">Username</label><TextInput value={name} maxLength={32} onChange={event => setName(event.target.value)} /><PrimaryButton>Save username</PrimaryButton>{nameMessage ? <p className="text-sm text-chalk/60">{nameMessage}</p> : null}</form></Card><Card><div className="flex items-center gap-3"><KeyRound className="text-floodlight" /><h2 className="font-display text-3xl uppercase">Update password</h2></div><form onSubmit={updatePassword} className="mt-5 space-y-3"><label className="block text-sm font-semibold text-chalk/70">New password</label><TextInput type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" /><label className="block text-sm font-semibold text-chalk/70">Confirm new password</label><TextInput type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" /><PrimaryButton>Update password</PrimaryButton>{passwordMessage ? <p className="text-sm text-chalk/60">{passwordMessage}</p> : null}</form></Card><NotificationSettings /></div></div>;
}
