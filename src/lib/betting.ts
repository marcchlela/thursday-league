import { calculateScore, otherTeam } from "./scoring";
import { isIndividualBettingEligible, isModelEligible } from "./playerEligibility";
import {
  BettingMarketType,
  BettingMarket,
  Game,
  GameLineup,
  GamePlayerStat,
  LeagueData,
  MatchEvent,
  Player,
  TeamCode
} from "./types";

export const BETTING_MODEL_VERSION = "player-lineup-v1.1";
const PRIOR_APPEARANCES = 5;
const RECENCY_HALF_LIFE_DAYS = 56;
const DEFAULT_TEAM_GOALS = 4;
const DEFAULT_KEEPER_SAVES = 4;

export type GeneratedOutcome = {
  outcome_key: string;
  label: string;
  fair_probability: number;
  offered_odds: number;
};

export type GeneratedMarket = {
  market_key: string;
  market_type: BettingMarketType;
  title: string;
  subject_player_id: string | null;
  subject_team: TeamCode | null;
  line: number | null;
  outcomes: GeneratedOutcome[];
};

type PlayerModel = {
  playerId: string;
  name: string;
  appearances: number;
  weightedAppearances: number;
  goalRate: number;
  assistRate: number;
  saveRate: number;
  concededRate: number;
};

type HistoricalAppearance = {
  gameId: string;
  playerId: string;
  team: TeamCode;
  weight: number;
  goals: number;
  assists: number;
  saves: number;
  conceded: number;
  goalDifference: number;
};

export type BettingModelResult = {
  markets: GeneratedMarket[];
  snapshot: Record<string, unknown>;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function recencyWeight(gameDate: string, targetDate: string) {
  const elapsedDays = Math.max(0, (new Date(targetDate).getTime() - new Date(gameDate).getTime()) / 86_400_000);
  return 0.5 ** (elapsedDays / RECENCY_HALF_LIFE_DAYS);
}

function playerGameTotals(playerId: string, events: MatchEvent[], stats: GamePlayerStat[]) {
  const manual = stats.find(stat => stat.player_id === playerId);
  return {
    goals: events.filter(event => event.event_type === "goal" && event.player_id === playerId).length + (manual?.goals || 0),
    assists: events.filter(event => event.event_type === "goal" && event.assist_player_id === playerId).length + (manual?.assists || 0),
    saves: manual?.saves || 0
  };
}

function poissonProbability(lambda: number, value: number) {
  let factorial = 1;
  for (let index = 2; index <= value; index += 1) factorial *= index;
  return Math.exp(-lambda) * lambda ** value / factorial;
}

function poissonUnder(lambda: number, line: number) {
  const lastUnderValue = Math.floor(line);
  let probability = 0;
  for (let value = 0; value <= lastUnderValue; value += 1) probability += poissonProbability(lambda, value);
  return clamp(probability, 0.01, 0.99);
}

function resultProbabilities(expectedA: number, expectedB: number) {
  let teamA = 0;
  let draw = 0;
  let teamB = 0;
  for (let scoreA = 0; scoreA <= 20; scoreA += 1) {
    for (let scoreB = 0; scoreB <= 20; scoreB += 1) {
      const probability = poissonProbability(expectedA, scoreA) * poissonProbability(expectedB, scoreB);
      if (scoreA > scoreB) teamA += probability;
      else if (scoreB > scoreA) teamB += probability;
      else draw += probability;
    }
  }
  const total = teamA + draw + teamB;
  return { A: teamA / total, draw: draw / total, B: teamB / total };
}

function oddsFromProbability(probability: number, margin: number) {
  return Math.max(1.01, round(1 / (clamp(probability, 0.005, 0.995) * (1 + margin)), 2));
}

function twoWayOutcomes(overProbability: number, margin: number, line: number): GeneratedOutcome[] {
  const over = clamp(overProbability, 0.01, 0.99);
  const under = 1 - over;
  return [
    { outcome_key: "over", label: `Over ${line}`, fair_probability: round(over, 8), offered_odds: oddsFromProbability(over, margin) },
    { outcome_key: "under", label: `Under ${line}`, fair_probability: round(under, 8), offered_odds: oddsFromProbability(under, margin) }
  ];
}

function pairKey(first: string, second: string) {
  return [first, second].sort().join(":");
}

function teamSynergy(team: GameLineup[], historicalGames: Game[], historicalLineups: GameLineup[], appearances: HistoricalAppearance[]) {
  const values: number[] = [];
  for (let firstIndex = 0; firstIndex < team.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < team.length; secondIndex += 1) {
      const firstId = team[firstIndex].player_id;
      const secondId = team[secondIndex].player_id;
      const shared: { weight: number; goalDifference: number }[] = [];
      for (const game of historicalGames) {
        const first = historicalLineups.find(lineup => lineup.game_id === game.id && lineup.player_id === firstId);
        const second = historicalLineups.find(lineup => lineup.game_id === game.id && lineup.player_id === secondId);
        if (!first || !second || first.team !== second.team) continue;
        const appearance = appearances.find(item => item.gameId === game.id && item.playerId === firstId);
        if (appearance) shared.push({ weight: appearance.weight, goalDifference: appearance.goalDifference });
      }
      if (!shared.length) continue;
      const weight = shared.reduce((total, item) => total + item.weight, 0);
      const weightedDifference = shared.reduce((total, item) => total + item.goalDifference * item.weight, 0) / weight;
      const reliability = weight / (weight + 5);
      values.push(clamp(weightedDifference * reliability, -2, 2));
    }
  }
  if (!values.length) return 1;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  return clamp(Math.exp(average * 0.08), 0.88, 1.12);
}

