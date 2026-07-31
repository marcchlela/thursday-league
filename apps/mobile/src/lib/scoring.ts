import type { Game, GameLineup, GamePlayerStat, MatchEvent, Player, TeamCode } from '@/lib/types';

export function otherTeam(team: TeamCode): TeamCode {
  return team === 'A' ? 'B' : 'A';
}

export function calculateScore(events: MatchEvent[], lineups: GameLineup[], stats: GamePlayerStat[] = []) {
  const score: Record<TeamCode, number> = { A: 0, B: 0 };
  for (const event of events) {
    const lineup = lineups.find(item => item.player_id === event.player_id);
    if (!lineup) continue;
    score[event.event_type === 'goal' ? lineup.team : otherTeam(lineup.team)] += 1;
  }
  for (const stat of stats) {
    score[stat.team] += stat.goals;
    score[otherTeam(stat.team)] += stat.own_goals || 0;
  }
  return score;
}

export function careerStats({ player, games, lineups, events, stats }: { player: Player; games: Game[]; lineups: GameLineup[]; events: MatchEvent[]; stats: GamePlayerStat[] }) {
  const visibleGames = games.filter(game => game.status === 'final' || game.status === 'live');
  const gameIds = new Set(visibleGames.map(game => game.id));
  const playerLineups = lineups.filter(item => item.player_id === player.id && gameIds.has(item.game_id));
  const playerStats = stats.filter(item => item.player_id === player.id && gameIds.has(item.game_id));
  const playerEvents = events.filter(item => gameIds.has(item.game_id));
  let cleanSheets = 0;
  for (const lineup of playerLineups.filter(item => item.role === 'goalkeeper')) {
    const game = visibleGames.find(item => item.id === lineup.game_id);
    if (game?.status !== 'final') continue;
    const score = calculateScore(events.filter(item => item.game_id === game.id), lineups.filter(item => item.game_id === game.id), stats.filter(item => item.game_id === game.id));
    if (score[otherTeam(lineup.team)] === 0) cleanSheets += 1;
  }
  return {
    appearances: new Set([...playerLineups.map(item => item.game_id), ...playerStats.map(item => item.game_id)]).size,
    goals: playerEvents.filter(item => item.event_type === 'goal' && item.player_id === player.id).length + playerStats.reduce((sum, item) => sum + item.goals, 0),
    assists: playerEvents.filter(item => item.event_type === 'goal' && item.assist_player_id === player.id).length + playerStats.reduce((sum, item) => sum + item.assists, 0),
    saves: playerStats.reduce((sum, item) => sum + item.saves, 0),
    ownGoals: playerEvents.filter(item => item.event_type === 'own_goal' && item.player_id === player.id).length + playerStats.reduce((sum, item) => sum + (item.own_goals || 0), 0),
    cleanSheets,
  };
}

export function fantasyPoints({ game, player, pick, lineups, events, stats }: { game: Game; player: Player; pick: { is_captain: boolean }; lineups: GameLineup[]; events: MatchEvent[]; stats: GamePlayerStat[] }) {
  if (player.fantasy_eligible === false || player.competition_eligible === false && player.fantasy_eligible == null) return 0;
  const lineup = lineups.find(item => item.game_id === game.id && item.player_id === player.id);
  const manual = stats.find(item => item.game_id === game.id && item.player_id === player.id);
  const gameEvents = events.filter(item => item.game_id === game.id);
  const gameLineups = lineups.filter(item => item.game_id === game.id);
  const gameStats = stats.filter(item => item.game_id === game.id);
  const goals = gameEvents.filter(item => item.event_type === 'goal' && item.player_id === player.id).length + (manual?.goals || 0);
  const assists = gameEvents.filter(item => item.event_type === 'goal' && item.assist_player_id === player.id).length + (manual?.assists || 0);
  const ownGoals = gameEvents.filter(item => item.event_type === 'own_goal' && item.player_id === player.id).length + (manual?.own_goals || 0);
  let points = goals * 4 + assists * 2 - ownGoals * 2 + (goals >= 3 ? 3 : 0) + (manual?.saves || 0);
  if (lineup) {
    const score = calculateScore(gameEvents, gameLineups, gameStats);
    if (score.A === score.B) points += 1;
    else if (score[lineup.team] > score[otherTeam(lineup.team)]) points += 2;
    else if (score[otherTeam(lineup.team)] - score[lineup.team] >= 3) points -= 1;
    if (lineup.role === 'goalkeeper' && game.status === 'final' && score[otherTeam(lineup.team)] === 0) points += 4;
  }
  if (game.potm_player_id === player.id) points += 3;
  return pick.is_captain ? points * 2 : points;
}

export function formatMatchTime(value: string, timezone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(value));
}
