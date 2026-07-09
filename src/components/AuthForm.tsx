"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, UserPlus } from "lucide-react";
import { cleanUsername, supabase, supabaseConfigError, usernameToEmail } from "@/lib/supabase";
import { PrimaryButton, SecondaryButton, TextInput } from "./ui";

const inviteCode = process.env.NEXT_PUBLIC_LEAGUE_INVITE_CODE?.trim();

function friendlyAuthError(message: string) {
  if (message.toLowerCase().includes("email rate limit")) {
    return "Supabase is trying to send confirmation emails too often. Turn off email confirmation in Supabase Authentication > Providers > Email for this username-only app, then wait a few minutes and try again.";
  }

  return message;
}

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [enteredInviteCode, setEnteredInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const cleaned = cleanUsername(username);
    if (cleaned.length < 2) return setMessage("Username needs at least 2 letters/numbers.");
    if (password.length < 6) return setMessage("Password needs at least 6 characters.");
    if (mode === "signup" && password !== confirmPassword) return setMessage("Passwords do not match.");
    if (mode === "signup" && inviteCode && enteredInviteCode.trim() !== inviteCode) return setMessage("Invite code is not valid.");
    if (supabaseConfigError) return setMessage(supabaseConfigError);

    setLoading(true);
    const email = usernameToEmail(cleaned);
    try {
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password, options: { data: { username: cleaned } } });

      if (result.error) {
        setMessage(friendlyAuthError(result.error.message));
        return;
      }

      router.replace("/");
    } catch {
      setMessage("Could not reach Supabase. Check your project URL, anon key, and internet connection, then try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink-900 bg-turf text-chalk">
      <div className="min-h-screen bg-gradient-to-b from-black/65 via-ink-900/65 to-black/85 px-4 py-10">
        <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-6">
            <div className="inline-flex rounded-full border border-perimeter-400/50 bg-black/30 px-4 py-2 text-sm font-semibold text-perimeter-400 shadow-glow">Weekly 5-a-side + fantasy</div>
            <h1 className="max-w-3xl font-display text-6xl uppercase leading-none tracking-tight md:text-8xl">Thursday League</h1>
            <p className="max-w-xl text-lg text-chalk/75">Track the game, lock in a five-man fantasy squad, captain your best shout, and let the points settle the group chat.</p>
            <div className="grid max-w-xl grid-cols-3 gap-3 border-y border-dashed border-chalk/25 py-5">
              <div><div className="font-mono text-3xl">5</div><p className="text-xs uppercase tracking-wider text-chalk/55">picks</p></div>
              <div><div className="font-mono text-3xl">+4</div><p className="text-xs uppercase tracking-wider text-chalk/55">goal</p></div>
              <div><div className="font-mono text-3xl text-floodlight">x2</div><p className="text-xs uppercase tracking-wider text-chalk/55">captain</p></div>
            </div>
          </div>

          <form onSubmit={submit} className="panel rounded-[2rem] border border-white/10 p-6 shadow-glow md:p-8">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-4xl uppercase">{mode === "login" ? "Log in" : "Sign up"}</h2>
                <p className="text-sm text-chalk/60">The first account created becomes admin.</p>
              </div>
              {mode === "login" ? <LockKeyhole className="text-perimeter-400" /> : <UserPlus className="text-floodlight" />}
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-semibold text-chalk/70">Username</label>
              <TextInput value={username} onChange={e => setUsername(e.target.value)} placeholder="marc" autoComplete="username" />

              <label className="block text-sm font-semibold text-chalk/70">Password</label>
              <div className="relative">
                <TextInput type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoComplete={mode === "login" ? "current-password" : "new-password"} />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-chalk/50 hover:text-chalk">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {mode === "signup" ? (
                <>
                  <label className="block text-sm font-semibold text-chalk/70">Confirm password</label>
                  <TextInput type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Password again" autoComplete="new-password" />
                  {inviteCode ? (
                    <>
                      <label className="block text-sm font-semibold text-chalk/70">Invite code</label>
                      <TextInput value={enteredInviteCode} onChange={e => setEnteredInviteCode(e.target.value)} placeholder="League code" autoComplete="off" />
                    </>
                  ) : null}
                </>
              ) : null}
            </div>

            {message ? <div className="mt-4 rounded-2xl border border-floodlight/30 bg-floodlight/10 p-3 text-sm text-floodlight">{message}</div> : null}

            <PrimaryButton disabled={loading} className="mt-6 w-full py-3">
              {loading ? "Working..." : mode === "login" ? "Log in" : "Create account"}
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} className="mt-3 w-full py-3">
              {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
            </SecondaryButton>
          </form>
        </div>
      </div>
    </div>
  );
}
