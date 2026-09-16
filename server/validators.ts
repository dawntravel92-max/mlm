import { z } from "zod";

const externalRecord = z.record(z.string(), z.unknown());
const externalObject = z.object({}).catchall(z.unknown());

const matchStatus = z.enum([
  "scheduled",
  "live",
  "completed",
  "postponed",
  "cancelled",
  "unknown",
]);
const dataState = z.enum([
  "LIVE",
  "FRESH",
  "VERIFIED",
  "STALE",
  "FALLBACK",
  "UNAVAILABLE",
  "ERROR",
]);
const flexibleStats = z.record(z.string(), z.union([z.string(), z.number()]));
const matchEvent = z.object({
  type: z.string(),
  minute: z.string().optional(),
  team: z.string().optional(),
  player: z.string().optional(),
  assist: z.string().optional(),
  detail: z.string().optional(),
});

/** Canonical application record. External provider payloads are loose, but persistence is not. */
export const persistedMatchSchema = z.object({
  providerId: z.string().min(1).max(128),
  competition: z.enum(["laliga", "championsLeague", "copaDelRey", "superCup"]),
  seasonId: z.string().max(32).nullable().optional(),
  competitionLabel: z.string().min(1).max(128),
  homeTeam: z.string().min(1).max(128),
  awayTeam: z.string().min(1).max(128),
  homeLogo: z.string().url().nullable(),
  awayLogo: z.string().url().nullable(),
  venue: z.string().max(255).nullable(),
  round: z.string().max(128).nullable(),
  startTimeUtc: z.number().int().finite(),
  status: matchStatus,
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
  isRealMadrid: z.boolean(),
  events: z.array(matchEvent),
  stats: flexibleStats,
  lineups: z.array(z.unknown()).nullable(),
  playerStats: z.array(z.unknown()),
  broadcasters: z.array(z.string()),
  commentary: z.string().nullable(),
  source: z.string().min(1).max(128),
  sourceUrl: z.string().url(),
  sourceUpdatedAt: z.string().datetime(),
  verifiedAt: z.string().datetime(),
  dataState,
  sourceConfidence: z.enum(["high", "medium", "low"]).optional(),
}).strict();

export const espnResponseSchema = externalObject.extend({
  events: z.array(externalRecord).optional(),
  children: z.array(externalRecord).optional(),
  incidents: z.array(externalRecord).optional(),
  broadcasts: z.array(externalRecord).optional(),
  leaders: z.unknown().optional(),
  boxscore: externalRecord.optional(),
  rosters: z.array(externalRecord).optional(),
  header: externalRecord.optional(),
});

export const sportsDbResponseSchema = externalObject.extend({
  events: z.array(externalRecord).optional(),
  results: z.array(externalRecord).optional(),
  table: z.array(externalRecord).optional(),
});

export type ExternalRecord = z.infer<typeof externalRecord>;

export function validateEspnResponse(
  value: unknown,
  url: string
): ExternalRecord {
  const parsed = espnResponseSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid ESPN response from ${url}`);
  return parsed.data;
}

export function validateSportsDbResponse(
  value: unknown,
  url: string
): ExternalRecord {
  const parsed = sportsDbResponseSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(`Invalid TheSportsDB response from ${url}`);
  return parsed.data;
}
