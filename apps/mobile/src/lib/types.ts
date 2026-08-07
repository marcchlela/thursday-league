export type Profile = {
  id: string;
  username: string;
  avatar_path?: string | null;
  account_status?: 'active' | 'deactivated' | 'deleted';
  last_active_league_id?: string | null;
};

export type LeagueRole = 'owner' | 'admin' | 'member';

export type LeagueMembership = {
  id: string;
  league_id: string;
  user_id: string;
  role: LeagueRole;
  status: 'active' | 'removed' | 'left';
  joined_at: string;
};

export type League = {
  id: string;
  name: string;
  slug: string;
  join_code: string;
  timezone: string;
  fantasy_enabled: boolean;
  betting_enabled: boolean;
  status: 'active' | 'archived';
};

export type LeaguePreview = {
  id: string;
  name: string;
  slug: string;
  member_count: number;
  fantasy_enabled: boolean;
  betting_enabled: boolean;
  already_member: boolean;
  expires_at?: string;
};

export type JoinRequest = {
  id: string;
  league_id: string;
  league_name?: string;
  league_slug?: string;
  user_id?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
  requested_at?: string;
};

export type TeamCode = 'A' | 'B';
export type PlayerPosition = 'goalkeeper' | 'outfield';
export type GameStatus = 'upcoming' | 'draft' | 'live' | 'final';

export type Player = {
  id: string;
  league_id: string;
  name: string;
  default_position: PlayerPosition;
  active: boolean;
  player_type?: 'regular' | 'guest';
  fantasy_eligible?: boolean;
  individual_betting_eligible?: boolean;
  competition_eligible?: boolean;
  archived_at?: string | null;
};

export type Game = {
  id: string;
  league_id: string;
  game_date: string;
  status: GameStatus;
  potm_player_id: string | null;
  notes?: string | null;
  season_id?: string | null;
  team_a_goalkeeper_mode?: 'fixed' | 'rotating';
  team_b_goalkeeper_mode?: 'fixed' | 'rotating';
};

export type GameLineup = {
  id: string;
  league_id: string;
  game_id: string;
  player_id: string;
  team: TeamCode;
  role: PlayerPosition;
  slot_index?: number | null;
};

export type MatchEvent = {
  id: string;
  league_id: string;
  game_id: string;
  event_type: 'goal' | 'own_goal';
  player_id: string;
  assist_player_id: string | null;
  minute: number | null;
};

export type GamePlayerStat = {
  id: string;
  league_id: string;
  game_id: string;
  player_id: string;
  team: TeamCode;
  role: PlayerPosition;
  goals: number;
  assists: number;
  saves: number;
  own_goals?: number;
};

export type FantasySquad = {
  id: string;
  league_id: string;
  user_id: string;
  game_id: string;
};

export type FantasyPick = {
  id: string;
  league_id: string;
  squad_id: string;
  player_id: string;
  role: PlayerPosition;
  is_captain: boolean;
  slot_index: number;
};

export type Season = {
  id: string;
  league_id: string;
  name: string;
  format: 'yearly' | 'custom';
  start_date: string;
  end_date: string;
};

export type BettingMarket = {
  id: string;
  league_id: string;
  game_id: string;
  market_key: string;
  market_type: string;
  title: string;
  subject_player_id: string | null;
  subject_team?: TeamCode | null;
  line: number | null;
  status: 'draft' | 'open' | 'suspended' | 'locked' | 'settled' | 'void';
  invalidated: boolean;
};

export type BettingOutcome = {
  id: string;
  league_id: string;
  market_id: string;
  outcome_key: string;
  label: string;
  fair_probability: number;
  offered_odds: number;
};

export type BettingWallet = {
  id: string;
  league_id: string;
  user_id: string;
  season_id: string;
  balance_units: number;
};

export type BetSlip = {
  id: string;
  league_id: string;
  user_id: string;
  wallet_id: string;
  game_id: string;
  season_id: string;
  slip_type: 'single' | 'builder';
  stake_units: number;
  accepted_odds: number;
  potential_payout_units: number;
  settled_payout_units: number | null;
  status: 'pending' | 'won' | 'lost' | 'void' | 'cashed_out';
  placed_at: string;
};