function centralHalfLine(expectedValue: number, minimum = 0.5) {
  return Math.max(minimum, Math.floor(expectedValue) + 0.5);
}

function halfLineRange(expectedValue: number, offsets: number[], minimum = 0.5) {
  const center = centralHalfLine(expectedValue, minimum);
  const lines = [...new Set(offsets.map(offset => Math.max(minimum, center + offset)))]
    .sort((first, second) => first - second);
  const positiveSteps = offsets.slice(1).map((offset, index) => Math.abs(offset - offsets[index])).filter(Boolean);
  const step = positiveSteps.length ? Math.min(...positiveSteps) : 1;
  while (lines.length < offsets.length) lines.push(lines[lines.length - 1] + step);
  return lines;
}

function playerLabel(player: Player | undefined) {
  return player?.name || "Unknown player";
}

export function generatePlayerLineupMarkets(data: LeagueData, game: Game, singleMargin = 0.06): BettingModelResult {
  const generatedAt = new Date().toISOString();
  const targetLineups = data.lineups.filter(lineup => lineup.game_id === game.id);
  const teamA = targetLineups.filter(lineup => lineup.team === "A");
  const teamB = targetLineups.filter(lineup => lineup.team === "B");
  if (teamA.length !== 5 || teamB.length !== 5) throw new Error("Save exactly five players on each team before generating odds.");

  const historicalGames = data.games
    .filter(item => item.status === "final" && item.id !== game.id && new Date(item.game_date) < new Date(game.game_date))
    .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime());
  const historicalGameIds = new Set(historicalGames.map(item => item.id));
  const historicalLineups = data.lineups.filter(lineup => historicalGameIds.has(lineup.game_id));
  const appearances: HistoricalAppearance[] = [];
  let weightedTeamGoals = 0;
  let weightedTeamSamples = 0;
  let weightedOwnGoals = 0;
  let weightedGameSamples = 0;

  for (const historicalGame of historicalGames) {
    const lineups = historicalLineups.filter(lineup => lineup.game_id === historicalGame.id);
    const events = data.events.filter(event => event.game_id === historicalGame.id);
    const stats = data.playerStats.filter(stat => stat.game_id === historicalGame.id);
    const score = calculateScore(events, lineups, stats);
    const weight = recencyWeight(historicalGame.game_date, game.game_date);
    weightedTeamGoals += (score.A + score.B) * weight;
    weightedTeamSamples += 2 * weight;
    weightedOwnGoals += (
      events.filter(event => event.event_type === "own_goal").length
      + stats.reduce((total, stat) => total + (stat.own_goals || 0), 0)
    ) * weight;
    weightedGameSamples += weight;
    for (const lineup of lineups) {
      const player = data.players.find(item => item.id === lineup.player_id);
      if (!isModelEligible(player)) continue;
      const totals = playerGameTotals(lineup.player_id, events, stats);
      appearances.push({
        gameId: historicalGame.id,
        playerId: lineup.player_id,
        team: lineup.team,
        weight,
        goals: totals.goals,
        assists: totals.assists,
        saves: totals.saves,
        conceded: score[otherTeam(lineup.team)],
        goalDifference: score[lineup.team] - score[otherTeam(lineup.team)]
      });
    }
  }

  const leagueTeamGoals = weightedTeamSamples ? weightedTeamGoals / weightedTeamSamples : DEFAULT_TEAM_GOALS;
  const leaguePlayerGoals = leagueTeamGoals / 5;
  const totalWeightedAssists = appearances.reduce((total, item) => total + item.assists * item.weight, 0);
  const totalWeightedAppearances = appearances.reduce((total, item) => total + item.weight, 0);
  const leaguePlayerAssists = totalWeightedAppearances ? totalWeightedAssists / totalWeightedAppearances : leaguePlayerGoals * 0.65;
  const keeperAppearances = appearances.filter(item => historicalLineups.find(lineup => lineup.game_id === item.gameId && lineup.player_id === item.playerId)?.role === "goalkeeper");
  const keeperWeight = keeperAppearances.reduce((total, item) => total + item.weight, 0);
  const leagueKeeperSaves = keeperWeight ? keeperAppearances.reduce((total, item) => total + item.saves * item.weight, 0) / keeperWeight : DEFAULT_KEEPER_SAVES;

  const targetPlayerIds = new Set(targetLineups.map(lineup => lineup.player_id));
  const models = new Map<string, PlayerModel>();
  for (const playerId of targetPlayerIds) {
    const player = data.players.find(item => item.id === playerId);
    const playerAppearances = isModelEligible(player) ? appearances.filter(item => item.playerId === playerId) : [];
    const weightedAppearances = playerAppearances.reduce((total, item) => total + item.weight, 0);
    const appearanceCount = new Set(playerAppearances.map(item => item.gameId)).size;
    const smoothed = (field: "goals" | "assists" | "saves" | "conceded", prior: number) => (
      playerAppearances.reduce((total, item) => total + item[field] * item.weight, 0) + prior * PRIOR_APPEARANCES
    ) / (weightedAppearances + PRIOR_APPEARANCES);
    models.set(playerId, {
      playerId,
      name: playerLabel(player),
      appearances: appearanceCount,
      weightedAppearances: round(weightedAppearances),
      goalRate: smoothed("goals", leaguePlayerGoals),
      assistRate: smoothed("assists", leaguePlayerAssists),
      saveRate: smoothed("saves", leagueKeeperSaves),
      concededRate: smoothed("conceded", leagueTeamGoals)
    });
  }

  const expectedForTeam = (team: GameLineup[], opponent: GameLineup[]) => {
    const teamModels = team.map(lineup => models.get(lineup.player_id)!);
    const goalIndex = teamModels.reduce((total, model) => total + model.goalRate, 0) / Math.max(leagueTeamGoals, 0.1);
    const expectedTeamAssists = leaguePlayerAssists * 5;
    const assistIndex = teamModels.reduce((total, model) => total + model.assistRate, 0) / Math.max(expectedTeamAssists, 0.1);
    const opponentKeeper = opponent.find(lineup => lineup.role === "goalkeeper");
    const keeperModel = opponentKeeper ? models.get(opponentKeeper.player_id) : null;
    const keeperConcessionIndex = (keeperModel?.concededRate || leagueTeamGoals) / Math.max(leagueTeamGoals, 0.1);
    const eligibleTeam = team.filter(lineup => isModelEligible(data.players.find(player => player.id === lineup.player_id)));
    const synergy = teamSynergy(eligibleTeam, historicalGames, historicalLineups, appearances);
    const attackIndex = goalIndex * 0.78 + assistIndex * 0.22;
    return clamp(leagueTeamGoals * attackIndex ** 0.72 * keeperConcessionIndex ** 0.28 * synergy, 0.5, 12);
  };

  const expectedA = expectedForTeam(teamA, teamB);
  const expectedB = expectedForTeam(teamB, teamA);
  const matchResult = resultProbabilities(expectedA, expectedB);
  const markets: GeneratedMarket[] = [];
  markets.push({
    market_key: "match-result",
    market_type: "match_result",
    title: "Match result",
    subject_player_id: null,
    subject_team: null,
    line: null,
    outcomes: [
      { outcome_key: "A", label: "Team A", fair_probability: round(matchResult.A, 8), offered_odds: oddsFromProbability(matchResult.A, singleMargin) },
      { outcome_key: "draw", label: "Draw", fair_probability: round(matchResult.draw, 8), offered_odds: oddsFromProbability(matchResult.draw, singleMargin) },
      { outcome_key: "B", label: "Team B", fair_probability: round(matchResult.B, 8), offered_odds: oddsFromProbability(matchResult.B, singleMargin) }
    ]
  });

  const expectedTotal = expectedA + expectedB;
  for (const totalLine of halfLineRange(expectedTotal, [-4, -2, 0, 2, 4])) {
    markets.push({
      market_key: `total-goals-${totalLine}`,
      market_type: "total_goals",
      title: "Total goals",
      subject_player_id: null,
      subject_team: null,
      line: totalLine,
      outcomes: twoWayOutcomes(1 - poissonUnder(expectedTotal, totalLine), singleMargin, totalLine)
    });
  }

  for (const lineup of targetLineups) {
    const model = models.get(lineup.player_id)!;
    const player = data.players.find(item => item.id === lineup.player_id);
    if (!isIndividualBettingEligible(player)) continue;
    const teamExpected = lineup.team === "A" ? expectedA : expectedB;
    const teammateModels = (lineup.team === "A" ? teamA : teamB).map(item => models.get(item.player_id)!);
    const goalRateTotal = teammateModels.reduce((total, item) => total + Math.max(item.goalRate, 0.05), 0);
    const assistRateTotal = teammateModels.reduce((total, item) => total + Math.max(item.assistRate, 0.03), 0);
    const expectedGoals = teamExpected * Math.max(model.goalRate, 0.05) / goalRateTotal;
    const expectedAssists = teamExpected * 0.72 * Math.max(model.assistRate, 0.03) / assistRateTotal;
    for (const goalLine of [0.5, 1.5, 2.5, 3.5]) {
      markets.push({
        market_key: `player-goals-${lineup.player_id}-${goalLine}`,
        market_type: "player_goals",
        title: `${playerLabel(player)} goals`,
        subject_player_id: lineup.player_id,
        subject_team: null,
        line: goalLine,
        outcomes: twoWayOutcomes(1 - poissonUnder(expectedGoals, goalLine), singleMargin, goalLine)
      });
    }
    for (const assistLine of [0.5, 1.5, 2.5]) {
      markets.push({
        market_key: `player-assists-${lineup.player_id}-${assistLine}`,
        market_type: "player_assists",
        title: `${playerLabel(player)} assists`,
        subject_player_id: lineup.player_id,
        subject_team: null,
        line: assistLine,
        outcomes: twoWayOutcomes(1 - poissonUnder(expectedAssists, assistLine), singleMargin, assistLine)
      });
    }
    if (lineup.role === "goalkeeper") {
      const opponentExpected = lineup.team === "A" ? expectedB : expectedA;
      const expectedSaves = clamp(model.saveRate * 0.65 + opponentExpected * 0.55, 0.5, 15);
      for (const saveLine of halfLineRange(expectedSaves, [-2, 0, 2])) {
        markets.push({
          market_key: `goalkeeper-saves-${lineup.player_id}-${saveLine}`,
          market_type: "goalkeeper_saves",
          title: `${playerLabel(player)} saves`,
          subject_player_id: lineup.player_id,
          subject_team: null,
          line: saveLine,
          outcomes: twoWayOutcomes(1 - poissonUnder(expectedSaves, saveLine), singleMargin, saveLine)
        });
      }
    }
  }

  const weightedTeamSaves = historicalGames.reduce((total, historicalGame) => {
    const weight = recencyWeight(historicalGame.game_date, game.game_date);
    const saves = data.playerStats
      .filter(stat => stat.game_id === historicalGame.id)
      .reduce((sum, stat) => sum + stat.saves, 0);
    return total + saves * weight;
  }, 0);
  const leagueTeamSaves = weightedGameSamples ? weightedTeamSaves / (weightedGameSamples * 2) : DEFAULT_KEEPER_SAVES;
  const expectedTeamSaves: Record<TeamCode, number> = {
    A: clamp(leagueTeamSaves * 0.65 + expectedB * 0.45, 0.5, 18),
    B: clamp(leagueTeamSaves * 0.65 + expectedA * 0.45, 0.5, 18)
  };
  for (const team of ["A", "B"] as TeamCode[]) {
    for (const saveLine of halfLineRange(expectedTeamSaves[team], [-2, 0, 2])) {
      markets.push({
        market_key: `team-saves-${team}-${saveLine}`,
        market_type: "team_saves",
        title: `Team ${team} total saves`,
        subject_player_id: null,
        subject_team: team,
        line: saveLine,
        outcomes: twoWayOutcomes(1 - poissonUnder(expectedTeamSaves[team], saveLine), singleMargin, saveLine)
      });
    }
  }

  const ownGoalProbability = clamp((weightedOwnGoals + 0.5) / (weightedGameSamples + 8), 0.02, 0.35);
  markets.push({
    market_key: "any-own-goal",
    market_type: "own_goal",
    title: "Any own goal",
    subject_player_id: null,
    subject_team: null,
    line: null,
    outcomes: [
      { outcome_key: "yes", label: "Yes", fair_probability: round(ownGoalProbability, 8), offered_odds: oddsFromProbability(ownGoalProbability, singleMargin) },
      { outcome_key: "no", label: "No", fair_probability: round(1 - ownGoalProbability, 8), offered_odds: oddsFromProbability(1 - ownGoalProbability, singleMargin) }
    ]
  });

  const serializeTeam = (lineups: GameLineup[]) => lineups.map(lineup => ({
    player_id: lineup.player_id,
    role: lineup.role,
    player_type: data.players.find(player => player.id === lineup.player_id)?.player_type || (isModelEligible(data.players.find(player => player.id === lineup.player_id)) ? "regular" : "guest"),
    model_eligible: isModelEligible(data.players.find(player => player.id === lineup.player_id)),
    individual_betting_eligible: isIndividualBettingEligible(data.players.find(player => player.id === lineup.player_id)),
    model: models.get(lineup.player_id)
  }));
  return {
    markets,
    snapshot: {
      snapshot_schema_version: 2,
      model_version: BETTING_MODEL_VERSION,
      generated_for_game_id: game.id,
      generated_at: generatedAt,
      kickoff_at: game.game_date,
      methodology: "Bayesian-smoothed player rates with recency weighting, goalkeeper opposition adjustment, lineup strength, and teammate-pair performance",
      synthetic_data_policy: "No synthetic matches or external match results are used. Fixed neutral constants are used only when real history is unavailable.",
      priors: { appearances: PRIOR_APPEARANCES, recency_half_life_days: RECENCY_HALF_LIFE_DAYS },
      history: {
        completed_games: historicalGames.length,
        effective_game_weight: round(weightedGameSamples),
        game_ids: historicalGames.map(item => item.id),
        latest_game_date: historicalGames.at(-1)?.game_date || null
      },
      league_averages: { team_goals: round(leagueTeamGoals), player_goals: round(leaguePlayerGoals), player_assists: round(leaguePlayerAssists), goalkeeper_saves: round(leagueKeeperSaves) },
      predictions: {
        expected_goals_A: round(expectedA),
        expected_goals_B: round(expectedB),
        total: round(expectedTotal),
        probability_A: round(matchResult.A, 8),
        probability_draw: round(matchResult.draw, 8),
        probability_B: round(matchResult.B, 8)
      },
      team_A: serializeTeam(teamA),
      team_B: serializeTeam(teamB),
      pair_key_example: targetLineups.length > 1 ? pairKey(targetLineups[0].player_id, targetLineups[1].player_id) : null
    }
  };
}

export function quoteBuilderOdds(outcomeOdds: number[], builderMargin = 0.1) {
  if (!outcomeOdds.length) return 1;
  const product = outcomeOdds.reduce((total, odds) => total * odds, 1);
  if (outcomeOdds.length === 1) return round(product, 4);
  return round(Math.max(1.01, 1 + (product - 1) * (1 - builderMargin)), 4);
}

export function bettingSelectionGroup(market: Pick<BettingMarket, "market_type" | "subject_player_id" | "subject_team">) {
  return `${market.market_type}:${market.subject_player_id || market.subject_team || "game"}`;
}

export function coinsFromUnits(units: number) {
  return units / 100;
}

export function formatCoins(units: number) {
  return coinsFromUnits(units).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
