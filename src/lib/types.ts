export type PlayerPosition = "goalkeeper" | "outfield";
export type PlayerType = "regular" | "guest";
export type TeamCode = "A" | "B";
export type GoalkeeperMode = "fixed" | "rotating";
export type GameStatus = "upcoming" | "draft" | "live" | "final";
export type EventKind = "goal" | "own_goal";

export type Profile = {
  id: string;
  username: string;
  is_admin: boolean;
  avatar_path?: string | null;
  account_status?: "active" | "deactivated" | "deleted";
  deactivated_at?: string | null;
  deleted_at?: string | null;
  created_at?: string;
};

export type Player = {
  id: string;
  name: string;
  default_position: PlayerPosition;
  active: boolean;
  player_type?: PlayerType;
  fantasy_eligible?: boolean;
  individual_betting_eligible?: boolean;
  /** @deprecated Compatibility field for app versions before the eligibility split. */
  competition_eligible?: boolean;
  archived_at?: string | null;
  created_at?: string;
};

export type Game = {
  id: string;
  game_date: string;
  status: GameStatus;
  potm_player_id: string | null;
  notes?: string | null;
  finalized_at?: string | null;
  correction_open?: boolean;
  correction_reason?: string | null;
  team_a_goalkeeper_mode?: GoalkeeperMode;
  team_b_goalkeeper_mode?: GoalkeeperMode;
  season_id?: string | null;
  created_at?: string;
};

export type Season = {
  id: string;
  name: string;
  format: "yearly" | "custom";
  start_date: string;
  end_date: string;
  created_at?: string;
};

export type LeagueSettings = {
  id: number;
  season_mode: "yearly" | "custom";
  current_season_id: string | null;
  updated_at?: string;
};

export type GameLineup = {
  id: string;
  game_id: string;
  player_id: string;
  team: TeamCode;
  role: PlayerPosition;
  slot_index?: number | null;
  created_at?: string;
};

export type MatchEvent = {
  id: string;
  game_id: string;
  event_type: EventKind;
  player_id: string;
  assist_player_id: string | null;
  minute: number | null;
  created_at?: string;
};

export type GamePlayerStat = {
  id: string;
  game_id: string;
  player_id: string;
  team: TeamCode;
  role: PlayerPosition;
  goals: number;
  assists: number;
  saves: number;
  own_goals?: number;
  created_at?: string;
  updated_at?: string;
};

export type AdminAuditLog = {
  id: string;
  admin_user_id: string | null;
  game_id: string | null;
  action: string;
  reason: string | null;
  before_data: Record<string, unknown> | unknown[] | null;
  after_data: Record<string, unknown> | unknown[] | null;
  created_at: string;
};

export type FantasySquad = {
  id: string;
  user_id: string;
  game_id: string;
  created_at?: string;
  updated_at?: string;
};

export type FantasyPick = {
  id: string;
  squad_id: string;
  player_id: string;
  role: PlayerPosition;
  is_captain: boolean;
  slot_index: number;
  created_at?: string;
};

export type LeagueData = {
  profiles: Profile[];
  players: Player[];
  games: Game[];
  lineups: GameLineup[];
  events: MatchEvent[];
  playerStats: GamePlayerStat[];
  squads: FantasySquad[];
  picks: FantasyPick[];
  seasons: Season[];
  leagueSettings: LeagueSettings | null;
};

export type BettingMarketType =
  | "match_result"
  | "total_goals"
  | "player_goals"
  | "player_assists"
  | "goalkeeper_saves"
  | "team_saves"
  | "own_goal";

export type BettingMarketStatus = "draft" | "open" | "suspended" | "locked" | "settled" | "void";
export type BetLegStatus = "pending" | "won" | "lost" | "void";
export type BetSlipStatus = BetLegStatus | "cashed_out";

export type BettingSettings = {
  id: number;
  starting_balance_units: number;
  lock_minutes: number;
  single_margin: number;
  builder_margin: number;
  model_version: string;
  updated_at?: string;
};

export type OddsGenerationRun = {
  id: string;
  game_id: string;
  model_version: string;
  input_snapshot: Record<string, unknown>;
  generated_by: string | null;
  created_at: string;
};

export type BettingMarket = {
  id: string;
  game_id: string;
  generation_run_id: string;
  market_key: string;
  market_type: BettingMarketType;
  title: string;
  subject_player_id: string | null;
  subject_team?: TeamCode | null;
  line: number | null;
  status: BettingMarketStatus;
  invalidated: boolean;
  created_at: string;
  updated_at: string;
};

export type BettingOutcome = {
  id: string;
  market_id: string;
  outcome_key: string;
  label: string;
  fair_probability: number;
  offered_odds: number;
  created_at: string;
  updated_at: string;
};

export type BettingWallet = {
  id: string;
  user_id: string;
  season_id: string;
  balance_units: number;
  created_at: string;
  updated_at: string;
};

export type BetSlip = {
  id: string;
  user_id: string;
  wallet_id: string;
  game_id: string;
  season_id: string;
  slip_type: "single" | "builder";
  stake_units: number;
  accepted_odds: number;
  potential_payout_units: number;
  settled_payout_units: number | null;
  status: BetSlipStatus;
  request_id: string;
  placed_at: string;
  settled_at: string | null;
  result_version_id: string | null;
};

export type BetLeg = {
  id: string;
  slip_id: string;
  market_id: string;
  outcome_id: string;
  accepted_odds: number;
  fair_probability: number;
  status: BetLegStatus;
  result_value: number | null;
  created_at: string;
};

export type CoinLedgerEntry = {
  id: string;
  wallet_id: string;
  slip_id: string | null;
  entry_type: "initial_grant" | "stake" | "cashout" | "payout" | "settlement_correction" | "admin_adjustment";
  amount_units: number;
  balance_after_units: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type GameResultVersion = {
  id: string;
  game_id: string;
  version_number: number;
  score_a: number;
  score_b: number;
  own_goal_count: number;
  player_totals: Record<string, { team: TeamCode; role: PlayerPosition; goals: number; assists: number; saves: number; own_goals: number }>;
  source_summary: Record<string, unknown>;
  correction_reason: string | null;
  created_at: string;
};

export type BetSettlementRun = {
  id: string;
  game_id: string;
  result_version_id: string;
  settled_by: string | null;
  slips_processed: number;
  slips_won: number;
  slips_lost: number;
  slips_void: number;
  total_adjustment_units: number;
  created_at: string;
};

export type BettingData = {
  settings: BettingSettings | null;
  generations: OddsGenerationRun[];
  markets: BettingMarket[];
  outcomes: BettingOutcome[];
  wallets: BettingWallet[];
  slips: BetSlip[];
  legs: BetLeg[];
  ledger: CoinLedgerEntry[];
  resultVersions: GameResultVersion[];
  settlementRuns: BetSettlementRun[];
};

export type BettingStanding = {
  user_id: string;
  username: string;
  balance_units: number;
  settled_profit_units: number;
  total_bets: number;
  settled_bets: number;
  won_bets: number;
};

export type PlayerBreakdown = {
  playerId: string;
  playerName: string;
  team?: TeamCode;
  role?: PlayerPosition;
  isCaptain: boolean;
  pointsBeforeCaptain: number;
  points: number;
  lines: string[];
};

export type WeeklyFantasyResult = {
  userId: string;
  username: string;
  squadId?: string;
  points: number;
  rank: number;
  breakdown: PlayerBreakdown[];
};
