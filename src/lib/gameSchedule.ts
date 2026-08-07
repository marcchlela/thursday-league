import type { Game } from "./types";

export const MATCH_WINDOW_MS = 6 * 60 * 60 * 1000;

export type GameSchedule = {
  active: Game[];
  awaitingUpdate: Game[];
  results: Game[];
};

function kickoff(game: Game) {
  return new Date(game.game_date).getTime();
}

export function isGameAwaitingUpdate(game: Game, now = Date.now()) {
  if (game.status === "final" || game.status === "live") return false;
  return kickoff(game) + MATCH_WINDOW_MS < now;
}

export function organizeGames(games: Game[], now = Date.now()): GameSchedule {
  const active = games
    .filter(game => game.status !== "final" && !isGameAwaitingUpdate(game, now))
    .sort((first, second) => {
      if (first.status === "live" && second.status !== "live") return -1;
      if (second.status === "live" && first.status !== "live") return 1;
      return kickoff(first) - kickoff(second);
    });

  const awaitingUpdate = games
    .filter(game => isGameAwaitingUpdate(game, now))
    .sort((first, second) => kickoff(second) - kickoff(first));

  const results = games
    .filter(game => game.status === "final")
    .sort((first, second) => kickoff(second) - kickoff(first));

  return { active, awaitingUpdate, results };
}

export function fixtureDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function fixtureTabDate(value: string, currentYear = new Date().getFullYear()) {
  const date = new Date(value);
  const base = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  return date.getFullYear() === currentYear ? base : `${base}/${date.getFullYear()}`;
}
