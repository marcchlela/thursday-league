"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BellRing, Coins, Eye, EyeOff, LockKeyhole, Mail, Shirt, Smartphone, UserPlus } from "lucide-react";
import { isInstalledApp } from "@/lib/pushClient";
import { cleanUsername, supabase, supabaseConfigError } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { PrimaryButton, TextInput } from "./ui";
import leagueLogo from "../../Thursday League logo (no bg).png";

type PublicSession = {
  access_token: string;
  refresh_token: string;
};

type AuthResponse = {
  error?: string;
  session?: PublicSession | null;
  emailVerificationSent?: boolean;
  warning?: string | null;
};

async function authRequest(path: string, body: Record<string, string>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null) as AuthResponse | null;
  if (!response.ok) throw new Error(payload?.error || "Account access could not be completed.");
  return payload;
}

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [identity, setIdentity] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [installedApp, setInstalledApp] = useState(false);

  useEffect(() => {
    setInstalledApp(isInstalledApp());
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    if (requestedMode === "signup" || requestedMode === "login") setMode(requestedMode);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const username = cleanUsername(identity);
    if (mode === "signup" && username.length < 2) return setMessage("Username needs at least 2 letters or numbers.");
    if (mode === "login" && identity.trim().length < 2) return setMessage("Enter your username or email.");
    if (mode === "signup" && !email.trim()) return setMessage("Enter your email address.");
    if (password.length < 8) return setMessage("Password needs at least 8 characters.");
    if (mode === "signup" && password !== confirmPassword) return setMessage("Passwords do not match.");
    if (supabaseConfigError) return setMessage("The app is temporarily unavailable. Please try again shortly.");

    setLoading(true);
    try {
      const payload = mode === "signup"
        ? await authRequest("/api/auth/signup", {
            username,
            email: email.trim(),
            password,
            platform: "web"
          })
        : await authRequest("/api/auth/session", {
            identity: identity.trim(),
            password
          });

      let session = payload?.session;
      if (!session && mode === "signup") {
        const login = await authRequest("/api/auth/session", { identity: username, password });
        session = login?.session;
      }
      if (!session) throw new Error(payload?.warning || "Your account is ready. Log in to continue.");

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      });
      if (sessionError) throw sessionError;

      if (mode === "signup") {
        window.sessionStorage.setItem(
          "thursday-league:auth-notice",
          payload?.emailVerificationSent
            ? "Account created. Check your email when convenient to verify recovery."
            : payload?.warning || "Account created. Add a verified recovery email from Settings."
        );
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reach the service. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-900 text-chalk">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full border-[52px] border-league-gold/[.035]" />
      <div className="pointer-events-none absolute bottom-0 right-[-8rem] h-[34rem] w-[34rem] rounded-full border border-league-gold/[.07]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-7 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:py-12">
        <section className="text-center lg:text-left">
          <div className="flex items-center justify-center gap-2.5 lg:justify-start">
            <Image src={leagueLogo} alt="" priority className="h-16 w-16 scale-125 object-contain sm:h-20 sm:w-20" />
            <div className="text-left"><div className="text-[9px] font-black uppercase tracking-[.22em] text-league-gold/65">Weekly five-a-side</div><div className="mt-1 font-display text-2xl uppercase leading-none sm:text-3xl">Thursday League</div></div>
          </div>
          <h1 className="mx-auto mt-7 max-w-xl font-display text-5xl uppercase leading-[.92] tracking-tight sm:text-6xl lg:mx-0 lg:text-7xl">Your matchweek.<br /><span className="text-league-gold">One place.</span></h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-chalk/48 sm:text-base lg:mx-0">Lineups, Fantasy, virtual betting, results and league history built around your weekly game.</p>
          <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-2 lg:mx-0"><LoginFeature icon={Shirt} label="Fantasy" /><LoginFeature icon={Coins} label="Virtual bets" /><LoginFeature icon={BellRing} label="Updates" /></div>
        </section>

        <form onSubmit={submit} className="rounded-[1.45rem] border border-league-gold/30 bg-ink-850 p-4 shadow-[0_16px_44px_rgba(0,0,0,.28)] sm:p-6 lg:p-7">
          <div className="grid grid-cols-2 rounded-[1rem] border border-league-gold/20 bg-black/20 p-1" role="group" aria-label="Account access">
            {(["login", "signup"] as const).map(item => <button key={item} type="button" aria-pressed={mode === item} onClick={() => { setMode(item); setMessage(null); setIdentity(""); }} className={cn("rounded-[.75rem] px-3 py-2.5 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold", mode === item ? "bg-league-gold/[.11] text-league-gold" : "text-chalk/40 hover:text-chalk")}>{item === "login" ? "Log in" : "Sign up"}</button>)}
          </div>
          <div className="mb-5 mt-6 flex items-start justify-between gap-3">
            <div><div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/60">League access</div><h2 className="mt-1 font-display text-4xl uppercase">{mode === "login" ? "Welcome back" : "Create account"}</h2><p className="mt-1 text-sm text-chalk/40">{mode === "login" ? "Sign in to continue your matchweek." : "One account for every league you join."}</p></div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-league-gold/20 bg-league-gold/[.055] text-league-gold">{mode === "login" ? <LockKeyhole size={20} /> : <UserPlus size={20} />}</span>
          </div>
          {installedApp ? <div className="mb-5 flex gap-3 rounded-xl border border-turf-400/20 bg-turf-400/[.055] p-3.5 text-sm text-chalk/65"><Smartphone className="mt-0.5 shrink-0 text-turf-400" size={18} /><div><strong className="text-chalk">Installed app</strong><p className="mt-0.5 text-xs leading-relaxed">Sign in once and this app will keep your secure session.</p></div></div> : null}

          <div className="space-y-4">
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/45">{mode === "login" ? "Username or email" : "Username"}</span><TextInput value={identity} onChange={event => setIdentity(event.target.value)} placeholder={mode === "login" ? "Username or verified email" : "Choose a username"} autoComplete="username" autoCapitalize="none" className="rounded-xl border-league-gold/15 py-3" /></label>
            {mode === "signup" ? <label className="block"><span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-chalk/45"><Mail size={13} />Email</span><TextInput type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" autoCapitalize="none" className="rounded-xl border-league-gold/15 py-3" /><span className="mt-1.5 block text-[11px] leading-relaxed text-chalk/32">Used privately for verification and password recovery.</span></label> : null}
            <div className="block">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wider text-chalk/45"><label htmlFor="auth-password">Password</label>{mode === "login" ? <Link href="/forgot-password" className="normal-case tracking-normal text-league-gold/75 underline-offset-4 hover:underline">Forgot password?</Link> : null}</div>
              <span className="relative block"><TextInput id="auth-password" type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="Your password" autoComplete={mode === "login" ? "current-password" : "new-password"} className="rounded-xl border-league-gold/15 py-3 pr-12" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-chalk/35 transition hover:bg-league-gold/[.06] hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
            </div>
            {mode === "signup" ? <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/45">Confirm password</span><TextInput type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Password again" autoComplete="new-password" className="rounded-xl border-league-gold/15 py-3" /></label> : null}
          </div>
          {message ? <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-400/25 bg-red-400/[.07] p-3 text-sm leading-relaxed text-red-200" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={17} />{message}</div> : null}
          {mode === "signup" ? <p className="mt-4 text-center text-[11px] leading-relaxed text-chalk/35">By creating an account, you agree to the <Link href="/terms" className="font-bold text-league-gold/80 hover:text-league-gold hover:underline">Terms of Use</Link> and acknowledge the <Link href="/privacy" className="font-bold text-league-gold/80 hover:text-league-gold hover:underline">Privacy Policy</Link>.</p> : null}
          <PrimaryButton disabled={loading} className="mt-6 w-full rounded-xl py-3">{loading ? "Working..." : mode === "login" ? "Enter Thursday League" : "Create account"}</PrimaryButton>
          <p className="mt-4 text-center text-xs text-chalk/30">{mode === "login" ? "Email sign-in works after that address is verified." : "You can enter the app immediately; verify your email when it arrives."}</p>
          <nav aria-label="Help and legal" className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-league-gold/12 pt-4 text-[11px] font-bold text-chalk/38">
            <Link href="/privacy" className="transition hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">Privacy</Link>
            <span aria-hidden="true" className="text-league-gold/30">•</span>
            <Link href="/terms" className="transition hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">Terms</Link>
            <span aria-hidden="true" className="text-league-gold/30">•</span>
            <Link href="/support" className="transition hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">Support</Link>
          </nav>
        </form>
      </div>
    </div>
  );
}

function LoginFeature({ icon: Icon, label }: { icon: typeof Shirt; label: string }) {
  return <div className="rounded-[1rem] border border-league-gold/20 bg-ink-850 px-2 py-3 text-center shadow-[0_7px_18px_rgba(0,0,0,.12)]"><Icon size={18} className="mx-auto text-league-gold" /><div className="mt-1.5 text-[9px] font-black uppercase tracking-[.12em] text-chalk/45 sm:text-[10px]">{label}</div></div>;
}
