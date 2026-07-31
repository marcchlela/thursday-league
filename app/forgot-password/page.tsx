"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Card, PrimaryButton, TextInput } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function requestRecovery(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, platform: "web" })
      });
      const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Recovery is temporarily unavailable.");
      setMessage(body?.message || "If that account has a verified recovery email, a reset link is on its way.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reach the service. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center px-4">
      <Card className="w-full">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-league-gold/20 bg-league-gold/[.055] text-league-gold"><KeyRound size={20} /></span>
          <div><div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/65">Account recovery</div><h1 className="mt-1 font-display text-4xl uppercase">Forgot password?</h1></div>
        </div>

        <form onSubmit={requestRecovery} className="mt-5">
          <label className="block"><span className="text-xs font-bold text-chalk/55">Username</span><TextInput value={username} onChange={event => setUsername(event.target.value)} autoCapitalize="none" autoComplete="username" placeholder="Your username" className="mt-2 rounded-xl border-league-gold/15" /></label>
          <PrimaryButton disabled={loading} className="mt-4 w-full rounded-xl py-3">{loading ? "Sending..." : "Send reset link"}</PrimaryButton>
        </form>

        {message ? <div className="mt-4 flex gap-3 rounded-2xl border border-league-gold/20 bg-black/15 p-4" role="status"><ShieldCheck className="mt-0.5 shrink-0 text-league-gold" size={19} /><p className="text-sm leading-relaxed text-chalk/70">{message}</p></div> : null}
        <p className="mt-4 text-xs leading-relaxed text-chalk/35">Recovery works only after your private email has been verified. Your username remains your public identity.</p>
        <Link href="/login" className="mt-5 inline-flex rounded-2xl border border-league-gold/25 bg-black/15 px-4 py-2.5 text-sm font-bold text-chalk/70 transition hover:border-league-gold/50 hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">Back to login</Link>
      </Card>
    </div>
  );
}
