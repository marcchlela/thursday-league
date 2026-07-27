"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, KeyRound, LogOut, Sparkles, Trash2, UserRound, UserX, WalletCards } from "lucide-react";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useWhatsNewStatus } from "@/hooks/useWhatsNew";
import { friendlyActionError } from "@/lib/actionErrors";
import { supabase } from "@/lib/supabase";
import { SettingsHeader, SettingsLinkRow, SettingsPanel } from "@/components/SettingsComponents";
import { ThemeSelector } from "@/components/ThemeSelector";
import { ConfirmDialog, LoadingState, Modal, SecondaryButton, TextInput, Toast } from "@/components/ui";

type AccountAction = "signout" | "deactivate" | "delete";

export default function SettingsPage() {
  const { profile, loading } = useAuthProfile();
  const { hasUnreadRelease } = useWhatsNewStatus();
  const router = useRouter();
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [busy, setBusy] = useState<AccountAction | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const closeDelete = useCallback(() => {
    if (busy === "delete") return;
    setDeleteOpen(false);
    setDeleteText("");
  }, [busy]);

  if (loading) return <LoadingState label="Loading settings" cards={3} />;
  if (!profile) return null;

  async function finishSession() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function signOut() {
    if (busy) return;
    setBusy("signout");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setBusy(null);
      setToast(friendlyActionError(error, "You could not be signed out. Please try again."));
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  async function deactivateAccount() {
    if (busy) return;
    setBusy("deactivate");
    const { error } = await supabase.rpc("deactivate_own_account");
    if (error) {
      setBusy(null);
      setDeactivateOpen(false);
      setToast(friendlyActionError(error, "The account could not be deactivated. Please try again."));
      return;
    }
    await finishSession();
  }

  async function deleteAccount() {
    if (busy || deleteText !== "DELETE") return;
    setBusy("delete");
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setBusy(null);
      setToast("Your session has expired. Sign in again before deleting the account.");
      return;
    }
    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ confirmation: deleteText })
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setBusy(null);
      setToast(result?.error || "Could not delete the account.");
      return;
    }
    await finishSession();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Toast message={toast} tone="error" duration={5000} onDone={() => setToast(null)} />
      <ConfirmDialog
        open={deactivateOpen}
        title="Deactivate account?"
        text="You will be signed out and unable to log in until an administrator reactivates your account. Your historical Fantasy points and bets will remain."
        confirmLabel={busy === "deactivate" ? "Deactivating…" : "Deactivate"}
        confirmTone="primary"
        cancelLabel="Keep account"
        onCancel={() => {
          if (!busy) setDeactivateOpen(false);
        }}
        onConfirm={deactivateAccount}
      />
      <Modal open={deleteOpen} title="Delete account" onClose={closeDelete}>
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-400/25 bg-red-400/[.08] text-red-300">
            <Trash2 size={20} />
          </span>
          <div>
            <h2 className="font-display text-3xl uppercase text-red-200">Delete account</h2>
            <p className="mt-1 text-sm leading-relaxed text-chalk/50">Your login and personal settings will be permanently removed. Historical league results remain under an anonymous deleted-user name.</p>
          </div>
        </div>
        <label className="mt-5 block">
          <span className="text-xs font-bold text-chalk/55">Type <strong className="text-red-300">DELETE</strong> to confirm</span>
          <TextInput
            autoFocus
            value={deleteText}
            onChange={event => setDeleteText(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="DELETE"
            className="mt-2 border-red-400/20 focus:border-red-400 focus:ring-red-400"
          />
        </label>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <SecondaryButton type="button" onClick={closeDelete} disabled={busy === "delete"}>Cancel</SecondaryButton>
          <button
            type="button"
            onClick={deleteAccount}
            disabled={deleteText !== "DELETE" || busy === "delete"}
            className="rounded-2xl border border-red-400/35 bg-red-500/15 px-3 py-2 font-bold text-red-200 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "delete" ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </Modal>

      <SettingsHeader
        title="Settings"
        description="Manage your profile, notifications, wallet activity, and account security."
        backHref="/profile"
        backLabel="Profile"
      />

      <SettingsPanel title="Preferences">
        <div className="divide-y divide-league-gold/10">
          <SettingsLinkRow href="/settings/profile" icon={UserRound} title="Edit profile" detail="Change your league display name and login username" />
          <SettingsLinkRow href="/settings/notifications" icon={Bell} title="Notifications" detail="Choose which push notifications and reminders you receive" tone="green" />
          <SettingsLinkRow href="/settings/wallet" icon={WalletCards} title="Wallet history" detail="Review coin grants, stakes, cash-outs, payouts, and corrections" />
          <SettingsLinkRow
            href="/settings/whats-new"
            icon={Sparkles}
            title="What’s New"
            detail="See the latest Thursday League releases and changes"
            badge={hasUnreadRelease ? <span className="rounded-full border border-league-gold/30 bg-league-gold/[.1] px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-league-gold">New update</span> : null}
          />
        </div>
      </SettingsPanel>

      <SettingsPanel title="Appearance">
        <ThemeSelector />
      </SettingsPanel>

      <SettingsPanel title="Security">
        <div className="divide-y divide-league-gold/10">
          <SettingsLinkRow href="/settings/password" icon={KeyRound} title="Update password" detail="Choose a new password for your account" />
          <button type="button" onClick={signOut} disabled={!!busy} className="group flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-league-gold/[.04] focus:outline-none focus-visible:bg-league-gold/[.06] disabled:opacity-50 sm:px-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-chalk/[.07] bg-chalk/[.025] text-chalk/50"><LogOut size={19} /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">Sign out</span><span className="mt-0.5 block text-xs text-chalk/35">Sign out of Thursday League on this device</span></span>
            <span className="text-xs font-bold text-chalk/30">{busy === "signout" ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-red-400/10 p-3 sm:p-4">
          <button type="button" onClick={() => setDeactivateOpen(true)} disabled={!!busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-chalk/[.08] bg-chalk/[.025] px-2 text-xs font-bold text-chalk/55 transition hover:border-league-gold/25 hover:text-chalk disabled:opacity-50 sm:text-sm">
            <UserX size={16} />
            Deactivate
          </button>
          <button type="button" onClick={() => setDeleteOpen(true)} disabled={!!busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/[.08] px-2 text-xs font-bold text-red-300 transition hover:bg-red-500/[.14] disabled:opacity-50 sm:text-sm">
            <Trash2 size={16} />
            Delete account
          </button>
        </div>
      </SettingsPanel>
    </div>
  );
}
