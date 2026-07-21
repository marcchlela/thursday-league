import {
  FantasyPick,
  FantasySquad,
  Game,
  GameLineup,
  GamePlayerStat,
  MatchEvent,
  Player,
  PlayerBreakdown,
  Profile,
  TeamCode,
  WeeklyFantasyResult
} from "./types";
import { isCompetitionEligible } from "./playerEligibility";

export const SAVES_PER_FANTASY_POINT = 1;

export function otherTeam(team: TeamCode): TeamCode {
  return team === "A" ? "B" : "A";
}

export function lineupForPlayer(lineups: GameLineup[], playerId: string) {
  return lineups.find(l => l.player_id === playerId);
}

export function eventScoringTeam(event: MatchEvent, lineups: GameLineup[]): TeamCode | null {
  const playerLineup = lineupForPlayer(lineups, event.player_id);
  if (!playerLineup) return null;
  if (event.event_type === "goal") return playerLineup.team;
  return otherTeam(playerLineup.team);
}

export function calculateScore(events: MatchEvent[], lineups: GameLineup[], playerStats: GamePlayerStat[] = []) {
  const score: Record<TeamCode, number> = { A: 0, B: 0 };
  for (const event of events) {
    const team = eventScoringTeam(event, lineups);
    if (team) score[team] += 1;
  }
  for (const stat of playerStats) score[stat.team] += stat.goals;
  return score;
}

export function gameWinner(events: MatchEvent[], lineups: GameLineup[], playerStats: GamePlayerStat[] = []): TeamCode | "draw" | null {
  const score = calculateScore(events, lineups, playerStats);
  if (score.A === score.B) return "draw";
  return score.A > score.B ? "A" : "B";
}

export function calculatePlayerBreakdown(args: {
  game: Game;
  player: Player;
  pick?: FantasyPick;
  lineups: GameLineup[];
  events: MatchEvent[];
  playerStats?: GamePlayerStat[];
}): PlayerBreakdown {
  const { game, player, pick, lineups, events, playerStats = [] } = args;
  if (!isCompetitionEligible(player)) {
    const lineup = lineups.find(item => item.game_id === game.id && item.player_id === player.id);
    return {
      playerId: player.id,
      playerName: player.name,
      team: lineup?.team,
      role: pick?.role || lineup?.role,
      isCaptain: !!pick?.is_captain,
      pointsBeforeCaptain: 0,
      points: 0,
      lines: ["guest player - excluded from fantasy points"]
    };
  }
  const gameLineups = lineups.filter(lineup => lineup.game_id === game.id);
  const gameEvents = events.filter(event => event.game_id === game.id);
  const gamePlayerStats = playerStats.filter(stat => stat.game_id === game.id);
  const lineup = lineupForPlayer(gameLineups, player.id);
  const manualStat = gamePlayerStats.find(stat => stat.player_id === player.id);
  const saves = manualStat?.saves || 0;
  const score = calculateScore(gameEvents, gameLineups, gamePlayerStats);
  const goals = gameEvents.filter(e => e.event_type === "goal" && e.player_id === player.id).length + (manualStat?.goals || 0);
  const assists = gameEvents.filter(e => e.event_type === "goal" && e.assist_player_id === player.id).length + (manualStat?.assists || 0);
  const ownGoals = gameEvents.filter(e => e.event_type === "own_goal" && e.player_id === player.id).length;
  const lines: string[] = [];
  let points = 0;

  if (goals) {
    const pts = goals * 4;
    points += pts;
    lines.push(`${goals} goal${goals === 1 ? "" : "s"} = ${pts}`);
  }

  if (assists) {
    const pts = assists * 2;
    points += pts;
    lines.push(`${assists} assist${assists === 1 ? "" : "s"} = ${pts}`);
  }

  if (ownGoals) {
    const pts = ownGoals * -2;
    points += pts;
    lines.push(`${ownGoals} own goal${ownGoals === 1 ? "" : "s"} = ${pts}`);
  }

  if (goals >= 3) {
    points += 3;
    lines.push("hat-trick bonus = 3");
  }

  const playerRole = pick?.role || lineup?.role || manualStat?.role;
  const savePoints = playerRole === "goalkeeper" ? Math.floor(saves / SAVES_PER_FANTASY_POINT) : 0;
  if (savePoints) {
    points += savePoints;
    lines.push(`${saves} saves = ${savePoints}`);
  }

  if (lineup?.team) {
    const winner = gameWinner(gameEvents, gameLineups, gamePlayerStats);
    if (winner === "draw") {
      points += 1;
      lines.push("draw = 1");
    } else if (winner === lineup.team) {
      points += 2;
      lines.push("win = 2");
    } else if (winner && score[otherTeam(lineup.team)] - score[lineup.team] >= 3) {
      points -= 1;
      lines.push("heavy defeat = -1");
    }

    if (lineup.role === "goalkeeper" && score[otherTeam(lineup.team)] === 0 && game.status === "final") {
      points += 4;
      lines.push("clean sheet = 4");
    }
  }

  if (game.potm_player_id === player.id) {
    points += 3;
    lines.push("Player of the Match = 3");
  }

  if (!lines.length) lines.push("played = 0");

  const isCaptain = !!pick?.is_captain;
  const pointsBeforeCaptain = points;
  if (isCaptain) {
    points *= 2;
    lines.push(`captain x2 = ${points}`);
  }

  return {
    playerId: player.id,
    playerName: player.name,
    team: lineup?.team,
    role: pick?.role || lineup?.role,
    isCaptain,
    pointsBeforeCaptain,
    points,
    lines
  };
}

