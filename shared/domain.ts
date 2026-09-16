export type DataSourceStatus =
  | "LIVE"
  | "FRESH"
  | "VERIFIED"
  | "STALE"
  | "FALLBACK"
  | "UNAVAILABLE"
  | "ERROR";

export type Team = {
  id: string;
  name: string;
  shortName?: string | null;
  logo?: string | null;
};

export type Player = {
  id: string;
  name: string;
  teamId?: string | null;
  position?: string | null;
  jersey?: string | null;
  photo?: string | null;
};

export type Competition = {
  id: string;
  name: string;
  providerIds?: Record<string, string>;
  supportsStandings: boolean;
};

export type Season = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
};

export type Standing = {
  rank: number;
  team: Team;
  played: number | null;
  points: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalDifference: number | null;
  form: string;
};

export type Scorer = {
  player: Player;
  team: Team;
  goals: number | null;
  assists?: number | null;
};

export type MatchEvent = {
  type: string;
  minute?: string;
  team?: string;
  player?: string;
  assist?: string;
  detail?: string;
};

export type Lineup = {
  team: Team;
  formation: string | null;
  players: Array<Player & { starter: boolean; status: string | null }>;
};

export type PlayerMatchStats = {
  player: Player;
  team: Team;
  starter: boolean;
  minutes: number | null;
  stats: Record<string, string | number>;
  source: string;
};

export type MatchStats = Record<string, string | number>;

export type Match = {
  providerId: string;
  competition: string;
  seasonId?: string | null;
  homeTeam: Team;
  awayTeam: Team;
  startTimeUtc: number;
  status:
    | "scheduled"
    | "live"
    | "completed"
    | "postponed"
    | "cancelled"
    | "unknown";
  homeScore: number | null;
  awayScore: number | null;
  events: MatchEvent[];
  stats: MatchStats;
  lineups: Lineup[] | null;
  playerStats: PlayerMatchStats[];
  dataState: DataSourceStatus;
};

export type PollableMatch = Pick<Match, "status" | "startTimeUtc"> &
  Partial<Pick<Match, "dataState">>;

/**
 * Polling cadence for a single match. Values are deliberately conservative
 * for public APIs: live matches get frequent updates, fixtures close to
 * kickoff remain responsive, and distant/inactive records are inexpensive.
 */
export function getMatchPollingIntervalMs(
  match: PollableMatch,
  now = Date.now()
): number {
  if (match.status === "live") return 15_000;
  if (match.dataState === "LIVE") return 15_000;
  if (match.status === "scheduled") {
    const untilKickoff = match.startTimeUtc - now;
    if (untilKickoff <= 30 * 60 * 1000) return 30_000;
    if (untilKickoff <= 24 * 60 * 60 * 1000) return 60_000;
    return 5 * 60_000;
  }
  return 5 * 60_000;
}

/** Returns the fastest needed cadence for the currently visible dataset. */
export function getBundlePollingIntervalMs(
  matches: PollableMatch[],
  now = Date.now()
): number {
  if (!matches.length) return 5 * 60_000;
  return Math.min(
    ...matches.map(match => getMatchPollingIntervalMs(match, now))
  );
}

export function isFreshDataState(state?: string | null): boolean {
  return state === "LIVE" || state === "FRESH" || state === "VERIFIED";
}
