"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Coins,
  ShieldCheck,
  Shirt,
  Sparkles,
  Trophy
} from "lucide-react";
import { OnboardingShell } from "@/components/OnboardingShell";
import {
  PrimaryButton,
  TextInput,
  Toast
} from "@/components/ui";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { friendlyActionError } from "@/lib/actionErrors";
import { completeOnboarding } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type CreatedLeague = {
  id: string;
  name: string;
  slug: string;
  join_code: string;
};

export default function CreateLeagueOnboardingPage() {
  const router = useRouter();
  const {
    userId,
    reloadLeagues
  } = useLeagueContext();
  const [leagueName, setLeagueName] = useState("");
  const [fantasyEnabled, setFantasyEnabled] = useState(true);
  const [bettingEnabled, setBettingEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "error" | "warning" } | null>(null);

  async function createLeague(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = leagueName.trim();
    if (busy || cleanName.length < 2) return;

    setBusy(true);
    const { data, error } = await supabase.rpc("create_league", {
      league_name: cleanName,
      enable_fantasy: fantasyEnabled,
      enable_betting: bettingEnabled,
      owner_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    });
    if (error) {
      setBusy(false);
      setToast({
        message: friendlyActionError(error, "The league could not be created. Please try again."),
        tone: "error"
      });
      return;
    }

    const created = data as CreatedLeague;
    await Promise.allSettled([
      reloadLeagues(),
      completeOnboarding(userId)
    ]);
    router.replace(`/onboarding/finish?league=${encodeURIComponent(created.slug)}&created=1`);
  }

  return (
    <OnboardingShell
      step={2}
      eyebrow="Create your league"
      title="Build your football home"
      description="Name your league and choose how your group competes. You can change the play modes later."
      backHref="/onboarding/league"
      backLabel="Back to choices"
    >
      <Toast
        message={toast?.message || null}
        tone={toast?.tone}
        onDone={() => setToast(null)}
      />

      <form
        onSubmit={createLeague}
        className="mx-auto max-w-3xl overflow-hidden rounded-[1.55rem] border border-league-gold/30 bg-ink-850 shadow-[0_10px_26px_rgba(0,0,0,.18)]"
      >
        <div className="border-b border-league-gold/20 bg-league-gold/[.025] p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.2em] text-league-gold">League identity</div>
              <h2 className="mt-1 font-display text-3xl uppercase sm:text-4xl">Give it a name</h2>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-league-gold/10 text-league-gold">
              <Trophy size={22} />
            </span>
          </div>
          <label htmlFor="new-league-name" className="mt-5 block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/48">League name</span>
            <TextInput
              id="new-league-name"
              value={leagueName}
              onChange={event => setLeagueName(event.target.value)}
              placeholder="Thursday Night Football"
              maxLength={60}
              autoComplete="off"
              autoFocus
              className="py-3.5 text-base font-semibold"
            />
            <span className="mt-2 block text-right text-[10px] font-semibold text-chalk/35">{leagueName.length}/60</span>
          </label>
        </div>

        <fieldset className="p-5 sm:p-7">
          <legend className="sr-only">Choose league play modes</legend>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-turf-400/10 text-turf-400">
              <Sparkles size={19} />
            </span>
            <div>
              <h2 className="font-display text-2xl uppercase sm:text-3xl">Choose how you compete</h2>
              <p className="mt-1 text-xs leading-relaxed text-chalk/48 sm:text-sm">Match tracking and player stats are always included.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <PlayModeToggle
              checked={fantasyEnabled}
              onChange={setFantasyEnabled}
              icon={Shirt}
              title="Fantasy"
              eyebrow="From game one"
              detail="Pick five players and score from their real match performances."
            />
            <PlayModeToggle
              checked={bettingEnabled}
              onChange={setBettingEnabled}
              icon={Coins}
              title="Virtual betting"
              eyebrow="Unlocks after 3 games"
              detail="Predict matches with virtual coins once the league has enough results."
            />
          </div>

          {!fantasyEnabled && !bettingEnabled ? (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-league-gold/20 bg-league-gold/[.055] p-3 text-xs leading-relaxed text-chalk/60">
              <ShieldCheck size={17} className="mt-0.5 shrink-0 text-league-gold" />
              Your league will focus on matches, lineups, results and player statistics. You can enable Fantasy or betting later.
            </div>
          ) : null}

          <PrimaryButton
            disabled={busy || leagueName.trim().length < 2}
            className="mt-6 w-full py-3.5 text-base"
          >
            {busy ? "Creating your league…" : "Create league"}
          </PrimaryButton>
        </fieldset>
      </form>
    </OnboardingShell>
  );
}

function PlayModeToggle({
  checked,
  onChange,
  icon: Icon,
  title,
  eyebrow,
  detail
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: typeof Shirt;
  title: string;
  eyebrow: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative min-h-44 overflow-hidden rounded-[1.25rem] border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold",
        checked
          ? "border-league-gold/30 bg-turf-400/[.045]"
          : "border-league-gold/15 bg-black/10 opacity-65"
      )}
    >
      <div className={cn("absolute -right-8 -top-8 h-24 w-24 rounded-full", checked ? "bg-turf-400/[.08]" : "bg-chalk/[.03]")} />
      <div className="relative flex items-start justify-between gap-3">
        <span className={cn("grid h-11 w-11 place-items-center rounded-2xl", checked ? "bg-turf-400/10 text-turf-400" : "bg-chalk/[.05] text-chalk/40")}>
          <Icon size={21} />
        </span>
        <span className={cn("h-6 w-11 rounded-full p-1 transition", checked ? "bg-turf-400" : "bg-chalk/12")}>
          <span className={cn("block h-4 w-4 rounded-full bg-white shadow transition", checked && "translate-x-5")} />
        </span>
      </div>
      <div className={cn("relative mt-4 text-[9px] font-black uppercase tracking-[.17em]", checked ? "text-turf-400" : "text-chalk/38")}>{eyebrow}</div>
      <div className="relative mt-1 text-lg font-extrabold">{title}</div>
      <div className="relative mt-1 text-xs leading-relaxed text-chalk/48">{detail}</div>
    </button>
  );
}
