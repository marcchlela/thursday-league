"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Link2,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy
} from "lucide-react";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { friendlyActionError } from "@/lib/actionErrors";
import { copyText } from "@/lib/clipboard";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Card,
  ConfirmDialog,
  PrimaryButton,
  SecondaryButton,
  TextInput,
  Toast
} from "@/components/ui";
import type { League } from "@/lib/types";

type CreatedLeague = {
  id: string;
  name: string;
  slug: string;
  join_code: string;
};

type LeaguePreview = {
  id: string;
  name: string;
  slug: string;
  member_count: number;
  fantasy_enabled: boolean;
  betting_enabled: boolean;
  already_member: boolean;
};

export default function LeaguesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    leagues,
    memberships,
    reloadLeagues,
    leaguePath
  } = useLeagueContext();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [leagueName, setLeagueName] = useState("");
  const [fantasyEnabled, setFantasyEnabled] = useState(true);
  const [bettingEnabled, setBettingEnabled] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [created, setCreated] = useState<CreatedLeague | null>(null);
  const [pendingLeagueIds, setPendingLeagueIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<League | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "warning" } | null>(null);

  useEffect(() => {
    void supabase
      .from("league_join_requests")
      .select("league_id")
      .eq("status", "pending")
      .then(({ data }) => setPendingLeagueIds((data || []).map(row => row.league_id)));
  }, []);

  async function createLeague(event: React.FormEvent) {
    event.preventDefault();
    if (busy || leagueName.trim().length < 2) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_league", {
      league_name: leagueName.trim(),
      enable_fantasy: fantasyEnabled,
      enable_betting: bettingEnabled
    });
    setBusy(false);
    if (error) {
      setToast({
        message: friendlyActionError(error, "The league could not be created. Please try again."),
        tone: "error"
      });
      return;
    }
    const result = data as CreatedLeague;
    setCreated(result);
    await reloadLeagues();
  }

  async function previewCode(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !joinCode.trim()) return;
    setBusy(true);
    setPreview(null);
    const { data, error } = await supabase.rpc("preview_league_by_code", {
      submitted_code: joinCode.trim().toUpperCase()
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
    const { error } = await supabase.rpc("request_to_join_league", {
      submitted_code: joinCode.trim().toUpperCase()
    });
    setBusy(false);
    if (error) {
      setToast({
        message: friendlyActionError(error, "Your request could not be sent."),
        tone: "error"
      });
      return;
    }
    setPendingLeagueIds(ids => [...new Set([...ids, preview.id])]);
    setPreview(null);
    setJoinCode("");
    setToast({
      message: `Request sent to ${preview.name}. A league admin needs to approve it.`,
      tone: "success"
    });
  }

  async function copyCode(code: string) {
    try {
      await copyText(code);
      setToast({ message: "League code copied.", tone: "success" });
    } catch (error) {
      setToast({ message: friendlyActionError(error, "The code could not be copied."), tone: "error" });
    }
  }

  async function leaveLeague() {
    if (!leaveTarget || busy) return;
    const target = leaveTarget;
    setBusy(true);
    const { error } = await supabase.rpc("leave_league", {
      target_league_id: target.id
    });
    setBusy(false);
    setLeaveTarget(null);
    if (error) {
      setToast({
        message: friendlyActionError(
          error,
          "The league could not be left. League owners must transfer ownership first."
        ),
        tone: "error"
      });
      return;
    }
    await reloadLeagues();
    setToast({ message: `You left ${target.name}. Historical results were kept.`, tone: "success" });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Toast
        message={toast?.message || null}
        tone={toast?.tone}
        onDone={() => setToast(null)}
      />
      <ConfirmDialog
        open={!!leaveTarget}
        title="Leave league?"
        text={leaveTarget ? `You will lose access to ${leaveTarget.name}. Your historical results remain. If you own this league, transfer ownership first.` : ""}
        confirmLabel={busy ? "Leaving..." : "Leave league"}
        confirmTone="destructive"
        onCancel={() => {
          if (!busy) setLeaveTarget(null);
        }}
        onConfirm={leaveLeague}
      />

      <header>
        <div className="text-[10px] font-black uppercase tracking-[.2em] text-league-gold/65">League hub</div>
        <h1 className="mt-1 font-display text-4xl uppercase sm:text-5xl">Your Leagues</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-chalk/48">
          Switch back into a league, create one for your group, or request access with a code.
        </p>
      </header>

      {searchParams.get("notice") === "unavailable" ? (
        <div role="status" className="rounded-xl border border-league-gold/25 bg-league-gold/[.07] p-3 text-sm text-chalk/70">
          That league is unavailable or you no longer have access to it.
        </div>
      ) : null}

      {leagues.length ? (
        <section>
          <h2 className="mb-3 text-xs font-black uppercase tracking-[.16em] text-chalk/45">Active leagues</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {leagues.map(league => {
              const role = memberships.find(item => item.league_id === league.id)?.role;
              return (
                <div key={league.id} className="rounded-[1.2rem] border border-league-gold/20 bg-ink-850 p-2 transition hover:border-league-gold/35">
                  <Link
                    href={`/l/${league.slug}`}
                    className="group flex min-h-20 items-center gap-3 rounded-[.9rem] p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-turf-400/10 text-turf-400">
                      <Trophy size={21} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-extrabold">{league.name}</span>
                      <span className="mt-1 block text-xs capitalize text-chalk/40">{role}</span>
                    </span>
                    <ArrowRight size={18} className="text-chalk/30 transition group-hover:translate-x-1 group-hover:text-league-gold" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setLeaveTarget(league)}
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-transparent text-xs font-bold text-chalk/35 transition hover:border-red-400/15 hover:bg-red-400/[.04] hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                  >
                    <LogOut size={14} /> Leave league
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="rounded-[1.2rem] border border-dashed border-league-gold/25 bg-chalk/[.025] p-6 text-center">
          <Sparkles className="mx-auto text-league-gold" size={24} />
          <h2 className="mt-3 font-display text-2xl uppercase">Start your first league</h2>
          <p className="mt-1 text-sm text-chalk/45">Create a league or join your friends with their code.</p>
        </div>
      )}

      {created ? (
        <Card className="border-turf-400/30 bg-turf-400/[.045]">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-turf-400 text-ink-900"><Check size={22} strokeWidth={3} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-3xl uppercase">{created.name} is ready</h2>
              <p className="mt-1 text-sm text-chalk/50">Share the code for an approval request, or use Invite a friend from the league switcher for immediate access.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <code className="rounded-xl border border-league-gold/25 bg-black/20 px-4 py-2 font-mono text-lg font-bold tracking-wider text-league-gold">{created.join_code}</code>
                <SecondaryButton type="button" onClick={() => void copyCode(created.join_code)} className="inline-flex items-center gap-2"><Copy size={16} /> Copy</SecondaryButton>
                <PrimaryButton type="button" onClick={() => router.push(`/l/${created.slug}`)}>Open league</PrimaryButton>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="grid grid-cols-2 rounded-xl border border-league-gold/18 bg-black/15 p-1">
            <button
              type="button"
              aria-pressed={mode === "create"}
              onClick={() => setMode("create")}
              className={cn("rounded-lg px-3 py-2.5 text-sm font-bold", mode === "create" ? "bg-league-gold/[.11] text-league-gold" : "text-chalk/45")}
            >
              <span className="inline-flex items-center gap-2"><Plus size={16} /> Create</span>
            </button>
            <button
              type="button"
              aria-pressed={mode === "join"}
              onClick={() => setMode("join")}
              className={cn("rounded-lg px-3 py-2.5 text-sm font-bold", mode === "join" ? "bg-league-gold/[.11] text-league-gold" : "text-chalk/45")}
            >
              <span className="inline-flex items-center gap-2"><Search size={16} /> Join with code</span>
            </button>
          </div>

          {mode === "create" ? (
            <form onSubmit={createLeague} className="mt-5 space-y-5">
              <div>
                <label htmlFor="league-name" className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/45">League name</label>
                <TextInput id="league-name" value={leagueName} onChange={event => setLeagueName(event.target.value)} placeholder="Sunday Five-a-Side" maxLength={60} />
              </div>
              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-wider text-chalk/45">Play modes</legend>
                <p className="mt-1 text-xs text-chalk/35">Both are enabled by default and can be changed later.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <FeatureToggle
                    checked={fantasyEnabled}
                    onChange={setFantasyEnabled}
                    title="Fantasy"
                    detail="Available from the league's first game."
                    icon={Trophy}
                  />
                  <FeatureToggle
                    checked={bettingEnabled}
                    onChange={setBettingEnabled}
                    title="Virtual betting"
                    detail="Unlocks automatically after enough completed games."
                    icon={ShieldCheck}
                  />
                </div>
              </fieldset>
              <PrimaryButton disabled={busy || leagueName.trim().length < 2} className="w-full sm:w-auto">
                {busy ? "Creating…" : "Create league"}
              </PrimaryButton>
            </form>
          ) : (
            <form onSubmit={previewCode} className="mt-5">
              <label htmlFor="join-code" className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/45">League code</label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <TextInput
                  id="join-code"
                  value={joinCode}
                  onChange={event => {
                    setJoinCode(event.target.value.toUpperCase());
                    setPreview(null);
                  }}
                  placeholder="TL-XXXX-XXXX"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
                <PrimaryButton disabled={busy || !joinCode.trim()}>{busy ? "Checking…" : "Find league"}</PrimaryButton>
              </div>
              <p className="mt-2 text-xs text-chalk/35">Code requests require admin approval. Invite links join immediately after you accept.</p>
            </form>
          )}
        </Card>
      )}

      {preview ? (
        <Card className="border-league-gold/35">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-league-gold/[.1] text-league-gold"><Link2 size={20} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-black uppercase tracking-[.17em] text-league-gold/60">League found</div>
              <h2 className="mt-1 font-display text-3xl uppercase">{preview.name}</h2>
              <p className="mt-1 text-sm text-chalk/48">{preview.member_count} active member{preview.member_count === 1 ? "" : "s"} · {[preview.fantasy_enabled && "Fantasy", preview.betting_enabled && "Bets"].filter(Boolean).join(" + ") || "Match tracking"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <PrimaryButton type="button" disabled={busy || pendingLeagueIds.includes(preview.id)} onClick={() => void requestAccess()}>
                  {preview.already_member
                    ? "Open league"
                    : pendingLeagueIds.includes(preview.id)
                      ? "Approval pending"
                      : "Request to join"}
                </PrimaryButton>
                <SecondaryButton type="button" onClick={() => setPreview(null)}>Cancel</SecondaryButton>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {leagues.length ? (
        <div className="text-center">
          <Link href={leaguePath("/")} className="text-xs font-bold text-chalk/40 hover:text-league-gold">Back to current league</Link>
        </div>
      ) : null}
    </div>
  );
}

function FeatureToggle({
  checked,
  onChange,
  title,
  detail,
  icon: Icon
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  detail: string;
  icon: typeof Trophy;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-24 items-start gap-3 rounded-[1rem] border p-3.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold",
        checked
          ? "border-turf-400/35 bg-turf-400/[.06]"
          : "border-league-gold/15 bg-black/10 opacity-65"
      )}
    >
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", checked ? "bg-turf-400/12 text-turf-400" : "bg-chalk/[.04] text-chalk/35")}><Icon size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 font-extrabold"><span>{title}</span><span className={cn("h-5 w-9 rounded-full p-0.5", checked ? "bg-turf-400" : "bg-chalk/10")}><span className={cn("block h-4 w-4 rounded-full bg-white transition", checked && "translate-x-4")} /></span></span>
        <span className="mt-1 block text-xs leading-relaxed text-chalk/42">{detail}</span>
      </span>
    </button>
  );
}
