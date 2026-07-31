"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { POST_AUTH_PATH_KEY } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";

export function PublicAccountDeletion() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(result => {
      if (!mounted) return;
      setSession(result.data.session);
      setLoading(false);
    });
    const subscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      mounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  function signIn() {
    window.sessionStorage.setItem(POST_AUTH_PATH_KEY, "/delete-account");
    router.push("/login");
  }

  async function deleteAccount() {
    if (!session || confirmation !== "DELETE" || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ confirmation })
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "The account could not be deleted.");
      await supabase.auth.signOut();
      router.replace("/welcome");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The account could not be deleted. Please try again.");
      setBusy(false);
    }
  }

  if (loading) {
    return <div aria-live="polite" className="rounded-[1.35rem] border border-league-gold/18 bg-ink-850/80 p-6 text-chalk/55">Checking your secure session…</div>;
  }

  if (!session) {
    return (
      <div className="rounded-[1.35rem] border border-league-gold/20 bg-ink-850/80 p-6">
        <h2 className="font-display text-2xl uppercase">Sign in securely</h2>
        <p className="mt-2 text-chalk/60">We need to verify the account before showing the permanent deletion control. You will return here after signing in.</p>
        <button type="button" onClick={signIn} className="mt-5 min-h-12 rounded-xl bg-league-gold px-5 font-black text-gold-ink transition hover:bg-floodlight focus:outline-none focus-visible:ring-2 focus-visible:ring-chalk">
          Sign in to continue
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[1.35rem] border border-red-400/25 bg-red-500/[.055] p-6">
      <h2 className="font-display text-2xl uppercase text-red-200">Permanent deletion</h2>
      <p className="mt-2 text-chalk/60">This removes your login, verified email, profile photo, personal settings, and notification devices. Shared match, fantasy, and prediction history stays in the league under an anonymous deleted-user label.</p>
      <p className="mt-3 text-chalk/60">If you own an active league, transfer ownership or archive the league first.</p>
      {message ? <p role="alert" className="mt-4 rounded-xl border border-red-400/25 bg-red-500/[.08] p-3 text-sm text-red-200">{message}</p> : null}
      <label className="mt-5 block">
        <span className="text-xs font-bold text-chalk/60">Type <strong className="text-red-300">DELETE</strong> to confirm</span>
        <input
          value={confirmation}
          onChange={event => setConfirmation(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="DELETE"
          className="mt-2 min-h-12 w-full rounded-xl border border-red-400/25 bg-ink-900 px-4 text-chalk outline-none transition placeholder:text-chalk/25 focus:border-red-400 focus:ring-2 focus:ring-red-400/25"
        />
      </label>
      <button
        type="button"
        onClick={() => void deleteAccount()}
        disabled={confirmation !== "DELETE" || busy}
        className="mt-4 min-h-12 w-full rounded-xl border border-red-400/35 bg-red-500/15 px-5 font-black text-red-200 transition hover:bg-red-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Deleting account…" : "Delete account forever"}
      </button>
    </div>
  );
}

