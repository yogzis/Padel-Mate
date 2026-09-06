export type TeamId = 'blue' | 'red';
export type PointScore = '0' | '15' | '30' | '40' | 'A';
export type DeuceRule = 'classic-advantage' | 'golden-point' | 'star-point';
export type SetWinRule = 'standard-set' | 'short-set';
export type TieBreakRule = 'standard-tiebreak' | 'deciding-game' | 'no-tiebreak';

export type ActivityConfig = {
  deuceRule: DeuceRule;
  setWinRule: SetWinRule;
  tieBreakRule: TieBreakRule;
  pointsFormula: 'default-margin';
};

export type GameSnapshot = {
  blueScore: PointScore;
  redScore: PointScore;
  deuceReturnCount: number;
  decisivePointActive: boolean;
};

export type LiveActivityState = GameSnapshot & {
  phase: 'set-setup' | 'live' | 'ended';
  setNumber: number;
  activeSetId: string | null;
  currentGameId: string | null;
  bluePlayerIds: string[];
  redPlayerIds: string[];
  blueGames: number;
  redGames: number;
  pendingGameWinner: TeamId | null;
  pendingSetWinner: TeamId | null;
  history: GameSnapshot[];
};

/** Shares its id with the better-auth user account; they are one identity. */
export type Player = {
  id: string;
  name: string;
  createdAt: string;
};

export type Mate = Player;

/** A match slot holds either a registered player id or a `guest:N` id. */
export type MatchSlotId = string;

export const MATE_INVITE_LIFETIME_MS = 30 * 60 * 1000;

export type MateInviteLink = {
  token: string;
  url: string;
  createdAt: string;
  expiresAt: string;
};

export type ContextSummary = {
  id: string;
  name: string;
  playerIds: string[];
  createdAt: string;
};

export type LeaderboardEntry = {
  playerId: string;
  playerName: string;
  totalPoints: number;
  setsPlayed: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  gameDifferential: number;
};

export type SetLogEntry = {
  id: string;
  activityId: string;
  activityNumber: number;
  activityDate: string;
  setNumber: number;
  bluePlayerIds: string[];
  redPlayerIds: string[];
  blueGames: number;
  redGames: number;
  winnerTeam: TeamId | null;
  conclusionType: 'normal' | 'manual-partial' | 'disregarded' | 'abandoned';
  createdAt: string;
};

export type ScoreEvent = {
  id: string;
  action: 'point' | 'undo' | 'cancel-game';
  team: TeamId | null;
  previousSnapshot: GameSnapshot;
  nextSnapshot: GameSnapshot;
  deviceLabel: string;
  sequenceNumber: number;
  createdAt: string;
};

export const EMPTY_LIVE_STATE: LiveActivityState = {
  phase: 'set-setup',
  setNumber: 1,
  activeSetId: null,
  currentGameId: null,
  bluePlayerIds: [],
  redPlayerIds: [],
  blueGames: 0,
  redGames: 0,
  blueScore: '0',
  redScore: '0',
  deuceReturnCount: 0,
  decisivePointActive: false,
  pendingGameWinner: null,
  pendingSetWinner: null,
  history: [],
};
