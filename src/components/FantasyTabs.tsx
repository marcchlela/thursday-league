"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { allTimeLeaderboard, weeklyLeaderboard } from "@/lib/scoring";
import { formatDateTime, playerName } from "@/lib/utils";
import { FantasyPick, LeagueData } from "@/lib/types";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { Card, EmptyState, Pill, TabList } from "./ui";
import { PitchPicker } from "./PitchPicker";

type FantasyTab = "set" | "standings" | "history";

export function FantasyTabs({ data, reload }: { data: LeagueData; reload: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: FantasyTab = requestedTab === "standings" || requestedTab === "history" ? requestedTab : "set";

  function setTab(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    if (nextTab !== "history") params.delete("game");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-5xl uppercase">Fantasy</h1><p className="mt-2 text-chalk/60">Pick five, captain one, and chase the weekly top spot.</p></div>
      <TabList idPrefix="fantasy" label="Fantasy views" tabs={[{ id: "set", label: "Set Team" }, { id: "standings", label: "Standings" }, { id: "history", label: "History" }]} active={tab} onChange={setTab} />
      <div id={`fantasy-${tab}-panel`} role="tabpanel" aria-labelledby={`fantasy-${tab}-tab`}>
        {tab === "set" ? <SetTeam data={data} reload={reload} /> : null}
        {tab === "standings" ? <Standings data={data} /> : null}
        {tab === "history" ? <History data={data} /> : null}
      </div>
    </div>
  );
}

function activeFantasyGame(data: LeagueData) {
  const openDraft = [...data.games]
    .filter(game => game.status === "draft" && new Date(game.game_date).getTime() > Date.now())
    .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())[0];
  if (openDraft) return openDraft;
  return [...data.games].filter(game => game.status === "live" || game.status === "draft").sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime())[0];
}

function SetTeam({ data, reload }: { data: LeagueData; reload: () => void }) {
  const { user } = useAuthProfile();
  const game = activeFantasyGame(data);
  const lineups = useMemo(() => game ? data.lineups.filter(lineup => lineup.game_id === game.id) : [], [data.lineups, game]);
  const extraPlayers = useMemo(() => game ? data.playerStats.filter(stat => stat.game_id === game.id).map(stat => ({ player_id: stat.player_id, role: stat.role })) : [], [data.playerStats, game]);
  const squad = useMemo(() => game && user ? data.squads.find(item => item.game_id === game.id && item.user_id === user.id) : undefined, [data.squads, game, user]);
  const initialPicks = useMemo(() => squad ? data.picks.filter(pick => pick.squad_id === squad.id) : [], [data.picks, squad]);

  if (!game || !user) return <EmptyState title="No fantasy game open" text="Once the admin sets a lineup, your pitch picker appears here." />;

  const locked = game.status === "live" || game.status === "final" || Date.now() >= new Date(game.game_date).getTime();
  const lockState = game.status === "final"
    ? { label: "Final", text: "This game is final. Picks are locked." }
    : game.status === "live"
      ? { label: "Live - locked", text: "The game is live. Picks can no longer be changed." }
      : locked
        ? { label: "Kickoff passed", text: "The scheduled start time has passed. Picks are locked even if the game has not been marked live yet." }
        : { label: "Lineup set - open", text: `Editable until kickoff: ${formatDateTime(game.game_date)}` };

  async function savePicks(draft: Omit<FantasyPick, "id" | "squad_id" | "created_at">[]) {
    const submittedPicks = draft.map(({ player_id, role, is_captain, slot_index }) => ({ player_id, role, is_captain, slot_index }));
    const { error } = await supabase.rpc("save_fantasy_squad", { target_game_id: game!.id, submitted_picks: submittedPicks });
    if (error) throw error;
    reload();
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><Pill className={locked ? "border-floodlight/40 bg-floodlight/20 text-floodlight" : "border-perimeter-400/40 bg-perimeter-400/10 text-perimeter-400"}>{lockState.label}</Pill><h2 className="mt-2 font-display text-3xl uppercase">Locks at kickoff</h2><p className="text-chalk/60">{lockState.text}</p></div>
          <div className="font-mono text-2xl text-chalk/70">{initialPicks.length ? "Your picks are in" : "No picks yet"}</div>
        </div>
      </Card>
      {lineups.length ? <PitchPicker players={data.players} lineups={lineups} extraPlayers={extraPlayers} initialPicks={initialPicks} locked={locked} onSave={savePicks} /> : <EmptyState title="Lineup pending" text="This game exists, but the admin has not picked who's playing yet." />}
    </div>
  );
}

