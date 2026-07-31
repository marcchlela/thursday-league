"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  Coins,
  Link2,
  Search,
  ShieldCheck,
  Shirt,
  Sparkles,
  Trophy,
  UsersRound
} from "lucide-react";
import { OnboardingShell } from "@/components/OnboardingShell";
import {
  PrimaryButton,
  SecondaryButton,
  TextInput,
  Toast
} from "@/components/ui";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { friendlyActionError } from "@/lib/actionErrors";
import {
  formatLeagueCode,
  leagueCodeIsComplete,
  normalizeLeagueCode
} from "@/lib/leagueCodes";
import {
  completeOnboarding,
  saveIntroductionProgress
} from "@/lib/onboarding";
import {
  OPEN_NOTIFICATION_ONBOARDING_EVENT,
  pushAccessToken,
  pushResponseError
} from "@/lib/pushClient";
import { supabase } from "@/lib/supabase";
import type { MyLeagueJoinRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

type LeaguePreview = {
  id: string;
  name: string;
  slug: string;
  member_count: number;
  fantasy_enabled: boolean;
  betting_enabled: boolean;
  already_member: boolean;
};

export default function LeagueOnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    userId,
    leagues,
    league,
    loading: leaguesLoading,
    reloadLeagues
  } = useLeagueContext();
  const initialLeagueCount = useRef(leagues.length);
  const [joinCode, setJoinCode] = useState("");
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [requests, setRequests] = useState<MyLeagueJoinRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "warning" } | null>(null);

  const loadRequests = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_league_join_requests");
    if (error) {
      setToast({
        message: friendlyActionError(error, "Your league requests could not be loaded. Try again."),
        tone: "error"
      });
    } else {
      setRequests((data || []) as MyLeagueJoinRequest[]);
    }
    setLoadingRequests(false);
  }, []);

  useEffect(() => {
    if (searchParams.get("from") !== "welcome") return;
    void saveIntroductionProgress(userId).catch(() => {
      // The real league state still resumes the user correctly. This sync will
      // be retried when onboarding is completed.
    });
  }, [searchParams, userId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (leaguesLoading || !leagues.length || !league) return;
    void completeOnboarding(userId);
    if (initialLeagueCount.current === 0) {
      router.replace(`/onboarding/finish?league=${encodeURIComponent(league.slug)}&joined=1`);
    } else {
      router.replace(`/l/${league.slug}`);
    }
  }, [league, leagues.length, leaguesLoading, router, userId]);

  useEffect(() => {
    if (!requests.some(request => request.status === "pending")) return;
    const refresh = () => {
      void Promise.all([loadRequests(), reloadLeagues()]);
    };
    const interval = window.setInterval(refresh, 8_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [loadRequests, reloadLeagues, requests]);

  async function previewCode(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !leagueCodeIsComplete(joinCode)) return;
    setBusy(true);
    setPreview(null);
    const { data, error } = await supabase.rpc("preview_league_by_code", {
      submitted_code: normalizeLeagueCode(joinCode)
    });
    setBusy(false);
    if (error) {
      setToast({
        message: friendlyActionError(error, "That league code could not be found."),
        tone: "error"
      });
      return;
    }
    setPreview(data as LeaguePreview);
  }

  async function requestAccess() {
    if (!preview || busy) return;
    if (preview.already_member) {
      router.push(`/l/${preview.slug}`);
      return;
    }

    setBusy(true);
    try {
      const token = await pushAccessToken();
      const response = await fetch("/api/leagues/membership", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: "request",
          code: normalizeLeagueCode(joinCode)
        })
      });
      if (!response.ok) throw new Error(await pushResponseError(response));
      await loadRequests();
      setPreview(null);
      setJoinCode("");
      setToast({
        message: `Request sent to ${preview.name}. We will keep this page updated.`,
        tone: "success"
      });
    } catch (requestError) {
      setToast({
        message: friendlyActionError(requestError, "Your request could not be sent."),
        tone: "error"
      });
    } finally {
      setBusy(false);
    }
  }

  function openNotificationSetup() {
    window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATION_ONBOARDING_EVENT, {
      detail: { step: 0 }
    }));
  }

  const pendingRequests = requests.filter(request => request.status === "pending");
  const rejectedRequests = requests.filter(request => request.status === "rejected");

  return (
    <OnboardingShell
      step={2}
      eyebrow="Choose your league"
      title="Where do you play?"
      description="Join with a league code or create a new home for your football group."
    >
      <Toast
        message={toast?.message || null}
        tone={toast?.tone}
        onDone={() => setToast(null)}
        duration={4500}
      />

      {pendingRequests.length ? (
        <section className="mb-5 rounded-[1.45rem] border border-league-gold/25 bg-perimeter-400/[.035] p-4 shadow-[0_9px_24px_rgba(0,0,0,.14)] sm:p-5" aria-labelledby="pending-requests-title">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-perimeter-400/10 text-perimeter-400">
              <Clock3 size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-black uppercase tracking-[.18em] text-perimeter-400">Approval pending</div>
              <h2 id="pending-requests-title" className="mt-1 font-display text-2xl uppercase sm:text-3xl">
                Your request is with the league
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-chalk/52 sm:text-sm">We will update this page when an admin responds.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {pendingRequests.map(request => (
              <div key={request.id} className="flex items-center gap-3 rounded-2xl border border-league-gold/18 bg-black/15 p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-chalk/[.04] text-chalk/60">
                  <Trophy size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold">{request.league_name}</div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[.12em] text-chalk/40">Waiting for an owner or admin</div>
                </div>
                <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-perimeter-400 motion-reduce:animate-none" />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={openNotificationSetup}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-league-gold/25 bg-league-gold/[.055] px-3 text-xs font-bold text-league-gold transition hover:bg-league-gold/[.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"
          >
            <BellRing size={16} /> Notify me when I am approved
          </button>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.12fr_.88fr]">
        <section className="rounded-[1.45rem] border border-league-gold/30 bg-ink-850 p-4 shadow-[0_9px_24px_rgba(0,0,0,.16)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold">Have a code?</div>
              <h2 className="mt-1 font-display text-3xl uppercase">Join a league</h2>
              <p className="mt-1 text-sm leading-relaxed text-chalk/50">Find the right league first, then request access from its admins.</p>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-league-gold/10 text-league-gold">
              <Search size={20} />
            </span>
          </div>

          <form onSubmit={previewCode} className="mt-5">
            <label htmlFor="onboarding-league-code" className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/48">
              League code
            </label>
            <TextInput
              id="onboarding-league-code"
              value={joinCode}
              onChange={event => {
                setJoinCode(formatLeagueCode(event.target.value));
                setPreview(null);
              }}
              placeholder="TL-XXXX-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
              className="font-mono text-base font-bold uppercase tracking-[.1em]"
            />
            <PrimaryButton
              disabled={busy || !leagueCodeIsComplete(joinCode)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 py-3"
            >
              {busy ? "Checking…" : "Find league"} <ArrowRight size={17} />
            </PrimaryButton>
            <p className="mt-3 text-xs leading-relaxed text-chalk/42">
              Joining with a code requires approval. Invitation links let you join immediately after you accept.
            </p>
          </form>
        </section>

        <Link
          href="/onboarding/create"
          className="group relative min-h-64 overflow-hidden rounded-[1.45rem] border border-league-gold/25 bg-ink-850 p-5 shadow-[0_9px_24px_rgba(0,0,0,.15)] transition hover:border-league-gold/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold sm:p-6"
        >
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border-[32px] border-league-gold/[.025]" />
          <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-turf-400/10 text-turf-400">
            <Sparkles size={22} />
          </span>
          <div className="relative mt-7 text-[9px] font-black uppercase tracking-[.18em] text-turf-400">Start from scratch</div>
          <h2 className="relative mt-1 font-display text-3xl uppercase">Create a league</h2>
          <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-chalk/50">
            Name your league, choose how your group competes and become its owner.
          </p>
          <span className="relative mt-6 inline-flex items-center gap-2 text-sm font-extrabold text-turf-400">
            Build your league <ArrowRight size={17} className="transition group-hover:translate-x-1" />
          </span>
        </Link>
      </div>

      {preview ? (
        <LeaguePreviewCard
          preview={preview}
          busy={busy}
          pending={pendingRequests.some(request => request.league_id === preview.id)}
          onRequest={requestAccess}
          onCancel={() => setPreview(null)}
        />
      ) : null}

      {!loadingRequests && rejectedRequests.length ? (
        <div className="mt-4 rounded-2xl border border-league-gold/15 bg-league-gold/[.025] p-3 text-xs leading-relaxed text-chalk/50" role="status">
          A previous request was not approved. You can check the code with your league admin and submit a new request.
        </div>
      ) : null}
    </OnboardingShell>
  );
}

function LeaguePreviewCard({
  preview,
  busy,
  pending,
  onRequest,
  onCancel
}: {
  preview: LeaguePreview;
  busy: boolean;
  pending: boolean;
  onRequest: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="onboarding-enter relative mt-5 overflow-hidden rounded-[1.55rem] border border-league-gold/35 bg-ink-850 shadow-[0_10px_28px_rgba(0,0,0,.18)]" aria-labelledby="league-preview-title">
      <div className="relative p-5 text-center sm:p-7">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-league-gold/25 bg-league-gold/[.09] text-league-gold">
          <Link2 size={24} />
        </span>
        <div className="mt-4 text-[9px] font-black uppercase tracking-[.2em] text-league-gold">League found</div>
        <h2 id="league-preview-title" className="mt-1 font-display text-4xl uppercase sm:text-5xl">{preview.name}</h2>
        <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-chalk/55">
          <UsersRound size={16} className="text-turf-400" />
          {preview.member_count} active member{preview.member_count === 1 ? "" : "s"}
        </p>

        <div className="mx-auto mt-5 grid max-w-xl gap-2 sm:grid-cols-2">
          <PreviewFeature
            enabled={preview.fantasy_enabled}
            icon={Shirt}
            title="Fantasy"
            text={preview.fantasy_enabled ? "Available from the first valid lineup" : "Not enabled in this league"}
          />
          <PreviewFeature
            enabled={preview.betting_enabled}
            icon={Coins}
            title="Virtual betting"
            text={preview.betting_enabled ? "Unlocks after enough completed games" : "Not enabled in this league"}
          />
        </div>

        <div className="mx-auto mt-6 grid max-w-md gap-2 sm:grid-cols-2">
          <PrimaryButton
            type="button"
            disabled={busy || pending}
            onClick={onRequest}
            className="inline-flex items-center justify-center gap-2 py-3"
          >
            {preview.already_member
              ? "Open league"
              : pending
                ? "Approval pending"
                : busy
                  ? "Sending…"
                  : "Request to join"}
            {!pending ? <ShieldCheck size={17} /> : null}
          </PrimaryButton>
          <SecondaryButton type="button" onClick={onCancel} className="py-3">Not this league</SecondaryButton>
        </div>
      </div>
    </section>
  );
}

function PreviewFeature({
  enabled,
  icon: Icon,
  title,
  text
}: {
  enabled: boolean;
  icon: typeof Shirt;
  title: string;
  text: string;
}) {
  return (
    <div className={cn(
      "flex min-h-20 items-center gap-3 rounded-2xl border p-3 text-left",
      enabled
        ? "border-league-gold/20 bg-turf-400/[.035]"
        : "border-league-gold/12 bg-black/10 opacity-60"
    )}>
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", enabled ? "bg-turf-400/10 text-turf-400" : "bg-chalk/[.04] text-chalk/40")}>
        {enabled ? <Icon size={19} /> : <CheckCircle2 size={19} />}
      </span>
      <div>
        <div className="text-sm font-extrabold">{title}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-chalk/45">{text}</div>
      </div>
    </div>
  );
}
