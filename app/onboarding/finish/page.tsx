"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  Copy,
  Link2,
  ShieldCheck,
  Sparkles,
  UsersRound
} from "lucide-react";
import { OnboardingShell } from "@/components/OnboardingShell";
import {
  ErrorState,
  PrimaryButton,
  SecondaryButton,
  Toast
} from "@/components/ui";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { friendlyActionError } from "@/lib/actionErrors";
import { copyText } from "@/lib/clipboard";
import { completeOnboarding } from "@/lib/onboarding";
import {
  OPEN_NOTIFICATION_ONBOARDING_EVENT,
  PUSH_STATE_EVENT,
  readPushDeviceState,
  saveNotificationOnboardingStatus
} from "@/lib/pushClient";
import { supabase } from "@/lib/supabase";

type Invitation = {
  token?: string;
  expires_at?: string;
};

export default function FinishOnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    userId,
    leagues,
    memberships
  } = useLeagueContext();
  const requestedSlug = searchParams.get("league");
  const created = searchParams.get("created") === "1";
  const joined = searchParams.get("joined") === "1";
  const targetLeague = leagues.find(item => item.slug === requestedSlug) || null;
  const membership = memberships.find(item => item.league_id === targetLeague?.id);
  const isOwner = membership?.role === "owner";
  const invitationStarted = useRef(false);
  const copyFeedbackTimer = useRef<number | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [copied, setCopied] = useState<"code" | "invite" | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const refreshDevice = useCallback(async () => {
    try {
      const device = await readPushDeviceState();
      setNotificationsEnabled(device.enabled);
    } catch {
      setNotificationsEnabled(false);
    }
  }, []);

  const generateInvite = useCallback(async () => {
    if (!targetLeague || inviteBusy) return;
    setInviteBusy(true);
    setInviteError(null);
    const { data, error } = await supabase.rpc("create_league_invite_link", {
      target_league_id: targetLeague.id,
      valid_hours: 72
    });
    setInviteBusy(false);
    if (error) {
      setInviteError(friendlyActionError(error, "An invitation link could not be prepared."));
      return;
    }
    const invitation = data as Invitation;
    if (!invitation.token) {
      setInviteError("An invitation link could not be prepared.");
      return;
    }
    setInviteUrl(`${window.location.origin}/invite/${invitation.token}`);
  }, [inviteBusy, targetLeague]);

  useEffect(() => {
    if (!targetLeague) return;
    void completeOnboarding(userId);
  }, [targetLeague, userId]);

  useEffect(() => {
    void refreshDevice();
    window.addEventListener(PUSH_STATE_EVENT, refreshDevice);
    window.addEventListener("focus", refreshDevice);
    return () => {
      window.removeEventListener(PUSH_STATE_EVENT, refreshDevice);
      window.removeEventListener("focus", refreshDevice);
    };
  }, [refreshDevice]);

  useEffect(() => {
    if (!created || !isOwner || !targetLeague || invitationStarted.current) return;
    invitationStarted.current = true;
    void generateInvite();
  }, [created, generateInvite, isOwner, targetLeague]);

  useEffect(() => () => {
    if (copyFeedbackTimer.current) window.clearTimeout(copyFeedbackTimer.current);
  }, []);

  async function copyValue(value: string, label: string, target: "code" | "invite") {
    try {
      await copyText(value);
      setCopied(target);
      if (copyFeedbackTimer.current) window.clearTimeout(copyFeedbackTimer.current);
      copyFeedbackTimer.current = window.setTimeout(() => setCopied(null), 2500);
      setToast({ message: `${label} copied.`, tone: "success" });
    } catch (copyError) {
      setToast({
        message: friendlyActionError(copyError, `The ${label.toLowerCase()} could not be copied.`),
        tone: "error"
      });
    }
  }

  function openNotificationSetup() {
    window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATION_ONBOARDING_EVENT, {
      detail: { step: 0 }
    }));
  }

  function continueTo(destination: string) {
    if (!notificationsEnabled) {
      saveNotificationOnboardingStatus(userId, "dismissed");
    }
    router.replace(destination);
  }

  if (!requestedSlug || !targetLeague || !membership) {
    return (
      <OnboardingShell
        step={3}
        eyebrow="Almost ready"
        title="Your league is unavailable"
        description="We could not finish opening that league."
      >
        <div className="mx-auto max-w-xl">
          <ErrorState
            title="League could not be opened"
            message="Return to league setup and try again."
            onRetry={() => router.replace("/onboarding/league")}
          />
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      step={3}
      eyebrow="You are ready"
      title={created ? "Your league is live" : joined ? "Welcome to the league" : "Setup complete"}
      description={created
        ? "Invite your group or start building the roster."
        : `You are now part of ${targetLeague.name}.`}
    >
      <Toast
        message={toast?.message || null}
        tone={toast?.tone}
        onDone={() => setToast(null)}
      />

      <section className="relative overflow-hidden rounded-[1.55rem] border border-league-gold/30 bg-ink-850 shadow-[0_10px_28px_rgba(0,0,0,.18)]">
        <div className="relative p-5 text-center sm:p-8">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-league-gold/25 bg-turf-400/[.08] text-turf-400">
            <Check size={29} strokeWidth={3} />
          </span>
          <div className="mt-4 text-[9px] font-black uppercase tracking-[.2em] text-turf-400">
            {isOwner ? "League owner" : "League member"}
          </div>
          <h2 className="mt-1 font-display text-4xl uppercase sm:text-5xl">{targetLeague.name}</h2>
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-chalk/52">
            {isOwner ? <ShieldCheck size={16} className="text-league-gold" /> : <UsersRound size={16} className="text-turf-400" />}
            {isOwner ? "You control the roster and match setup" : "Your league is now available from the switcher"}
          </p>

          {created && isOwner ? (
            <div className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
              <ShareCard
                eyebrow="Approval code"
                value={targetLeague.join_code}
                description="Anyone with this code can request to join."
                actionLabel={copied === "code" ? "Code copied" : "Copy code"}
                onAction={() => void copyValue(targetLeague.join_code, "League code", "code")}
                icon={copied === "code" ? Check : Copy}
                mono
              />
              <ShareCard
                eyebrow="Direct invitation"
                value={inviteBusy ? "Preparing secure link…" : inviteUrl ? "One-time invite ready" : "Invite unavailable"}
                description="The recipient joins after accepting. This link works once for 72 hours."
                actionLabel={copied === "invite" ? "Link copied" : inviteUrl ? "Copy invite link" : "Try again"}
                onAction={() => inviteUrl
                  ? void copyValue(inviteUrl, "Invitation link", "invite")
                  : void generateInvite()}
                icon={copied === "invite" ? Check : Link2}
                disabled={inviteBusy}
              />
            </div>
          ) : null}

          {inviteError ? (
            <p className="mx-auto mt-3 max-w-xl text-xs text-red-200" role="alert">{inviteError}</p>
          ) : null}
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-[1.4rem] border border-league-gold/25 bg-perimeter-400/[.035] p-5 shadow-[0_9px_24px_rgba(0,0,0,.14)]">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-perimeter-400/10 text-perimeter-400">
            {notificationsEnabled ? <CheckCircle2 size={21} /> : <BellRing size={21} />}
          </span>
          <div className="mt-4 text-[9px] font-black uppercase tracking-[.18em] text-perimeter-400">Stay matchday ready</div>
          <h2 className="mt-1 font-display text-2xl uppercase">
            {notificationsEnabled ? "Notifications are ready" : "Set up this device"}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-chalk/50">
            {notificationsEnabled
              ? "This device can receive the league updates you choose."
              : "Get game, lineup, deadline and result reminders. You can enable them later from the top bar."}
          </p>
          {!notificationsEnabled ? (
            <button
              type="button"
              onClick={openNotificationSetup}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-league-gold/25 bg-league-gold/[.055] px-3 text-xs font-bold text-league-gold transition hover:bg-league-gold/[.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"
            >
              <BellRing size={16} /> Set up notifications
            </button>
          ) : null}
        </div>

        <div className="relative overflow-hidden rounded-[1.4rem] border border-league-gold/25 bg-ink-850 p-5 shadow-[0_9px_24px_rgba(0,0,0,.14)]">
          <Sparkles className="absolute right-5 top-5 text-league-gold/35" size={26} />
          <div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold">Next useful step</div>
          <h2 className="mt-1 font-display text-3xl uppercase">
            {isOwner ? "Build your player roster" : "Open your league home"}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-chalk/50">
            {isOwner
              ? "Add the players in your group first. After that, scheduling the opening match and saving lineups will be quick."
              : "See upcoming matches, player statistics and the competitions enabled by your league."}
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <PrimaryButton
              type="button"
              onClick={() => continueTo(isOwner
                ? `/l/${targetLeague.slug}/admin?section=roster`
                : `/l/${targetLeague.slug}`)}
              className="inline-flex items-center justify-center gap-2 py-3"
            >
              {isOwner ? "Set up players" : "Open league"} <ArrowRight size={17} />
            </PrimaryButton>
            {isOwner ? (
              <SecondaryButton
                type="button"
                onClick={() => continueTo(`/l/${targetLeague.slug}`)}
                className="py-3"
              >
                Go to league home
              </SecondaryButton>
            ) : null}
          </div>
        </div>
      </section>
    </OnboardingShell>
  );
}

function ShareCard({
  eyebrow,
  value,
  description,
  actionLabel,
  onAction,
  icon: Icon,
  mono = false,
  disabled = false
}: {
  eyebrow: string;
  value: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  icon: typeof Copy;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-[1.2rem] border border-league-gold/18 bg-black/15 p-4 text-left">
      <div className="text-[9px] font-black uppercase tracking-[.17em] text-league-gold/65">{eyebrow}</div>
      <div className={`mt-1 truncate text-base font-bold text-chalk ${mono ? "font-mono tracking-[.08em] text-league-gold" : ""}`}>{value}</div>
      <p className="mt-2 min-h-9 text-[11px] leading-relaxed text-chalk/45">{description}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={onAction}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-league-gold/20 bg-league-gold/[.06] px-3 text-xs font-bold text-league-gold transition hover:bg-league-gold/[.11] focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold disabled:opacity-50"
      >
        <Icon size={15} /> {actionLabel}
      </button>
    </div>
  );
}
