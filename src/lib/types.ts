export type PlayerPosition = "goalkeeper" | "outfield";
export type TeamCode = "A" | "B";
export type GameStatus = "upcoming" | "draft" | "live" | "final";
export type EventKind = "goal" | "own_goal";

export type Profile = {
  id: string;
  username: string;
  is_admin: boolean;
  created_at?: string;
};

export type Player = {
  id: string;
  name: string;
  default_position: PlayerPosition;
  active: boolean;
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
  created_at?: string;
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
