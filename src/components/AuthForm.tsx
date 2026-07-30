"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BellRing, Coins, Eye, EyeOff, LockKeyhole, Shirt, Smartphone, UserPlus } from "lucide-react";
import { isInstalledApp } from "@/lib/pushClient";
import { friendlyActionError } from "@/lib/actionErrors";
import { cleanUsername, supabase, supabaseConfigError, usernameToEmail } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { PrimaryButton, TextInput } from "./ui";
import leagueLogo from "../../Thursday League logo (no bg).png";

function friendlyAuthError(message: string) {
  if (message.toLowerCase().includes("email rate limit")) {
    return "Supabase is trying to send confirmation emails too often. Turn off email confirmation in Supabase Authentication > Providers > Email for this username-only app, then wait a few minutes and try again.";
  }

  return friendlyActionError(message, "Login could not be completed. Check your details and try again.");
}

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [installedApp, setInstalledApp] = useState(false);

  useEffect(() => {
    setInstalledApp(isInstalledApp());
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const cleaned = cleanUsername(username);
    if (cleaned.length < 2) return setMessage("Username needs at least 2 letters/numbers.");
    if (password.length < 8) return setMessage("Password needs at least 8 characters.");
    if (mode === "signup" && password !== confirmPassword) return setMessage("Passwords do not match.");
    if (supabaseConfigError) return setMessage(supabaseConfigError);

    setLoading(true);
    const email = usernameToEmail(cleaned);
    try {
      if (mode === "signup") {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: cleaned,
            password
          })
        });
        const body = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) {
          setMessage(body?.error || "The account could not be created.");
          return;
        }
      }

      const result = await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        setMessage(friendlyAuthError(result.error.message));
        return;
      }

      const intendedPath = window.sessionStorage.getItem("thursday-league-post-auth-path");
      window.sessionStorage.removeItem("thursday-league-post-auth-path");
      router.replace(intendedPath?.startsWith("/") ? intendedPath : "/");
    } catch {
      setMessage("Could not reach Supabase. Check your project URL, anon key, and internet connection, then try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-900 text-chalk">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full border-[52px] border-league-gold/[.035]" />
      <div className="pointer-events-none absolute bottom-0 right-[-8rem] h-[34rem] w-[34rem] rounded-full border border-league-gold/[.07]" />
      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px bg-league-gold/[.07] lg:block" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-league-gold/[.07] lg:block" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-7 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:py-12">
        <section className="text-center lg:text-left">
          <div className="flex items-center justify-center gap-2.5 lg:justify-start">
            <Image src={leagueLogo} alt="" priority className="h-16 w-16 scale-125 object-contain sm:h-20 sm:w-20" />
            <div className="text-left">
              <div className="text-[9px] font-black uppercase tracking-[.22em] text-league-gold/65">Weekly five-a-side</div>
              <div className="mt-1 font-display text-2xl uppercase leading-none sm:text-3xl">Thursday League</div>
            </div>
          </div>

          <h1 className="mx-auto mt-7 max-w-xl font-display text-5xl uppercase leading-[.92] tracking-tight sm:text-6xl lg:mx-0 lg:text-7xl">Your matchweek.<br /><span className="text-league-gold">One place.</span></h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-chalk/48 sm:text-base lg:mx-0">Lineups, Fantasy, virtual betting, results and league history built around your Thursday game.</p>

          <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-2 lg:mx-0">
            <LoginFeature icon={Shirt} label="Fantasy" />
            <LoginFeature icon={Coins} label="Virtual bets" />
            <LoginFeature icon={BellRing} label="Updates" />
          </div>
        </section>

        <form onSubmit={submit} className="rounded-[1.45rem] border border-league-gold/30 bg-ink-850 p-4 shadow-[0_16px_44px_rgba(0,0,0,.28)] sm:p-6 lg:p-7">
          <div className="grid grid-cols-2 rounded-[1rem] border border-league-gold/20 bg-black/20 p-1" role="group" aria-label="Account access">
            {(["login", "signup"] as const).map(item => (
              <button key={item} type="button" aria-pressed={mode === item} onClick={() => { setMode(item); setMessage(null); }} className={cn("rounded-[.75rem] px-3 py-2.5 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold", mode === item ? "bg-league-gold/[.11] text-league-gold" : "text-chalk/40 hover:text-chalk")}>{item === "login" ? "Log in" : "Sign up"}</button>
            ))}
          </div>

          <div className="mb-5 mt-6 flex items-start justify-between gap-3">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/60">League access</div>
              <h2 className="mt-1 font-display text-4xl uppercase">{mode === "login" ? "Welcome back" : "Create account"}</h2>
              <p className="mt-1 text-sm text-chalk/40">{mode === "login" ? "Sign in to continue your matchweek." : "Create an account, then join or start a league."}</p>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-league-gold/20 bg-league-gold/[.055] text-league-gold">
              {mode === "login" ? <LockKeyhole size={20} /> : <UserPlus size={20} />}
            </span>
          </div>

          {installedApp ? (
            <div className="mb-5 flex gap-3 rounded-xl border border-turf-400/20 bg-turf-400/[.055] p-3.5 text-sm text-chalk/65">
              <Smartphone className="mt-0.5 shrink-0 text-turf-400" size={18} />
              <div><strong className="text-chalk">Installed app</strong><p className="mt-0.5 text-xs leading-relaxed">Sign in once and this app will keep your secure session.</p></div>
            </div>
          ) : null}

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/45">Username</span>
              <TextInput value={username} onChange={e => setUsername(e.target.value)} placeholder="Your username" autoComplete="username" autoCapitalize="none" className="rounded-xl border-league-gold/15 py-3" />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wider text-chalk/45">
                <span>Password</span>
                {mode === "login" ? <Link href="/forgot-password" className="normal-case tracking-normal text-league-gold/75 underline-offset-4 hover:underline">Forgot password?</Link> : null}
              </span>
              <span className="relative block">
                <TextInput type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" autoComplete={mode === "login" ? "current-password" : "new-password"} className="rounded-xl border-league-gold/15 py-3 pr-12" />
                <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-chalk/35 transition hover:bg-league-gold/[.06] hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {mode === "signup" ? (
              <>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/45">Confirm password</span>
                  <TextInput type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Password again" autoComplete="new-password" className="rounded-xl border-league-gold/15 py-3" />
                </label>
              </>
            ) : null}
          </div>

          {message ? <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-400/25 bg-red-400/[.07] p-3 text-sm leading-relaxed text-red-200" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={17} />{message}</div> : null}

          <PrimaryButton disabled={loading} className="mt-6 w-full rounded-xl py-3">
            {loading ? "Working…" : mode === "login" ? "Enter Thursday League" : "Create account"}
          </PrimaryButton>
          <p className="mt-4 text-center text-xs text-chalk/30">{mode === "login" ? "Use the username and password linked to your account." : "League invitations and join codes are handled after your account is created."}</p>
        </form>
      </div>
    </div>
  );
}

function LoginFeature({ icon: Icon, label }: { icon: typeof Shirt; label: string }) {
  return (
    <div className="rounded-[1rem] border border-league-gold/20 bg-ink-850 px-2 py-3 text-center shadow-[0_7px_18px_rgba(0,0,0,.12)]">
      <Icon size={18} className="mx-auto text-league-gold" />
      <div className="mt-1.5 text-[9px] font-black uppercase tracking-[.12em] text-chalk/45 sm:text-[10px]">{label}</div>
    </div>
  );
}
