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
  created_at?: string;
};

export type Game = {
  id: string;
  game_date: string;
  status: GameStatus;
  potm_player_id: string | null;
  notes?: string | null;
  created_at?: string;
};

export type GameLineup = {
  id: string;
  game_id: string;
  player_id: string;
  team: TeamCode;
  role: PlayerPosition;
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
