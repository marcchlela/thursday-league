"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Card, PrimaryButton, TextInput } from "@/components/ui";
import { supabase } from "@/lib/supabase";

type ConfirmationState = "working" | "verified" | "recovery" | "error";

export default function AuthConfirmationPage() {
  const [state, setState] = useState<ConfirmationState>("working");
  const [message, setMessage] = useState("Confirming your secure link...");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function confirm() {
      const url = new URL(window.location.href);
      const flow = url.searchParams.get("flow");
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const otpType = url.searchParams.get("type") as EmailOtpType | null;
      const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");

      let error: { message: string } | null = null;
      if (code) {
        ({ error } = await supabase.auth.exchangeCodeForSession(code));
      } else if (tokenHash && otpType) {
        ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType }));
      } else if (accessToken && refreshToken) {
        ({ error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        }));
      } else {
        const session = await supabase.auth.getSession();
        error = session.error;
        if (!session.data.session) error = { message: "This secure link is invalid or has expired." };
      }

      if (!active) return;
      if (error) {
        setState("error");
        setMessage("This secure link is invalid or has expired. Request a new one and try again.");
        return;
      }
      if (flow === "recover-password" || fragment.get("type") === "recovery" || otpType === "recovery") {
        setState("recovery");
        setMessage("Choose a new password for your account.");
      } else {
        setState("verified");
        setMessage("Your email is verified. You can now use it to sign in and recover your password.");
      }
    }
    void confirm();
    return () => { active = false; };
  }, []);

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setMessage("Password needs at least 8 characters.");
    if (password !== confirmPassword) return setMessage("Passwords do not match.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage("Your password could not be updated. Request a new recovery link and try again.");
      return;
    }
    setState("verified");
    setMessage("Password updated. You can continue to Thursday League.");
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-4">
      <Card className="w-full">
        <span className="grid h-12 w-12 place-items-center rounded-xl border border-league-gold/25 bg-league-gold/[.07] text-league-gold">{state === "recovery" ? <KeyRound size={22} /> : <CheckCircle2 size={22} />}</span>
        <h1 className="mt-4 font-display text-4xl uppercase">{state === "working" ? "One moment" : state === "recovery" ? "Reset password" : state === "verified" ? "All set" : "Link unavailable"}</h1>
        <p className="mt-2 text-sm leading-relaxed text-chalk/55" role="status">{message}</p>
        {state === "recovery" ? <form onSubmit={savePassword} className="mt-5 space-y-4"><label className="block"><span className="text-xs font-bold text-chalk/55">New password</span><TextInput type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" className="mt-2 rounded-xl border-league-gold/15" /></label><label className="block"><span className="text-xs font-bold text-chalk/55">Confirm new password</span><TextInput type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" className="mt-2 rounded-xl border-league-gold/15" /></label><PrimaryButton disabled={saving} className="w-full rounded-xl py-3">{saving ? "Updating..." : "Update password"}</PrimaryButton></form> : null}
        {state !== "working" && state !== "recovery" ? <Link href="/" className="mt-5 inline-flex rounded-xl border border-league-gold/25 px-4 py-2.5 text-sm font-bold text-league-gold">Continue</Link> : null}
      </Card>
    </div>
  );
}
