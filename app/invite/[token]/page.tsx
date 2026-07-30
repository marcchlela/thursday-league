"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  Link2,
  ShieldCheck,
  Shirt,
  UsersRound
} from "lucide-react";
import { useOptionalLeagueContext } from "@/hooks/useLeagueContext";
import { friendlyActionError } from "@/lib/actionErrors";
import { withLoadTimeout } from "@/lib/loadProblems";
import {
  completeOnboarding,
  saveIntroductionSeen,
  savePostAuthPath
} from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import {
  LoadingState,
  PrimaryButton,
  SecondaryButton
} from "@/components/ui";
import leagueLogo from "../../../Thursday League logo (no bg).png";

type InvitePreview = {
  id: string;
  name: string;
  slug: string;
  member_count: number;
  fantasy_enabled: boolean;
  betting_enabled: boolean;
  already_member: boolean;
  expires_at: string;
};

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const leagueContext = useOptionalLeagueContext();
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setAuthenticatedUserId(data.session?.user.id || null);
    });
    const { data: authChange } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticatedUserId(session?.user.id || null);
    });
    return () => {
      active = false;
      authChange.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: previewError } = await withLoadTimeout(
          Promise.resolve(
            supabase.rpc("preview_league_invite_link", {
              submitted_token: params.token
            })
          )
        );
        if (!active) return;
        if (previewError) {
          setError(friendlyActionError(previewError, "This invitation is invalid or has expired."));
        } else {
          setPreview(data as InvitePreview);
        }
      } catch (previewError) {
        if (!active) return;
        setError(friendlyActionError(
          previewError,
          "The invitation check took too long. Check your connection and try again."
        ));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authenticatedUserId, params.token]);

  function beginAuth(mode: "login" | "signup") {
    savePostAuthPath(`/invite/${params.token}`);
    router.push(`/login?mode=${mode}`);
  }

  async function accept() {
    if (!preview || !authenticatedUserId || joining) return;
    if (preview.already_member) {
      router.push(`/l/${preview.slug}`);
      return;
    }

    const hadLeagueBeforeAccepting = Boolean(leagueContext?.leagues.length);
    setJoining(true);
    const { data, error: acceptError } = await supabase.rpc("accept_league_invite_link", {
      submitted_token: params.token
    });
    if (acceptError) {
      setJoining(false);
      setError(friendlyActionError(acceptError, "The invitation could not be accepted."));
      return;
    }

    saveIntroductionSeen();
    await Promise.allSettled([
      leagueContext?.reloadLeagues(),
      completeOnboarding(authenticatedUserId)
    ]);
    const result = data as { slug: string };
    router.replace(hadLeagueBeforeAccepting
      ? `/l/${result.slug}`
      : `/onboarding/finish?league=${encodeURIComponent(result.slug)}&joined=1`);
  }

  if (loading) {
    return (
      <main className="min-h-[100svh] bg-ink-900 px-4 py-[calc(2rem+env(safe-area-inset-top))] text-chalk">
        <div className="mx-auto max-w-xl"><LoadingState label="Checking invitation" cards={1} /></div>
      </main>
    );
  }

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-ink-900 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] text-chalk sm:px-6 sm:pt-5">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full border-[52px] border-league-gold/[.035]" />
      <div className="pointer-events-none absolute -bottom-48 -right-40 h-[34rem] w-[34rem] rounded-full border border-league-gold/[.075]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(218,165,32,.04),transparent_32%)]" />

      <div className="relative mx-auto max-w-2xl">
        <header className="flex items-center justify-center gap-2">
          <Image src={leagueLogo} alt="" priority className="h-12 w-12 scale-125 object-contain" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.2em] text-league-gold/65">Secure invitation</div>
            <div className="font-display text-2xl uppercase leading-none">Thursday League</div>
          </div>
        </header>

        <section className="onboarding-enter relative mt-7 overflow-hidden rounded-[1.6rem] border border-league-gold/35 bg-ink-850 shadow-[0_10px_28px_rgba(0,0,0,.18)]">
          <div className="relative border-b border-league-gold/15 px-5 pb-5 pt-7 text-center sm:px-8 sm:pt-9">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-league-gold/25 bg-league-gold/[.09] text-league-gold">
              <Link2 size={27} />
            </span>
            <div className="mt-4 text-[9px] font-black uppercase tracking-[.2em] text-league-gold">League invitation</div>
            <h1 className="mt-1 font-display text-4xl uppercase sm:text-5xl">You&apos;ve been invited</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-chalk/50">
              Check the league before you join. Nothing happens until you explicitly accept.
            </p>
          </div>

          <div className="relative p-5 sm:p-8">
            {error ? (
              <>
                <div role="alert" className="rounded-2xl border border-red-400/25 bg-red-400/[.07] p-4 text-sm leading-relaxed text-red-200">
                  {error}
                </div>
                <SecondaryButton
                  type="button"
                  className="mt-4 w-full"
                  onClick={() => router.replace(authenticatedUserId ? "/leagues" : "/welcome")}
                >
                  {authenticatedUserId ? "Go to my leagues" : "Go to Thursday League"}
                </SecondaryButton>
              </>
            ) : preview ? (
              <>
                <h2 className="text-center font-display text-4xl uppercase">{preview.name}</h2>
                <p className="mt-2 flex items-center justify-center gap-2 text-sm font-semibold text-chalk/55">
                  <UsersRound className="text-turf-400" size={17} />
                  {preview.member_count} active member{preview.member_count === 1 ? "" : "s"}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <InviteFeature
                    icon={Shirt}
                    title="Fantasy"
                    enabled={preview.fantasy_enabled}
                    description={preview.fantasy_enabled ? "Compete from the first valid lineup" : "Not enabled in this league"}
                  />
                  <InviteFeature
                    icon={Coins}
                    title="Virtual betting"
                    enabled={preview.betting_enabled}
                    description={preview.betting_enabled ? "Unlocks after enough completed games" : "Not enabled in this league"}
                  />
                </div>

                <div className="mt-6 rounded-2xl border border-league-gold/18 bg-turf-400/[.035] p-3 text-xs leading-relaxed text-chalk/58">
                  <span className="flex items-start gap-2">
                    <ShieldCheck size={17} className="mt-0.5 shrink-0 text-turf-400" />
                    Invitation links join immediately after acceptance. You can leave later from the league hub.
                  </span>
                </div>

                {authenticatedUserId ? (
                  <div className="mt-6 grid gap-2 sm:grid-cols-2">
                    <PrimaryButton
                      type="button"
                      disabled={joining}
                      onClick={() => void accept()}
                      className="inline-flex items-center justify-center gap-2 py-3"
                    >
                      {joining ? "Joining…" : preview.already_member ? "Open league" : "Accept invitation"}
                      {!joining ? <ArrowRight size={17} /> : null}
                    </PrimaryButton>
                    <SecondaryButton type="button" onClick={() => router.replace("/leagues")} className="py-3">
                      Not now
                    </SecondaryButton>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-2 sm:grid-cols-2">
                    <PrimaryButton type="button" onClick={() => beginAuth("signup")} className="py-3">
                      Create account to join
                    </PrimaryButton>
                    <SecondaryButton type="button" onClick={() => beginAuth("login")} className="py-3">
                      Sign in
                    </SecondaryButton>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function InviteFeature({
  icon: Icon,
  title,
  enabled,
  description
}: {
  icon: typeof Shirt;
  title: string;
  enabled: boolean;
  description: string;
}) {
  return (
    <div className={`flex min-h-20 items-center gap-3 rounded-2xl border p-3 ${enabled ? "border-league-gold/20 bg-turf-400/[.035]" : "border-league-gold/12 bg-black/10 opacity-60"}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${enabled ? "bg-turf-400/10 text-turf-400" : "bg-chalk/[.04] text-chalk/40"}`}>
        {enabled ? <Icon size={19} /> : <CheckCircle2 size={19} />}
      </span>
      <div>
        <div className="text-sm font-extrabold">{title}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-chalk/45">{description}</div>
      </div>
    </div>
  );
}
