import clsx from "clsx";
import { Game, MatchEvent, GameLineup, Player } from "./types";
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

export function scoreText(game: Game, events: MatchEvent[], lineups: GameLineup[]) {
  const score = calculateScore(events.filter(e => e.game_id === game.id), lineups.filter(l => l.game_id === game.id));
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

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    upcoming: "Upcoming",
    draft: "Lineup set",
    live: "Live",
    final: "Final"
  };
  return map[status] || status;
}