function Standings({ data }: { data: LeagueData }) {
  const board = allTimeLeaderboard(data);
  const currentGame = activeFantasyGame(data);
  const pickedCount = currentGame ? data.squads.filter(squad => squad.game_id === currentGame.id).length : 0;
  const notPicked = currentGame ? Math.max(data.profiles.length - pickedCount, 0) : 0;

  return (
    <Card className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="font-display text-3xl uppercase">Points standings</h2><p className="text-sm text-chalk/55">All-time fantasy points. No season reset.</p></div>
        {currentGame?.status === "draft" ? <Pill className="border-floodlight/40 bg-floodlight/10 text-floodlight">{notPicked} have not picked yet</Pill> : null}
      </div>
      <div className="mt-5 space-y-2">
        {board.map(row => <div key={row.userId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-perimeter-400/15 font-mono text-perimeter-400">#{row.rank}</span><span className="font-semibold">{row.username}</span><span className="font-mono text-xl">{row.points}</span></div>)}
      </div>
    </Card>
  );
}

function History({ data }: { data: LeagueData }) {
  const { user } = useAuthProfile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const finals = data.games.filter(game => game.status === "final").sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());
  const selectedGameId = searchParams.get("game") || finals[0]?.id || "";

  if (!finals.length) return <EmptyState title="No history yet" text="Final games will appear here with that week's fantasy leaderboard." />;

  const game = finals.find(item => item.id === selectedGameId) || finals[0];
  const board = weeklyLeaderboard({ ...data, game });
  const userId = user?.id;
  const myRow = userId ? board.find(row => row.userId === userId) : undefined;
  const ordered = myRow ? [myRow, ...board.filter(row => row.userId !== userId)] : board;

  function chooseGame(gameId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "history");
    params.set("game", gameId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
      <Card>
        <h2 className="font-display text-3xl uppercase">Past games</h2>
        <div className="mt-4 space-y-2">{finals.map(item => <button key={item.id} onClick={() => chooseGame(item.id)} className={`w-full rounded-2xl border p-3 text-left transition ${game.id === item.id ? "border-perimeter-400/60 bg-perimeter-400/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}><div className="font-semibold">{formatDateTime(item.game_date)}</div><div className="text-sm text-chalk/50">POTM: {playerName(data.players, item.potm_player_id)}</div></button>)}</div>
      </Card>
      <Card>
        <h2 className="font-display text-3xl uppercase">Weekly leaderboard</h2>
        <p className="mt-1 text-sm text-chalk/50">Open any manager to see their squad.</p>
        <div className="mt-4 space-y-2">{ordered.map(row => <Link href={`/fantasy/history/${game.id}/${row.userId}`} key={row.userId} className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3 text-left transition hover:border-perimeter-400/50 hover:bg-perimeter-400/10 ${row.userId === userId ? "border-floodlight/50 bg-floodlight/10" : "border-white/10 bg-white/[0.03]"}`}><span className="font-mono text-perimeter-400">#{row.rank}</span><span>{row.username}{row.userId === userId ? " · you" : ""}</span><span className="font-mono text-xl">{row.points}</span></Link>)}</div>
      </Card>
    </div>
  );
}
