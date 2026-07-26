import clsx from "clsx";
import { Game, MatchEvent, GameLineup, GamePlayerStat, GoalkeeperMode, LeagueData, Player, TeamCode } from "./types";
import { calculateScore } from "./scoring";

export const cn = clsx;

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function scoreText(game: Game, events: MatchEvent[], lineups: GameLineup[], playerStats: GamePlayerStat[] = []) {
  const score = calculateScore(events.filter(e => e.game_id === game.id), lineups.filter(l => l.game_id === game.id), playerStats.filter(stat => stat.game_id === game.id));
  return `${score.A} - ${score.B}`;
}

export function playerName(players: Player[], id?: string | null) {
  if (!id) return "—";
  return players.find(p => p.id === id)?.name || "Unknown";
}

export function sortLineupsByRole(players: Player[], lineups: GameLineup[]) {
  return [...lineups].sort((a, b) => {
    if (a.role !== b.role) return a.role === "goalkeeper" ? -1 : 1;
    return playerName(players, a.player_id).localeCompare(playerName(players, b.player_id));
  });
}

export function goalkeeperMode(game: Game, team: TeamCode): GoalkeeperMode {
  return (team === "A" ? game.team_a_goalkeeper_mode : game.team_b_goalkeeper_mode) || "fixed";
}

export function teamLineupIsReady(game: Game, lineups: GameLineup[], team: TeamCode) {
  const teamLineup = lineups.filter(lineup => lineup.team === team);
  const goalkeeperCount = teamLineup.filter(lineup => lineup.role === "goalkeeper").length;
  return teamLineup.length === 5
    && teamLineup.every(lineup => lineup.slot_index != null)
    && (goalkeeperMode(game, team) === "fixed" ? goalkeeperCount === 1 : goalkeeperCount === 0);
}

export function gameLineupIsReady(game: Game, lineups: GameLineup[]) {
  return teamLineupIsReady(game, lineups, "A") && teamLineupIsReady(game, lineups, "B");
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    upcoming: "Upcoming",
    draft: "Lineup set",
    live: "Live",
    final: "Final"
  };
  return map[status] || status;
}

export function currentSeason(data: Pick<LeagueData, "seasons" | "leagueSettings">) {
  if (data.leagueSettings?.season_mode === "custom") {
    return data.seasons.find(season => season.id === data.leagueSettings?.current_season_id);
  }
  const beirutYear = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Beirut" }).format(new Date());
  return data.seasons.find(season => season.format === "yearly" && season.name === beirutYear)
    || data.seasons.find(season => season.id === data.leagueSettings?.current_season_id);
}