export function calculateSquadResult(args: {
  game: Game;
  squad: FantasySquad;
  picks: FantasyPick[];
  players: Player[];
  lineups: GameLineup[];
  events: MatchEvent[];
  playerStats: GamePlayerStat[];
}) {
  const { game, squad, picks, players, lineups, events, playerStats } = args;
  const squadPicks = picks.filter(p => p.squad_id === squad.id).sort((a, b) => a.slot_index - b.slot_index);
  const breakdown = squadPicks
    .map(pick => {
      const player = players.find(p => p.id === pick.player_id);
      if (!player) return null;
      return calculatePlayerBreakdown({ game, player, pick, lineups, events, playerStats });
    })
    .filter(Boolean) as PlayerBreakdown[];

  return {
    points: breakdown.reduce((sum, item) => sum + item.points, 0),
    breakdown
  };
}

export function weeklyLeaderboard(args: {
  game: Game;
  profiles: Profile[];
  squads: FantasySquad[];
  picks: FantasyPick[];
  players: Player[];
  lineups: GameLineup[];
  events: MatchEvent[];
  playerStats: GamePlayerStat[];
}): WeeklyFantasyResult[] {
  const { game, profiles, squads, picks, players, lineups, events, playerStats } = args;
  const gameSquads = squads.filter(s => s.game_id === game.id);
  const results = gameSquads.map(squad => {
    const profile = profiles.find(p => p.id === squad.user_id);
    const result = calculateSquadResult({ game, squad, picks, players, lineups, events, playerStats });
    return {
      userId: squad.user_id,
      username: profile?.username || "unknown",
      squadId: squad.id,
      points: result.points,
      rank: 0,
      breakdown: result.breakdown
    };
  });

  results.sort((a, b) => b.points - a.points || a.username.localeCompare(b.username));
  return results.map((r, index) => ({ ...r, rank: index + 1 }));
}

export function allTimeLeaderboard(args: {
  profiles: Profile[];
  games: Game[];
  squads: FantasySquad[];
  picks: FantasyPick[];
  players: Player[];
  lineups: GameLineup[];
  events: MatchEvent[];
  playerStats: GamePlayerStat[];
}) {
  const totals = new Map<string, number>();
  for (const profile of args.profiles) totals.set(profile.id, 0);

  for (const game of args.games.filter(g => g.status === "final")) {
    const board = weeklyLeaderboard({ ...args, game });
    for (const row of board) totals.set(row.userId, (totals.get(row.userId) || 0) + row.points);
  }

  return args.profiles
    .map(profile => ({
      userId: profile.id,
      username: profile.username,
      points: totals.get(profile.id) || 0,
      rank: 0
    }))
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function careerStats(args: {
  player: Player;
  games: Game[];
  lineups: GameLineup[];
  events: MatchEvent[];
  playerStats: GamePlayerStat[];
}) {
  if (!isCompetitionEligible(args.player)) {
    return { appearances: 0, goals: 0, assists: 0, ownGoals: 0, cleanSheets: 0, saves: 0 };
  }
  const finalOrLiveGames = args.games.filter(g => g.status === "final" || g.status === "live");
  const gameIds = new Set(finalOrLiveGames.map(g => g.id));
  const playerLineups = args.lineups.filter(l => l.player_id === args.player.id && gameIds.has(l.game_id));
  const playerStatRows = args.playerStats.filter(stat => stat.player_id === args.player.id && gameIds.has(stat.game_id));
  const playerEvents = args.events.filter(e => gameIds.has(e.game_id));

  let cleanSheets = 0;
  for (const lineup of playerLineups.filter(l => l.role === "goalkeeper")) {
    const game = finalOrLiveGames.find(g => g.id === lineup.game_id);
    if (!game || game.status !== "final") continue;
    const gameLineups = args.lineups.filter(l => l.game_id === game.id);
    const gameEvents = args.events.filter(e => e.game_id === game.id);
    const score = calculateScore(gameEvents, gameLineups, args.playerStats.filter(stat => stat.game_id === game.id));
    if (score[otherTeam(lineup.team)] === 0) cleanSheets += 1;
  }

  return {
    appearances: new Set([...playerLineups.map(lineup => lineup.game_id), ...playerStatRows.map(stat => stat.game_id)]).size,
    goals: playerEvents.filter(e => e.event_type === "goal" && e.player_id === args.player.id).length + playerStatRows.reduce((total, stat) => total + stat.goals, 0),
    assists: playerEvents.filter(e => e.event_type === "goal" && e.assist_player_id === args.player.id).length + playerStatRows.reduce((total, stat) => total + stat.assists, 0),
    ownGoals: playerEvents.filter(e => e.event_type === "own_goal" && e.player_id === args.player.id).length,
    cleanSheets,
    saves: playerStatRows.reduce((total, stat) => total + stat.saves, 0)
  };
}
