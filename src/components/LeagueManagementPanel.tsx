"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Check,
  Copy,
  Crown,
  Link2,
  RefreshCw,
  Shield,
  ShieldOff,
  UserMinus,
  UsersRound
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { friendlyActionError } from "@/lib/actionErrors";
import { copyText } from "@/lib/clipboard";
import { pushAccessToken, pushResponseError } from "@/lib/pushClient";
import { supabase } from "@/lib/supabase";
import type {
  Game,
  LeagueJoinRequest,
  LeagueMembership,
  Profile
} from "@/lib/types";
import {
  Card,
  ConfirmDialog,
  PrimaryButton,
  SecondaryButton,
  TextInput,
  Toast
} from "./ui";

type ReadinessRow = {
  user_id: string;
  username: string;
  fantasy_ready: boolean;
  betting_ready: boolean;
};

const BETTING_UNLOCK_GAMES = 3;

export function LeagueManagementPanel({ games }: { games: Game[] }) {
  const router = useRouter();
  const {
    league,
    membership: ownMembership,
    isLeagueOwner,
    reloadLeagues
  } = useLeagueContext();
  const [memberships, setMemberships] = useState<LeagueMembership[]>([]);
  const [requests, setRequests] = useState<LeagueJoinRequest[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [readiness, setReadiness] = useState<ReadinessRow[]>([]);
  const [name, setName] = useState(league?.name || "");
  const [fantasyEnabled, setFantasyEnabled] = useState(league?.fantasy_enabled ?? true);
  const [bettingEnabled, setBettingEnabled] = useState(league?.betting_enabled ?? true);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    text: string;
    confirmLabel: string;
    confirmTone?: "destructive" | "primary";
    action: () => Promise<void>;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "warning" } | null>(null);

  const nextGame = useMemo(() => [...games]
    .filter(game => game.status !== "final")
    .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())[0], [games]);
  const completedGames = games.filter(game => game.status === "final").length;
  const remainingUnlockGames = Math.max(BETTING_UNLOCK_GAMES - completedGames, 0);

  const load = useCallback(async () => {
    if (!league) return;
    const [membershipResult, requestResult, profileResult] = await Promise.all([
      supabase
        .from("league_memberships")
        .select("*")
        .eq("league_id", league.id)
        .eq("status", "active")
        .order("joined_at"),
      supabase
        .from("league_join_requests")
        .select("*")
        .eq("league_id", league.id)
        .eq("status", "pending")
        .order("created_at"),
      supabase.rpc("get_league_member_directory", {
        target_league_id: league.id
      })
    ]);
    if (membershipResult.error || requestResult.error || profileResult.error) {
      setToast({
        message: friendlyActionError(
          membershipResult.error || requestResult.error || profileResult.error,
          "League members could not be loaded."
        ),
        tone: "error"
      });
      return;
    }
    const membershipRows = (membershipResult.data || []) as LeagueMembership[];
    const requestRows = (requestResult.data || []) as LeagueJoinRequest[];
    setMemberships(membershipRows);
    setRequests(requestRows);
    setProfiles((profileResult.data || []).map((profile: { id: string; username: string; avatar_path: string | null }) => ({
      ...profile,
      is_admin: false
    })) as Profile[]);
    if (nextGame) {
      const readinessResult = await supabase.rpc("get_league_readiness", {
        target_league_id: league.id,
        target_game_id: nextGame.id
      });
      if (!readinessResult.error) setReadiness((readinessResult.data || []) as ReadinessRow[]);
    } else {
      setReadiness([]);
    }
  }, [league, nextGame]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setName(league?.name || "");
    setFantasyEnabled(league?.fantasy_enabled ?? true);
    setBettingEnabled(league?.betting_enabled ?? true);
  }, [league]);

  function profileName(userId: string) {
    return profiles.find(profile => profile.id === userId)?.username || "League member";
  }

  async function saveOptions() {
    if (!league || busy) return;
    setBusy("options");
    const { error } = await supabase.rpc("update_league_options", {
      target_league_id: league.id,
      league_name: name.trim(),
      enable_fantasy: fantasyEnabled,
      enable_betting: bettingEnabled,
      unlock_betting_after_games: BETTING_UNLOCK_GAMES
    });
    setBusy(null);
    if (error) {
      setToast({ message: friendlyActionError(error, "League options could not be saved."), tone: "error" });
      return;
    }
    await reloadLeagues();
    setToast({ message: "League options saved.", tone: "success" });
  }

  async function copy(value: string, message: string) {
    try {
      await copyText(value);
      setToast({ message, tone: "success" });
    } catch (error) {
      setToast({ message: friendlyActionError(error, "The value could not be copied."), tone: "error" });
    }
  }

  async function rotateCode() {
    if (!league || busy) return;
    setBusy("code");
    const { data, error } = await supabase.rpc("rotate_league_join_code", {
      target_league_id: league.id
    });
    setBusy(null);
    if (error) {
      setToast({ message: friendlyActionError(error, "The code could not be rotated."), tone: "error" });
      return;
    }
    await reloadLeagues();
    await copy(String(data), "A new league code was generated and copied.");
  }

  async function createInviteLink() {
    if (!league || busy) return;
    setBusy("invite");
    const { data, error } = await supabase.rpc("create_league_invite_link", {
      target_league_id: league.id,
      valid_hours: 72
    });
    setBusy(null);
    if (error) {
      setToast({ message: friendlyActionError(error, "The invite link could not be created."), tone: "error" });
      return;
    }
    const result = data as { token: string };
    const url = `${window.location.origin}/invite/${result.token}`;
    setInviteLink(url);
    await copy(url, "Invite link copied. It can be used once within 72 hours.");
  }

  async function reviewRequest(requestId: string, approve: boolean) {
    if (busy) return;
    setBusy(requestId);
    try {
      const token = await pushAccessToken();
      const response = await fetch("/api/leagues/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "review", requestId, approve })
      });
      if (!response.ok) throw new Error(await pushResponseError(response));
    } catch (error) {
      setBusy(null);
      setToast({ message: friendlyActionError(error, "The request could not be reviewed."), tone: "error" });
      return;
    }
    setBusy(null);
    setToast({ message: approve ? "Member approved." : "Request declined.", tone: "success" });
    await load();
  }

  async function setRole(userId: string, makeAdmin: boolean) {
    if (!league || busy) return;
    setBusy(userId);
    const { error } = await supabase.rpc("set_league_member_role", {
      target_league_id: league.id,
      target_user_id: userId,
      make_admin: makeAdmin
    });
    setBusy(null);
    if (error) {
      setToast({ message: friendlyActionError(error, "The member role could not be changed."), tone: "error" });
      return;
    }
    setToast({ message: makeAdmin ? "Member promoted to admin." : "Admin changed to member.", tone: "success" });
    await load();
  }

  async function transferOwnership(userId: string) {
    if (!league || busy) return;
    setBusy(userId);
    const { error } = await supabase.rpc("transfer_league_ownership", {
      target_league_id: league.id,
      target_user_id: userId
    });
    setBusy(null);
    if (error) {
      setToast({ message: friendlyActionError(error, "Ownership could not be transferred."), tone: "error" });
      return;
    }
    await Promise.all([load(), reloadLeagues()]);
    setToast({ message: `${profileName(userId)} is now the league owner. You are now an admin.`, tone: "success" });
  }

  async function removeMember(userId: string) {
    if (!league) return;
    const { error } = await supabase.rpc("remove_league_member", {
      target_league_id: league.id,
      target_user_id: userId
    });
    if (error) {
      setToast({ message: friendlyActionError(error, "The member could not be removed."), tone: "error" });
      return;
    }
    setToast({ message: "Member removed. Historical results were kept.", tone: "success" });
    await load();
  }

  async function archiveLeague() {
    if (!league) return;
    const { error } = await supabase.rpc("archive_league", {
      target_league_id: league.id
    });
    if (error) {
      setToast({ message: friendlyActionError(error, "The league could not be archived."), tone: "error" });
      return;
    }
    await reloadLeagues();
    router.replace("/leagues");
  }

  if (!league) return null;

  return (
    <div className="space-y-5">
      <Toast message={toast?.message || null} tone={toast?.tone} onDone={() => setToast(null)} />
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title || ""}
        text={confirm?.text}
        confirmLabel={confirm?.confirmLabel || "Confirm"}
        confirmTone={confirm?.confirmTone}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const action = confirm?.action;
          setConfirm(null);
          await action?.();
        }}
      />

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/60">League setup</div>
            <h2 className="mt-1 font-display text-3xl uppercase">Options</h2>
            <p className="mt-1 text-sm text-chalk/45">Members get Fantasy immediately. Betting unlocks automatically after three final games.</p>
          </div>
          <Shield className="text-league-gold" size={22} />
        </div>
        <div className="mt-5 grid gap-4">
          <label>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-chalk/45">League name</span>
            <TextInput value={name} onChange={event => setName(event.target.value)} maxLength={60} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionToggle label="Fantasy" checked={fantasyEnabled} onChange={setFantasyEnabled} />
            <OptionToggle label="Virtual betting" checked={bettingEnabled} onChange={setBettingEnabled} />
          </div>
          {bettingEnabled ? (
            <div className="rounded-xl border border-league-gold/18 bg-league-gold/[.035] p-3">
              <span className="block text-xs font-bold uppercase tracking-wider text-league-gold/75">Betting unlock</span>
              <span className="mt-1 block text-xs text-chalk/45">
                {remainingUnlockGames
                  ? `${completedGames}/${BETTING_UNLOCK_GAMES} · ${remainingUnlockGames} game${remainingUnlockGames === 1 ? "" : "s"} left to unlock betting.`
                  : `${completedGames}/${BETTING_UNLOCK_GAMES} · Betting is unlocked.`}
              </span>
            </div>
          ) : null}
          <PrimaryButton type="button" disabled={busy === "options" || name.trim().length < 2} onClick={() => void saveOptions()} className="w-full sm:w-fit">
            {busy === "options" ? "Saving…" : "Save options"}
          </PrimaryButton>
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.18em] text-turf-400/70">Invite friends</div>
            <h2 className="mt-1 font-display text-3xl uppercase">Share access</h2>
          </div>
          <Link2 className="text-turf-400" size={22} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-league-gold/18 bg-black/15 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-chalk/40">Approval code</div>
            <code className="mt-2 block font-mono text-xl font-bold tracking-wider text-league-gold">{league.join_code}</code>
            <p className="mt-2 text-xs leading-relaxed text-chalk/35">Anyone can submit this code, but an admin must approve them.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => void copy(league.join_code, "League code copied.")} className="inline-flex items-center gap-2"><Copy size={15} /> Copy</SecondaryButton>
              <SecondaryButton
                type="button"
                disabled={busy === "code"}
                onClick={() => setConfirm({
                  title: "Rotate league code?",
                  text: "The current code will stop working immediately. Existing members and pending requests are not affected.",
                  confirmLabel: "Rotate code",
                  action: rotateCode
                })}
                className="inline-flex items-center gap-2"
              >
                <RefreshCw size={15} /> Rotate
              </SecondaryButton>
            </div>
          </div>
          <div className="rounded-xl border border-league-gold/25 bg-league-gold/[.035] p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-chalk/40">One-tap invite</div>
            <p className="mt-2 text-sm leading-relaxed text-chalk/50">Creates a single-use link that joins immediately after the recipient accepts.</p>
            <PrimaryButton type="button" disabled={busy === "invite"} onClick={() => void createInviteLink()} className="mt-3 inline-flex items-center gap-2"><Link2 size={15} /> {busy === "invite" ? "Creating…" : "Create 72-hour link"}</PrimaryButton>
            {inviteLink ? <button type="button" onClick={() => void copy(inviteLink, "Invite link copied.")} className="mt-3 block max-w-full truncate text-left text-xs font-bold text-league-gold underline-offset-4 hover:underline">{inviteLink}</button> : null}
          </div>
        </div>
      </Card>

      {requests.length ? (
        <Card>
          <div className="flex items-center gap-2"><UsersRound className="text-league-gold" size={20} /><h2 className="font-display text-3xl uppercase">Join requests</h2></div>
          <div className="mt-4 divide-y divide-league-gold/12">
            {requests.map(request => (
              <div
                key={request.id}
                role="group"
                aria-label={`Join request from ${profileName(request.user_id)}`}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="min-w-0 flex-1 truncate font-bold">{profileName(request.user_id)}</span>
                <SecondaryButton type="button" disabled={busy === request.id} onClick={() => setConfirm({
                  title: `Decline ${profileName(request.user_id)}?`,
                  text: "Their pending request will be closed. They can request to join again later.",
                  confirmLabel: "Decline request",
                  action: () => reviewRequest(request.id, false)
                })}>Decline</SecondaryButton>
                <PrimaryButton type="button" disabled={busy === request.id} onClick={() => setConfirm({
                  title: `Approve ${profileName(request.user_id)}?`,
                  text: "They will become a member and immediately gain access to this league.",
                  confirmLabel: "Approve member",
                  confirmTone: "primary",
                  action: () => reviewRequest(request.id, true)
                })}>Approve</PrimaryButton>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center gap-2"><UsersRound className="text-turf-400" size={20} /><h2 className="font-display text-3xl uppercase">Members</h2></div>
        <div className="mt-4 divide-y divide-league-gold/12">
          {memberships.map(member => (
            <div
              key={member.id}
              role="group"
              aria-label={`League member ${profileName(member.user_id)}`}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-bold">{profileName(member.user_id)}</span>
                  {member.role === "owner" ? <Crown size={14} className="shrink-0 text-league-gold" aria-label="League owner" /> : null}
                  {member.user_id === ownMembership?.user_id ? <span className="shrink-0 text-xs font-normal text-league-gold">you</span> : null}
                </div>
                <div className="mt-0.5 text-xs capitalize text-chalk/35">{member.role === "admin" ? "Admin - co-owner" : member.role}</div>
              </div>
              {member.user_id !== ownMembership?.user_id ? (
                <>
                  {isLeagueOwner && member.role !== "owner" ? (
                    <SecondaryButton
                      type="button"
                      disabled={busy === member.user_id}
                      onClick={() => setConfirm({
                        title: member.role === "admin" ? "Make this admin a member?" : "Promote this member to admin?",
                        text: member.role === "admin"
                          ? `${profileName(member.user_id)} will lose access to roster, games, seasons, league settings, and join approvals.`
                          : `${profileName(member.user_id)} will become a co-owner who can manage the roster, games, seasons, settings, and join approvals.`,
                        confirmLabel: member.role === "admin" ? "Make member" : "Make admin",
                        confirmTone: member.role === "admin" ? "destructive" : "primary",
                        action: () => setRole(member.user_id, member.role !== "admin")
                      })}
                      className="inline-flex items-center gap-2"
                    >
                      {member.role === "admin" ? <ShieldOff size={15} /> : <Shield size={15} />}
                      {member.role === "admin" ? "Make member" : "Make admin"}
                    </SecondaryButton>
                  ) : null}
                  {isLeagueOwner && member.role !== "owner" ? (
                    <SecondaryButton
                      type="button"
                      disabled={busy === member.user_id}
                      onClick={() => setConfirm({
                        title: `Transfer ownership to ${profileName(member.user_id)}?`,
                        text: "They will become the only league owner. You will become an admin and will no longer control ownership transfers or league archival.",
                        confirmLabel: "Transfer ownership",
                        action: () => transferOwnership(member.user_id)
                      })}
                      className="inline-flex items-center gap-2"
                    >
                      <Crown size={15} /> Transfer
                    </SecondaryButton>
                  ) : null}
                  {(isLeagueOwner || (ownMembership?.role === "admin" && member.role === "member")) && member.role !== "owner" ? (
                    <button
                      type="button"
                      aria-label={`Remove ${profileName(member.user_id)}`}
                      onClick={() => setConfirm({
                        title: "Remove league member?",
                        text: `${profileName(member.user_id)} will lose access immediately. Historical results remain.`,
                        confirmLabel: "Remove member",
                        action: () => removeMember(member.user_id)
                      })}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-red-400/20 bg-red-400/[.05] text-red-300 transition hover:bg-red-400/[.1]"
                    >
                      <UserMinus size={16} />
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      {nextGame ? (
        <Card>
          <h2 className="font-display text-3xl uppercase">Next-game readiness</h2>
          <p className="mt-1 text-xs text-chalk/40">Only completion status is shown. Picks and bets stay private.</p>
          <div className="mt-4 divide-y divide-league-gold/12">
            {readiness.map(row => (
              <div key={row.user_id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="truncate text-sm font-bold">{row.username}</span>
                {league.fantasy_enabled ? <ReadyBadge label="Fantasy" ready={row.fantasy_ready} /> : null}
                {league.betting_enabled ? <ReadyBadge label="Bet" ready={row.betting_ready} /> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {isLeagueOwner ? <Card className="border-red-400/15">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl uppercase">Archive league</h2>
            <p className="mt-1 text-xs leading-relaxed text-chalk/40">Removes the league from active use without deleting games, stats, Fantasy results, or bets.</p>
          </div>
          <button
            type="button"
            onClick={() => setConfirm({
              title: "Archive this league?",
              text: "The league will close for all members, but its history will be retained. This is not an immediate deletion.",
              confirmLabel: "Archive league",
              action: archiveLeague
            })}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-400/[.05] px-4 text-sm font-bold text-red-200 transition hover:bg-red-400/[.1]"
          >
            <Archive size={16} /> Archive
          </button>
        </div>
      </Card> : null}
    </div>
  );
}

function OptionToggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-league-gold/18 bg-black/15 px-4 text-sm font-bold"
    >
      <span>{label}</span>
      <span className={checked ? "text-turf-400" : "text-chalk/30"}>{checked ? "On" : "Off"}</span>
    </button>
  );
}

function ReadyBadge({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span className={ready ? "inline-flex items-center gap-1 rounded-full bg-turf-400/10 px-2 py-1 text-[10px] font-bold text-turf-400" : "rounded-full bg-chalk/[.04] px-2 py-1 text-[10px] font-bold text-chalk/30"}>
      {ready ? <Check size={11} /> : null}{label}
    </span>
  );
}
