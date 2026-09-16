import {
  validateEspnResponse,
  validateSportsDbResponse,
  type ExternalRecord,
} from "./validators";
import {
  getBundlePollingIntervalMs,
  type DataSourceStatus,
} from "../shared/domain";
import {
  createSyncRun,
  finishSyncRun,
  getCachedMatches,
  getDataCache,
  getLastSyncBySource,
  getRecentProviderConflicts,
  putDataCache,
  recordProviderConflicts,
  upsertMatches,
} from "./db";
import {
  getCircuitState,
  providerOperationalStatus,
  resilientRequest,
} from "./syncEngine";
import { getProviderAdapter } from "./providerAdapters";
import { getRedisCache, putRedisCache } from "./redisCache";

export const COMPETITIONS = {
  laliga: {
    label: "الدوري الإسباني",
    espn: "esp.1",
    official: "https://www.laliga.com/en-GB/laliga-easports/standing",
    tsdbLeague: "4335",
    supportsStandings: true,
  },
  championsLeague: {
    label: "دوري أبطال أوروبا",
    espn: "uefa.champions",
    official:
      "https://www.uefa.com/uefachampionsleague/clubs/50051--real-madrid/matches/",
    tsdbLeague: null,
    supportsStandings: true,
  },
  copaDelRey: {
    label: "كأس الملك",
    espn: "esp.copa_del_rey",
    official: "https://www.laliga.com/en-GB/other-competitions/copa-del-rey",
    tsdbLeague: null,
    supportsStandings: false,
  },
  superCup: {
    label: "السوبر الإسباني",
    espn: "esp.super_cup",
    official:
      "https://www.laliga.com/en-GB/other-competitions/supercopa-de-espana",
    tsdbLeague: null,
    supportsStandings: false,
  },
} as const;

export type CompetitionKey = keyof typeof COMPETITIONS;
export type MatchStatus =
  | "scheduled"
  | "live"
  | "completed"
  | "postponed"
  | "cancelled"
  | "unknown";
export type DataState = DataSourceStatus;
export type MatchEvent = {
  type: string;
  minute?: string;
  team?: string;
  teamLogo?: string | null;
  player?: string;
  playerNumber?: string | number | null;
  assist?: string;
  assistNumber?: string | number | null;
  detail?: string;
};
export type MatchStats = Record<string, string | number | { home: string | number; away: string | number }>;
export type PlayerMatchStat = {
  playerId: string;
  player: string;
  team: string;
  teamLogo: string | null;
  position: string | null;
  jersey: string | null;
  starter: boolean;
  minutes: number | null;
  stats: Record<string, string | number>;
  source: string;
};
export type MatchLineup = {
  team: string;
  teamLogo: string | null;
  formation: string | null;
  coach?: string | null;
  coachPhoto?: string | null;
  players: Array<{
    playerId: string;
    player: string;
    position: string | null;
    jersey: string | null;
    starter: boolean;
    status: string | null;
    photo: string | null;
  }>;
};
export type MatchRecord = {
  providerId: string;
  competition: CompetitionKey;
  seasonId?: string | null;
  competitionLabel: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  venue: string | null;
  round: string | null;
  startTimeUtc: number;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  isRealMadrid: boolean;
  events: MatchEvent[];
  stats: MatchStats;
  lineups: MatchLineup[] | null;
  playerStats: PlayerMatchStat[];
  broadcasters: string[];
  commentary: string | null;
  source: string;
  sourceUrl: string;
  sourceUpdatedAt: string;
  verifiedAt: string;
  dataState: DataState;
  sourceConfidence?: "high" | "medium" | "low";
};

export type SourceHealth = {
  name: string;
  status: "ok" | "failed" | "standby";
  checkedAt: string;
  latencyMs: number | null;
  url: string;
  message?: string;
};
export type MatchBundle = {
  matches: MatchRecord[];
  source: string;
  sourceUpdatedAt: string;
  dataState: DataState;
  failures: number;
  sources: SourceHealth[];
  cacheKey: string;
  sourceConfidence?: "high" | "medium" | "low";
};

const ESPN_BASE = getProviderAdapter("ESPN").baseUrl;
const SPORTS_DB_BASE = getProviderAdapter("TheSportsDB").baseUrl;
const REAL_MADRID_TEAM_IDS = new Set(["86", "133738"]);
const REAL_MADRID_NAMES = new Set([
  "real madrid",
  "real madrid cf",
  "real madrid club de futbol",
]);
const FETCH_TIMEOUT_MS = 8000;
const FETCH_RETRIES = 1;
const FETCH_BACKOFF_MS = 200;

function nowIso() {
  return new Date().toISOString();
}
export function currentSeasonBounds(now = new Date()) {
  const startYear =
    now.getUTCMonth() < 6 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const start = new Date(Date.UTC(startYear, 6, 1));
  const end = new Date(
    Math.min(now.getTime(), Date.UTC(startYear + 1, 6, 1) - 1)
  );
  return { start, end, label: `${startYear}-${startYear + 1}` };
}
function currentSeasonLabel(now = new Date()) {
  return currentSeasonBounds(now).label;
}
function inferCompetition(
  event: Record<string, unknown>
): CompetitionKey | null {
  const league = String(event.strLeague ?? "").toLowerCase();
  if (league.includes("champions")) return "championsLeague";
  if (league.includes("copa") || league.includes("del rey"))
    return "copaDelRey";
  if (league.includes("super") || league.includes("supercopa"))
    return "superCup";
  if (
    league.includes("laliga") ||
    league.includes("primera") ||
    league.includes("spanish")
  )
    return "laliga";
  return null;
}
function safeScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}
function normalizedTeamName(name: unknown) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(cf|club de futbol|football club|fc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function isMadrid(name: string, id?: unknown) {
  return (
    REAL_MADRID_TEAM_IDS.has(String(id ?? "")) ||
    REAL_MADRID_NAMES.has(normalizedTeamName(name))
  );
}
export function normalizeOfficialLogo(team: any): string | null {
  const candidates = [
    team?.logo,
    team?.logos?.[0]?.href,
    team?.logos?.[0]?.url,
    team?.team?.logo,
    team?.team?.logos?.[0]?.href,
    team?.team?.logos?.[0]?.url,
  ];
  const value = candidates.find(
    item => typeof item === "string" && item.trim()
  );
  if (!value) return null;
  const normalized = value.trim();
  return normalized.startsWith("http://")
    ? `https://${normalized.slice(7)}`
    : normalized;
}
function classifyIncident(text: string) {
  const value = text.toLowerCase();
  if (
    value.includes("goal") ||
    value.includes("scored") ||
    value.includes("هدف")
  )
    return "goal";
  if (value.includes("yellow")) return "yellow_card";
  if (value.includes("red") || value.includes("sent off")) return "red_card";
  if (value.includes("chance") || value.includes("missed")) return "chance";
  return "event";
}
function normalizeStatus(
  name?: string,
  state?: string,
  completed?: boolean
): MatchStatus {
  const text = `${name ?? ""} ${state ?? ""}`.toLowerCase();
  if (text.includes("cancel")) return "cancelled";
  if (text.includes("cancel")) return "cancelled";
  if (text.includes("postpon")) return "postponed";
  if (state === "in" || text.includes("live") || text.includes("halftime"))
    return "live";
  if (
    completed ||
    state === "post" ||
    text.includes("final") ||
    text.includes("full time") ||
    text === "ft"
  )
    return "completed";
  if (state === "pre" || text.includes("scheduled") || text === "ns")
    return "scheduled";
  return "unknown";
}
function validate(record: MatchRecord): MatchRecord | null {
  if (
    !record.providerId ||
    !record.homeTeam ||
    !record.awayTeam ||
    !Number.isFinite(record.startTimeUtc)
  )
    return null;
  return record;
}

async function fetchJson<T = ExternalRecord>(
  url: string,
  signal?: AbortSignal
): Promise<T> {
  const provider = url.includes("thesportsdb.com") ? "TheSportsDB" : "ESPN";
  return resilientRequest(
    provider,
    url,
    async requestSignal => {
      const response = await fetch(url, {
        signal: requestSignal,
        headers: {
          accept: "application/json",
          "user-agent": "RealMadridMatchDesk/2.0",
        },
      });
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);
      const payload: unknown = await response.json();
      const validated =
        provider === "TheSportsDB"
          ? validateSportsDbResponse(payload, url)
          : validateEspnResponse(payload, url);
      return validated as T;
    },
    {
      timeoutMs: FETCH_TIMEOUT_MS,
      retries: FETCH_RETRIES,
      backoffMs: FETCH_BACKOFF_MS,
    },
    signal
  );
}

export function toEspnRecord(
  event: any,
  competition: CompetitionKey,
  fetchedAt: string
): MatchRecord | null {
  const competitors = event.competitions?.[0]?.competitors ?? [];
  const homeEntry = competitors.find((item: any) => item.homeAway === "home");
  const awayEntry = competitors.find((item: any) => item.homeAway === "away");
  const home = homeEntry?.team;
  const away = awayEntry?.team;
  const start = Date.parse(event.date ?? "");
  if (
    !event.id ||
    !home?.displayName ||
    !away?.displayName ||
    !Number.isFinite(start)
  )
    return null;
  const detail = event.competitions?.[0];
  const incidents: MatchEvent[] = (detail?.details ?? []).map((item: any) => ({
    type: classifyIncident(`${item.type?.text ?? ""} ${item.text ?? ""}`),
    minute: item.clock?.displayValue,
    team: item.team?.displayName,
    ...(item.team?.logos?.[0]?.href ? { teamLogo: item.team.logos[0].href } : {}),
    player: item.athlete?.displayName,
    ...(item.athlete?.jersey ? { playerNumber: item.athlete.jersey } : {}),
    assist: item.athletesInvolved?.[1]?.displayName,
    ...(item.athletesInvolved?.[1]?.jersey ? { assistNumber: item.athletesInvolved[1].jersey } : {}),
    detail: item.text,
  }));
  const record: MatchRecord = {
    providerId: `espn-${event.id}`,
    competition,
    competitionLabel: COMPETITIONS[competition].label,
    homeTeam: home.displayName,
    awayTeam: away.displayName,
    homeLogo: normalizeOfficialLogo(home),
    awayLogo: normalizeOfficialLogo(away),
    venue: detail?.venue?.fullName ?? null,
    round: event.season?.slug ?? detail?.status?.type?.shortDetail ?? null,
    startTimeUtc: start,
    status: normalizeStatus(
      detail?.status?.type?.name,
      detail?.status?.type?.state,
      detail?.status?.type?.completed
    ),
    homeScore: ["live", "completed"].includes(
      normalizeStatus(
        detail?.status?.type?.name,
        detail?.status?.type?.state,
        detail?.status?.type?.completed
      )
    )
      ? safeScore(homeEntry?.score)
      : null,
    awayScore: ["live", "completed"].includes(
      normalizeStatus(
        detail?.status?.type?.name,
        detail?.status?.type?.state,
        detail?.status?.type?.completed
      )
    )
      ? safeScore(awayEntry?.score)
      : null,
    isRealMadrid:
      isMadrid(home.displayName, home.id) ||
      isMadrid(away.displayName, away.id),
    events: incidents,
    stats: {},
    lineups: null,
    playerStats: [],
    broadcasters: (detail?.broadcasts ?? [])
      .flatMap((item: any) => item.names ?? [])
      .filter(Boolean),
    commentary: null,
    source: "ESPN public soccer feed",
    sourceUrl:
      event.links?.[0]?.href ??
      `${ESPN_BASE}/${COMPETITIONS[competition].espn}/scoreboard`,
    sourceUpdatedAt: fetchedAt,
    verifiedAt: fetchedAt,
    dataState: "VERIFIED",
    sourceConfidence: "high",
  };
  return validate(record);
}

export function toSportsDbRecord(
  event: any,
  competition: CompetitionKey,
  fetchedAt: string
): MatchRecord | null {
  const rawTimestamp = String(event.strTimestamp ?? "").trim();
  const timestamp = rawTimestamp
    ? /([zZ]|[+-]\d{2}:?\d{2})$/.test(rawTimestamp)
      ? rawTimestamp
      : `${rawTimestamp}Z`
    : `${event.dateEvent}T${event.strTime ?? "12:00:00"}Z`;
  const start = Date.parse(timestamp);
  const record: MatchRecord = {
    providerId: `tsdb-${event.idEvent}`,
    competition,
    competitionLabel: COMPETITIONS[competition].label,
    homeTeam: event.strHomeTeam,
    awayTeam: event.strAwayTeam,
    homeLogo: event.strHomeTeamBadge ?? null,
    awayLogo: event.strAwayTeamBadge ?? null,
    venue: event.strVenue || null,
    round: event.intRound ? `الجولة ${event.intRound}` : null,
    startTimeUtc: start,
    status: normalizeStatus(
      event.strStatus,
      event.strStatus,
      event.strStatus === "FT"
    ),
    homeScore: safeScore(event.intHomeScore),
    awayScore: safeScore(event.intAwayScore),
    isRealMadrid:
      isMadrid(event.strHomeTeam ?? "", event.idHomeTeam) ||
      isMadrid(event.strAwayTeam ?? "", event.idAwayTeam),
    events: [],
    stats: {},
    lineups: null,
    playerStats: [],
    broadcasters: [],
    commentary: null,
    source: "TheSportsDB public feed",
    sourceUrl: `${SPORTS_DB_BASE}/lookupevent.php?id=${event.idEvent}`,
    sourceUpdatedAt: fetchedAt,
    verifiedAt: fetchedAt,
    dataState: "VERIFIED",
    sourceConfidence: "medium",
  };
  return validate(record);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}
function buildChunks(from: Date, to: Date, days = 45) {
  const chunks: Array<[Date, Date]> = [];
  let cursor = new Date(from);
  while (cursor < to) {
    const end = new Date(
      Math.min(cursor.getTime() + days * 86400000, to.getTime())
    );
    chunks.push([new Date(cursor), end]);
    cursor = end;
  }
  return chunks;
}

async function fetchEspnCompetition(
  competition: CompetitionKey,
  from: Date,
  to: Date,
  signal?: AbortSignal
) {
  const fetchedAt = nowIso();
  const chunks = buildChunks(from, to);
  const payloads = await Promise.all(
    chunks.map(([start, end]) =>
      fetchJson<any>(
        `${ESPN_BASE}/${COMPETITIONS[competition].espn}/scoreboard?limit=1000&dates=${dateKey(start)}-${dateKey(end)}`,
        signal
      )
    )
  );
  return payloads
    .flatMap(
      body =>
        (body.events ?? [])
          .map((event: any) => toEspnRecord(event, competition, fetchedAt))
          .filter(Boolean) as MatchRecord[]
    )
    .filter(match => match.isRealMadrid);
}

async function fetchSportsDbMatches(signal?: AbortSignal) {
  const fetchedAt = nowIso();
  const urls = [
    `${SPORTS_DB_BASE}/eventsnext.php?id=${"133738"}`,
    `${SPORTS_DB_BASE}/eventslast.php?id=${"133738"}`,
  ];
  const responses = await Promise.allSettled(
    urls.map(url => fetchJson<any>(url, signal))
  );
  if (responses.every(result => result.status === "rejected")) {
    const errors = responses
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected"
      )
      .map(result =>
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      );
    throw new Error(errors.join(" | ") || "TheSportsDB returned no responses");
  }
  const events = responses.flatMap(result =>
    result.status === "fulfilled"
      ? (result.value.events ?? result.value.results ?? [])
      : []
  );
  return events
    .map((event: any) => {
      const competition = inferCompetition(event);
      return competition
        ? toSportsDbRecord(event, competition, fetchedAt)
        : null;
    })
    .filter(Boolean) as MatchRecord[];
}

function dedupeMatches(items: MatchRecord[]) {
  const map = new Map<string, MatchRecord>();
  const providerKeys = new Map<string, string>();
  for (const item of items) {
    // providerId is the primary identity within one provider; the canonical
    // fixture tuple safely merges the same fixture reported by another provider.
    const key = `${item.competition}:${normalizedTeamName(item.homeTeam)}:${normalizedTeamName(item.awayTeam)}:${new Date(item.startTimeUtc).toISOString().slice(0, 10)}`;
    const previousKey = providerKeys.get(item.providerId);
    if (previousKey && previousKey !== key) map.delete(previousKey);
    providerKeys.set(item.providerId, key);
    const current = map.get(key);
    if (!current || item.source.startsWith("ESPN")) map.set(key, item);
  }
  return Array.from(map.values()).sort(
    (a, b) => a.startTimeUtc - b.startTimeUtc
  );
}

const BUNDLE_TTL_MS = 30_000;
const BUNDLE_STALE_WINDOW_MS = 10 * 60_000;
const SHADOW_PROVIDER_AUDIT_MS = 5 * 60_000;
let bundleCache: { expiresAt: number; bundle: MatchBundle } | null = null;
let lastSecondaryAuditAt = 0;
const bundleRequests = new Map<string, Promise<MatchBundle>>();

/** Test and operational reset: clears process-local bundle state only. */
export function resetLiveDataState() {
  bundleCache = null;
  lastSecondaryAuditAt = 0;
  bundleRequests.clear();
}

function bundleCacheKey(from: Date, to: Date) {
  return `${from.toISOString().slice(0, 10)}:${to.toISOString().slice(0, 10)}`;
}

function matchKey(item: MatchRecord) {
  return `${item.competition}:${item.homeTeam.trim().toLowerCase()}:${item.awayTeam.trim().toLowerCase()}:${new Date(item.startTimeUtc).toISOString().slice(0, 10)}`;
}

function stableValue(value: unknown) {
  return value === undefined || value === null ? "∅" : JSON.stringify(value);
}

export type ProviderConflictRecord = {
  matchKey: string;
  field: string;
  providerA: string;
  providerB: string;
  valueA: string;
  valueB: string;
  winnerProvider: string;
  detectedAt: Date;
};

/** Reconcile providers field-by-field; a valid partial response never erases good data. */
export function mergeProviderMatches(
  espnMatches: MatchRecord[],
  sportsDbMatches: MatchRecord[],
  detectedAt = new Date()
): { matches: MatchRecord[]; conflicts: ProviderConflictRecord[] } {
  const espnByKey = new Map(espnMatches.map(item => [matchKey(item), item]));
  const conflicts: ProviderConflictRecord[] = [];
  const conflictFields = [
    "startTimeUtc",
    "status",
    "homeScore",
    "awayScore",
    "events",
    "stats",
  ] as const;
  for (const fallback of sportsDbMatches) {
    const primary = espnByKey.get(matchKey(fallback));
    if (!primary) continue;
    for (const field of conflictFields) {
      const primaryValue = stableValue(primary[field]);
      const fallbackValue = stableValue(fallback[field]);
      if (primaryValue !== fallbackValue) {
        conflicts.push({
          matchKey: matchKey(primary),
          field,
          providerA: "ESPN",
          providerB: "TheSportsDB",
          valueA: primaryValue,
          valueB: fallbackValue,
          winnerProvider: chooseFieldProvider(field, primary, fallback),
          detectedAt,
        });
      }
    }
  }
  const merged = [...espnMatches, ...sportsDbMatches].map(item => {
    const primary = espnByKey.get(matchKey(item));
    const fallback = sportsDbMatches.find(candidate => matchKey(candidate) === matchKey(item));
    return primary && fallback && item === primary
      ? mergeMatchFields(primary, fallback)
      : item;
  });
  return {
    matches: dedupeMatches(merged),
    conflicts,
  };
}

function chooseFieldProvider(field: string, primary: MatchRecord, fallback: MatchRecord) {
  const primaryValue = primary[field as keyof MatchRecord];
  const fallbackValue = fallback[field as keyof MatchRecord];
  if (field === "stats" || field === "events") {
    const primarySize = Array.isArray(primaryValue) ? primaryValue.length : Object.keys((primaryValue ?? {}) as object).length;
    const fallbackSize = Array.isArray(fallbackValue) ? fallbackValue.length : Object.keys((fallbackValue ?? {}) as object).length;
    return fallbackSize > primarySize ? "TheSportsDB" : "ESPN";
  }
  if (primaryValue === null || primaryValue === undefined || primaryValue === "") return "TheSportsDB";
  return "ESPN";
}

function mergeMatchFields(primary: MatchRecord, fallback: MatchRecord): MatchRecord {
  const stats = Object.keys(fallback.stats).length > Object.keys(primary.stats).length ? fallback.stats : primary.stats;
  const events = fallback.events.length > primary.events.length ? fallback.events : primary.events;
  return {
    ...primary,
    homeScore: primary.homeScore ?? fallback.homeScore,
    awayScore: primary.awayScore ?? fallback.awayScore,
    venue: primary.venue ?? fallback.venue,
    round: primary.round ?? fallback.round,
    events,
    stats,
    lineups: primary.lineups ?? fallback.lineups,
    playerStats: primary.playerStats.length ? primary.playerStats : fallback.playerStats,
    broadcasters: primary.broadcasters.length ? primary.broadcasters : fallback.broadcasters,
    source: primary.source,
    sourceUpdatedAt: new Date(Math.max(Date.parse(primary.sourceUpdatedAt), Date.parse(fallback.sourceUpdatedAt))).toISOString(),
  };
}

export function parseCachedBundle(
  payload: string,
  source: string,
  stale = false
): MatchBundle | null {
  try {
    const parsed = JSON.parse(payload) as MatchBundle;
    if (
      !parsed ||
      !Array.isArray(parsed.matches) ||
      !parsed.cacheKey ||
      !parsed.source ||
      !parsed.sourceUpdatedAt ||
      !parsed.dataState
    )
      return null;
    const validMatches = parsed.matches.filter(
      match =>
        match &&
        typeof match.providerId === "string" &&
        typeof match.competition === "string" &&
        COMPETITIONS[match.competition as CompetitionKey] &&
        typeof match.status === "string" &&
        Number.isFinite(match.startTimeUtc) &&
        typeof match.homeTeam === "string" &&
        typeof match.awayTeam === "string" &&
        typeof match.source === "string" &&
        typeof match.sourceUpdatedAt === "string" &&
        typeof match.verifiedAt === "string" &&
        [
          "LIVE",
          "FRESH",
          "VERIFIED",
          "STALE",
          "FALLBACK",
          "UNAVAILABLE",
          "ERROR",
        ].includes(match.dataState)
    );
    if (validMatches.length !== parsed.matches.length) return null;
    return {
      ...parsed,
      source: stale ? `${source} · stale cache` : parsed.source,
      dataState: stale ? "STALE" : parsed.dataState,
      matches: stale ? markStale(validMatches) : validMatches,
    };
  } catch {
    return null;
  }
}

function ensureBundleRefresh(from: Date, to: Date, signal?: AbortSignal) {
  const cacheKey = bundleCacheKey(from, to);
  const existing = bundleRequests.get(cacheKey);
  if (existing) return existing;
  const request = fetchLiveBundleUncached(from, to, signal);
  bundleRequests.set(cacheKey, request);
  request.then(
    () => bundleRequests.delete(cacheKey),
    () => bundleRequests.delete(cacheKey)
  );
  return request;
}

export async function fetchLiveBundle(
  from: Date,
  to: Date,
  signal?: AbortSignal,
  options?: { bypassPersistentCache?: boolean }
): Promise<MatchBundle> {
  const cacheKey = bundleCacheKey(from, to);
  const now = Date.now();
  if (
    bundleCache &&
    bundleCache.expiresAt > now &&
    bundleCache.bundle.cacheKey === cacheKey
  )
    return bundleCache.bundle;

  let persisted: MatchBundle | null = null;
  if (!options?.bypassPersistentCache)
    try {
      const redisPayload = await getRedisCache(cacheKey);
      const row = redisPayload
        ? {
            payload: redisPayload,
            source: "Redis cache",
            expiresAt: new Date(now + BUNDLE_TTL_MS),
            staleUntil: new Date(now + BUNDLE_TTL_MS + BUNDLE_STALE_WINDOW_MS),
          }
        : await getDataCache(cacheKey);
      if (row) {
        const isFresh = row.expiresAt.getTime() > now;
        persisted = parseCachedBundle(String(row.payload), String(row.source), !isFresh);
        if (persisted && isFresh) {
          bundleCache = {
            expiresAt: row.expiresAt.getTime(),
            bundle: persisted,
          };
          return persisted;
        }
        if (persisted && row.staleUntil.getTime() > now) {
          // Serve immediately and refresh in the background: stale-while-revalidate.
          void ensureBundleRefresh(from, to, signal).catch(error =>
            console.warn("[Live bundle] background refresh failed", error)
          );
          return persisted;
        }
      }
    } catch (error) {
      console.warn("[Live bundle] persistent cache read failed", error);
    }

  try {
    const refreshed = await ensureBundleRefresh(from, to, signal);
    if (refreshed.dataState !== "UNAVAILABLE" || refreshed.matches.length > 0)
      return refreshed;
    if (
      bundleCache?.bundle.cacheKey === cacheKey &&
      bundleCache.bundle.matches.length > 0
    ) {
      return {
        ...bundleCache.bundle,
        source: "In-memory cache · stale fallback",
        dataState: "STALE",
        matches: markStale(bundleCache.bundle.matches),
      };
    }
    if (persisted) return persisted;
    return refreshed;
  } catch (error) {
    if (bundleCache?.bundle.cacheKey === cacheKey) {
      return {
        ...bundleCache.bundle,
        source: "In-memory cache · stale fallback",
        dataState: "STALE",
        matches: markStale(bundleCache.bundle.matches),
      };
    }
    if (persisted) return persisted;
    throw error;
  }
}

async function fetchLiveBundleUncached(
  from: Date,
  to: Date,
  signal?: AbortSignal
): Promise<MatchBundle> {
  const checkedAt = nowIso();
  const cacheKey = bundleCacheKey(from, to);
  const primaryStarted = Date.now();
  const primaryRunId = await createSyncRun("ESPN");
  const results = await Promise.allSettled(
    (Object.keys(COMPETITIONS) as CompetitionKey[]).map(competition =>
      fetchEspnCompetition(competition, from, to, signal)
    )
  );
  const primaryMatches = results.flatMap(result =>
    result.status === "fulfilled" ? result.value : []
  );
  const failures = results.filter(
    result => result.status === "rejected"
  ).length;
  const primaryErrors = results
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    .map(result =>
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason)
    );
  const primaryHealth: SourceHealth = {
    name: "ESPN",
    status: results.some(result => result.status === "fulfilled")
      ? "ok"
      : "failed",
    checkedAt,
    latencyMs: Date.now() - primaryStarted,
    url: `${ESPN_BASE}/.../scoreboard`,
    message: primaryErrors.length
      ? primaryErrors.slice(0, 2).join(" · ")
      : undefined,
  };

  let selectedMatches = primaryMatches;
  let source = "ESPN public soccer feed";
  let dataState: DataState = primaryMatches.length
    ? primaryMatches.some(match => match.status === "live")
      ? "LIVE"
      : "VERIFIED"
    : "UNAVAILABLE";
  const fallbackStarted = Date.now();
  const fallbackNeeded = failures > 0 || primaryMatches.length === 0;
  const auditDue =
    Date.now() - lastSecondaryAuditAt >= SHADOW_PROVIDER_AUDIT_MS;
  const shouldQuerySecondary = fallbackNeeded || auditDue;
  let fallbackMatches: MatchRecord[] = [];
  let conflicts: ProviderConflictRecord[] = [];
  const fallbackHealth: SourceHealth = {
    name: "TheSportsDB",
    status: shouldQuerySecondary ? "failed" : "standby",
    checkedAt,
    latencyMs: null,
    url: `${SPORTS_DB_BASE}/eventsnext.php?id=${"133738"}`,
  };
  const fallbackRunId = shouldQuerySecondary
    ? await createSyncRun("TheSportsDB")
    : null;
  if (shouldQuerySecondary) {
    try {
      fallbackMatches = (await fetchSportsDbMatches(signal)).filter(
        item =>
          item.startTimeUtc >= from.getTime() &&
          item.startTimeUtc <= to.getTime()
      );
      lastSecondaryAuditAt = Date.now();
      const merged = mergeProviderMatches(
        primaryMatches,
        fallbackMatches,
        new Date()
      );
      selectedMatches = merged.matches;
      conflicts = merged.conflicts;
      fallbackHealth.status = fallbackMatches.length ? "ok" : "failed";
      fallbackHealth.latencyMs = Date.now() - fallbackStarted;
      fallbackHealth.message = fallbackMatches.length
        ? fallbackNeeded
          ? "Used after primary degradation"
          : "Shadow-audited for agreement"
        : "No records returned in range";
      if (fallbackNeeded && fallbackMatches.length) {
        dataState = "FALLBACK";
        source = primaryMatches.length
          ? "ESPN + TheSportsDB fallback"
          : "TheSportsDB fallback";
      }
    } catch (error) {
      fallbackHealth.status = "failed";
      fallbackHealth.latencyMs = Date.now() - fallbackStarted;
      fallbackHealth.message =
        error instanceof Error ? error.message : "TheSportsDB request failed";
    }
  }

  const finalMatches = dedupeMatches(selectedMatches);
  let recordsUpdated = 0;
  try {
    recordsUpdated = await upsertMatches(finalMatches);
    await recordProviderConflicts(conflicts);
  } catch (error) {
    console.warn("[Live bundle] persistence failed", error);
  }
  await finishSyncRun(
    primaryRunId,
    results.some(result => result.status === "fulfilled")
      ? "success"
      : "failed",
    primaryMatches.length,
    {
      latencyMs: Date.now() - primaryStarted,
      recordsReceived: primaryMatches.length,
      recordsUpdated,
      error: primaryErrors.length ? primaryErrors.join(" | ") : null,
    }
  );
  if (fallbackRunId !== null) {
    await finishSyncRun(
      fallbackRunId,
      fallbackHealth.status === "ok" ? "success" : "failed",
      fallbackMatches.length,
      {
        latencyMs: fallbackHealth.latencyMs ?? Date.now() - fallbackStarted,
        recordsReceived: fallbackMatches.length,
        recordsUpdated,
        error:
          fallbackHealth.status === "failed" ? fallbackHealth.message : null,
      }
    );
  }

  const officialHealth: SourceHealth = {
    name: "Real Madrid / LaLiga / UEFA",
    status: "standby",
    checkedAt,
    latencyMs: null,
    url: "https://www.realmadrid.com/en-US/schedule",
    message: "Official source retained for manual review",
  };
  const bundle: MatchBundle = {
    matches: finalMatches,
    source,
    sourceUpdatedAt: checkedAt,
    dataState,
    failures,
    sources: [primaryHealth, fallbackHealth, officialHealth],
    cacheKey,
    sourceConfidence: source.startsWith("ESPN") ? "high" : "medium",
  };
  // Cache the complete operational bundle, including source health, so a
  // restart can render the same freshness/fallback context without guessing.
  try {
    const payload = JSON.stringify(bundle);
    await putRedisCache(cacheKey, payload, BUNDLE_TTL_MS + BUNDLE_STALE_WINDOW_MS);
    await putDataCache({
      cacheKey,
      payload,
      source,
      storedAt: new Date(),
      expiresAt: new Date(Date.now() + BUNDLE_TTL_MS),
      staleUntil: new Date(Date.now() + BUNDLE_TTL_MS + BUNDLE_STALE_WINDOW_MS),
    });
  } catch (error) {
    console.warn("[Live bundle] operational cache write failed", error);
  }
  bundleCache = { expiresAt: Date.now() + BUNDLE_TTL_MS, bundle };
  return bundle;
}

export type DataCenterStatus = {
  generatedAt: string;
  lastSync: string | null;
  nextSync: string | null;
  scheduler: { running: boolean; lastRunAt: string | null };
  providers: Array<ReturnType<typeof providerOperationalStatus>>;
  freshness: {
    state: DataState;
    source: string;
    updatedAt: string | null;
    ageMs: number | null;
    indicator: "live" | "fresh" | "stale" | "unavailable";
  };
  fallback: {
    active: boolean;
    state: DataState;
    source: string;
    message: string | null;
  };
  recentConflicts: Awaited<ReturnType<typeof getRecentProviderConflicts>>;
};

const schedulerState: {
  timer: ReturnType<typeof setTimeout> | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  running: boolean;
} = { timer: null, nextRunAt: null, lastRunAt: null, running: false };

export async function runScheduledLiveSync() {
  schedulerState.running = true;
  schedulerState.lastRunAt = nowIso();
  try {
    const from = new Date(Date.now() - 2 * 86400000);
    const to = new Date(Date.now() + 30 * 86400000);
    return await fetchLiveBundle(from, to);
  } finally {
    schedulerState.running = false;
  }
}

export function startLiveSyncScheduler() {
  if (schedulerState.timer) return;
  const tick = async () => {
    schedulerState.timer = null;
    try {
      const bundle = await runScheduledLiveSync();
      const delay = getBundlePollingIntervalMs(bundle.matches);
      schedulerState.nextRunAt = new Date(Date.now() + delay).toISOString();
      schedulerState.timer = setTimeout(() => void tick(), delay);
    } catch (error) {
      console.warn("[Live scheduler] sync failed", error);
      const delay = 60_000;
      schedulerState.nextRunAt = new Date(Date.now() + delay).toISOString();
      schedulerState.timer = setTimeout(() => void tick(), delay);
    }
  };
  void tick();
}

export function stopLiveSyncScheduler() {
  if (schedulerState.timer) clearTimeout(schedulerState.timer);
  schedulerState.timer = null;
  schedulerState.nextRunAt = null;
}

export async function getDataCenterStatus(): Promise<DataCenterStatus> {
  const runs = await getLastSyncBySource();
  const lastFor = (provider: string) =>
    runs.find(run => run.source === provider) ?? null;
  const espnRun = lastFor("ESPN");
  const sportsDbRun = lastFor("TheSportsDB");
  let cached = bundleCache?.bundle ?? null;
  if (!cached) {
    const schedulerKey = bundleCacheKey(
      new Date(Date.now() - 2 * 86400000),
      new Date(Date.now() + 30 * 86400000)
    );
    try {
      const row = await getDataCache(schedulerKey);
      if (row)
        cached = parseCachedBundle(
          row.payload,
          row.source,
          row.expiresAt.getTime() <= Date.now()
        );
    } catch (error) {
      console.warn("[Data center] persistent cache read failed", error);
    }
  }
  const freshnessState = cached?.dataState ?? "UNAVAILABLE";
  const ageMs = cached?.sourceUpdatedAt
    ? Math.max(0, Date.now() - Date.parse(cached.sourceUpdatedAt))
    : null;
  const indicator =
    freshnessState === "LIVE"
      ? "live"
      : freshnessState === "STALE"
        ? "stale"
        : freshnessState === "UNAVAILABLE"
          ? "unavailable"
          : "fresh";
  const sourceHealth = (name: string) =>
    cached?.sources.find(source => source.name === name) ?? null;
  const runLike = (
    name: string,
    run: Awaited<ReturnType<typeof getLastSyncBySource>>[number] | null
  ) => {
    if (run) return run;
    const health = sourceHealth(name);
    return health
      ? {
          status:
            health.status === "ok"
              ? "success"
              : health.status === "failed"
                ? "failed"
                : "standby",
          latencyMs: health.latencyMs,
          completedAt: health.checkedAt,
          error: health.message ?? null,
        }
      : null;
  };
  return {
    generatedAt: nowIso(),
    lastSync: runs[0]?.completedAt?.toISOString() ?? null,
    nextSync: schedulerState.nextRunAt,
    scheduler: {
      running: schedulerState.running,
      lastRunAt: schedulerState.lastRunAt,
    },
    providers: [
      providerOperationalStatus("ESPN", runLike("ESPN", espnRun)),
      providerOperationalStatus(
        "TheSportsDB",
        runLike("TheSportsDB", sportsDbRun)
      ),
    ],
    freshness: {
      state: freshnessState,
      source: cached?.source ?? "No data loaded",
      updatedAt: cached?.sourceUpdatedAt ?? null,
      ageMs,
      indicator,
    },
    fallback: {
      active: freshnessState === "FALLBACK" || freshnessState === "STALE",
      state: freshnessState,
      source: cached?.source ?? "Unavailable",
      message:
        freshnessState === "FALLBACK"
          ? "ESPN degraded; fallback data is being served"
          : freshnessState === "STALE"
            ? "Provider unavailable; stale cache is being shown"
            : null,
    },
    recentConflicts: await getRecentProviderConflicts(12),
  };
}

export function markStale(matches: MatchRecord[], maxAgeMs = 10 * 60 * 1000) {
  const now = Date.now();
  return matches.map(match => ({
    ...match,
    dataState:
      now - Date.parse(match.sourceUpdatedAt) > maxAgeMs
        ? ("STALE" as const)
        : match.dataState,
  }));
}

export type CompetitionSnapshot = {
  competition: CompetitionKey;
  label: string;
  standings: Array<{
    rank: number;
    team: string;
    logo: string | null;
    played: number | null;
    points: number | null;
    wins: number | null;
    draws: number | null;
    losses: number | null;
    goalsFor: number | null;
    goalsAgainst: number | null;
    goalDifference: number | null;
    form: string;
    allStats: Record<string, string | number>;
  }>;
  scorers: Array<{
    player: string;
    team: string;
    teamLogo?: string | null;
    goals: number | null;
    assists?: number | null;
    photo?: string | null;
  }>;
  source: string;
  sourceUrl: string;
  sourceUpdatedAt: string | null;
  dataState: DataState;
  standingsStatus:
    | "available"
    | "not_started"
    | "not_supported"
    | "unavailable";
  note?: string;
};

function parseEspnStandings(body: any) {
  const groups =
    body.children ?? body.standings?.groups ?? body.standings?.entries ?? [];
  const entries = Array.isArray(groups)
    ? groups.flatMap((group: any) =>
        Array.isArray(group?.standings?.entries)
          ? group.standings.entries
          : Array.isArray(group?.entries)
            ? group.entries
            : group?.team
              ? [group]
              : []
      )
    : [];
  return entries
    .map((entry: any, index: number) => {
      const stats = Object.fromEntries(
        (entry.stats ?? []).map((stat: any) => [
          stat.name,
          stat.value ?? stat.displayValue,
        ])
      );
      const number = (...keys: string[]) => {
        for (const key of keys)
          if (
            stats[key] !== undefined &&
            stats[key] !== null &&
            stats[key] !== ""
          )
            return Number(stats[key]) || 0;
        return null;
      };
      return {
        rank: Number(stats.rank ?? index + 1),
        team: entry.team?.displayName ?? entry.team?.name ?? "غير معروف",
        logo: normalizeOfficialLogo(entry.team),
        played: number("gamesPlayed", "played"),
        points: number("points"),
        wins: number("wins"),
        draws: number("ties", "draws"),
        losses: number("losses"),
        goalsFor: number("pointsFor", "goalsFor", "goalsScored"),
        goalsAgainst: number("pointsAgainst", "goalsAgainst", "goalsConceded"),
        goalDifference: number(
          "pointDifferential",
          "goalDifference",
          "differential"
        ),
        form: String(stats.form ?? ""),
        allStats: stats,
      };
    })
    .filter((row: any) => row.team !== "غير معروف");
}

type DerivedStanding = CompetitionSnapshot["standings"][number];

/** ESPN soccer may return {} for standings; completed scoreboard events remain usable. */
export function deriveStandingsFromScoreboard(
  events: any[],
  asOf = Date.now()
): DerivedStanding[] {
  const table = new Map<
    string,
    {
      team: string;
      logo: string | null;
      played: number;
      points: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      form: string[];
    }
  >();
  const ensure = (competitor: any) => {
    const team = competitor?.team;
    const name = team?.displayName ?? team?.name;
    if (!name) return null;
    const key = String(team.id ?? name).toLowerCase();
    if (!table.has(key))
      table.set(key, {
        team: name,
        logo: normalizeOfficialLogo(team),
        played: 0,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        form: [],
      });
    return table.get(key)!;
  };
  for (const event of events ?? []) {
    const kickoff = Date.parse(event.date ?? "");
    if (!Number.isFinite(kickoff) || kickoff > asOf) continue;
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors ?? [];
    const home = competitors.find((item: any) => item.homeAway === "home");
    const away = competitors.find((item: any) => item.homeAway === "away");
    const homeScore = safeScore(home?.score);
    const awayScore = safeScore(away?.score);
    const status = normalizeStatus(
      competition?.status?.type?.name,
      competition?.status?.type?.state,
      competition?.status?.type?.completed
    );
    if (
      !home ||
      !away ||
      homeScore === null ||
      awayScore === null ||
      status !== "completed"
    )
      continue;
    const homeRow = ensure(home);
    const awayRow = ensure(away);
    if (!homeRow || !awayRow) continue;
    homeRow.played += 1;
    awayRow.played += 1;
    homeRow.goalsFor += homeScore;
    homeRow.goalsAgainst += awayScore;
    awayRow.goalsFor += awayScore;
    awayRow.goalsAgainst += homeScore;
    if (homeScore > awayScore) {
      homeRow.wins += 1;
      homeRow.points += 3;
      awayRow.losses += 1;
      homeRow.form.push("W");
      awayRow.form.push("L");
    } else if (homeScore < awayScore) {
      awayRow.wins += 1;
      awayRow.points += 3;
      homeRow.losses += 1;
      awayRow.form.push("W");
      homeRow.form.push("L");
    } else {
      homeRow.draws += 1;
      awayRow.draws += 1;
      homeRow.points += 1;
      awayRow.points += 1;
      homeRow.form.push("D");
      awayRow.form.push("D");
    }
  }
  return Array.from(table.values())
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor ||
        a.team.localeCompare(b.team)
    )
    .map((row, index) => ({
      rank: index + 1,
      team: row.team,
      logo: row.logo,
      played: row.played || null,
      points: row.points,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalsFor - row.goalsAgainst,
      form: row.form.slice(-5).join(""),
      allStats: {
        played: row.played,
        points: row.points,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalsFor - row.goalsAgainst,
      },
    }));
}

async function fetchSportsDbSnapshot(
  competition: CompetitionKey,
  signal?: AbortSignal
): Promise<CompetitionSnapshot | null> {
  const league = COMPETITIONS[competition].tsdbLeague;
  if (!league) return null;
  const season = currentSeasonLabel();
  const body = await fetchJson<any>(
    `${SPORTS_DB_BASE}/lookuptable.php?l=${league}&s=${season}`,
    signal
  );
  const standings = (body.table ?? []).map((row: any, index: number) => ({
    rank: Number(row.intRank ?? index + 1),
    team: row.strTeam,
    logo: row.strBadge ?? null,
    played: Number(row.intPlayed ?? 0) || null,
    points: Number(row.intPoints ?? 0) || null,
    wins: Number(row.intWin ?? 0) || null,
    draws: Number(row.intDraw ?? 0) || null,
    losses: Number(row.intLoss ?? 0) || null,
    goalsFor: Number(row.intGoalsFor ?? 0) || null,
    goalsAgainst: Number(row.intGoalsAgainst ?? 0) || null,
    goalDifference: Number(row.intGoalDifference ?? 0) || null,
    form: row.strForm ?? "",
    allStats: {
      played: Number(row.intPlayed ?? 0),
      points: Number(row.intPoints ?? 0),
      wins: Number(row.intWin ?? 0),
      draws: Number(row.intDraw ?? 0),
      losses: Number(row.intLoss ?? 0),
      goalsFor: Number(row.intGoalsFor ?? 0),
      goalsAgainst: Number(row.intGoalsAgainst ?? 0),
      goalDifference: Number(row.intGoalDifference ?? 0),
    },
  }));
  return {
    competition,
    label: COMPETITIONS[competition].label,
    standings,
    scorers: [],
    source: "TheSportsDB public feed",
    sourceUrl: `${SPORTS_DB_BASE}/lookuptable.php?l=${league}&s=${season}`,
    sourceUpdatedAt: nowIso(),
    dataState: standings.length ? "VERIFIED" : "UNAVAILABLE",
    standingsStatus: standings.length ? "available" : "unavailable",
  };
}

function extractLeaderCategories(body: any): any[] {
  const result: any[] = [];
  const visit = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (Array.isArray(value.leaders) && (value.name || value.displayName))
      result.push(value);
    Object.entries(value).forEach(([key, child]) => {
      if (key !== "leaders") visit(child);
    });
  };
  visit(body);
  return result;
}

function isGoalsLeaderCategory(category: any) {
  const name =
    `${category?.name ?? ""} ${category?.displayName ?? ""}`.toLowerCase();
  return /goal|scor/.test(name) && !/assist|pass|shot|save|tackle/.test(name);
}

function scorerValue(entry: any) {
  const statisticValue = (names: string[]) =>
    (entry.athlete?.statistics ?? entry.statistics ?? []).find((stat: any) =>
      names.includes(String(stat.name ?? stat.abbreviation ?? "").toLowerCase())
    )?.value;
  return safeScore(
    entry.value ??
      entry.goals ??
      statisticValue(["goals", "totalgoals", "scoring"])
  );
}

export function parseLeaderScorers(body: any): CompetitionSnapshot["scorers"] {
  const categories = extractLeaderCategories(body).filter(
    isGoalsLeaderCategory
  );
  const seen = new Set<string>();
  return categories
    .flatMap(category =>
      (category.leaders ?? [])
        .map((entry: any) => {
          const player = entry.athlete?.displayName ?? entry.athlete?.fullName;
          const team =
            entry.team?.displayName ??
            entry.athlete?.team?.displayName ??
            entry.athlete?.team?.name ??
            "غير معروف";
          const goals = scorerValue(entry);
          const key = `${player ?? ""}|${team}`;
          if (!player || seen.has(key)) return null;
          seen.add(key);
          return {
            player,
            team,
            ...(normalizeOfficialLogo(entry.team ?? entry.athlete?.team)
              ? { teamLogo: normalizeOfficialLogo(entry.team ?? entry.athlete?.team) }
              : {}),
            goals,
            assists: safeScore(
              entry.assists ??
                entry.athlete?.statistics?.find((stat: any) =>
                  ["goalassists", "assists"].includes(
                    String(stat.name ?? stat.abbreviation ?? "").toLowerCase()
                  )
                )?.value
            ),
            photo:
              entry.athlete?.headshot?.href ??
              entry.athlete?.headshot?.url ??
              entry.athlete?.jerseyImages?.[0]?.href ??
              null,
          };
        })
        .filter(Boolean)
    )
    .sort((a: any, b: any) => (b.goals ?? -1) - (a.goals ?? -1))
    .slice(0, 20) as CompetitionSnapshot["scorers"];
}

function parsePlayerStats(teams: any[], source: string): PlayerMatchStat[] {
  return teams
    .flatMap((team: any) =>
      (team.roster ?? []).map((entry: any) => ({
        playerId: String(
          entry.athlete?.id ??
            `${team.team?.id}-${entry.jersey ?? entry.athlete?.displayName}`
        ),
        player: entry.athlete?.displayName ?? "غير معروف",
        team: team.team?.displayName ?? "غير معروف",
        teamLogo: normalizeOfficialLogo(team),
        position: entry.position?.displayName ?? entry.position?.name ?? null,
        jersey: entry.jersey ?? null,
        starter: Boolean(entry.starter),
        minutes: safeScore(
          entry.stats?.find((stat: any) =>
            ["minutesPlayed", "minutes"].includes(stat.name)
          )?.value
        ),
        stats: Object.fromEntries(
          (entry.stats ?? []).map((stat: any) => [
            stat.abbreviation ?? stat.shortDisplayName ?? stat.name,
            stat.displayValue ?? stat.value,
          ])
        ),
        source,
      }))
    )
    .filter((item: PlayerMatchStat) => item.player !== "غير معروف");
}

function parseLineups(teams: any[]): MatchLineup[] {
  return teams.map((team: any) => ({
    team: team.team?.displayName ?? "غير معروف",
    teamLogo: normalizeOfficialLogo(team),
    formation: team.formation?.displayName ?? team.formation ?? null,
    coach: team.coach?.displayName ?? team.coach?.name ?? team.manager?.displayName ?? team.manager?.name ?? team.coaches?.[0]?.displayName ?? team.coaches?.[0]?.name ?? null,
    coachPhoto: team.coach?.headshot?.href ?? team.coach?.photo ?? team.manager?.headshot?.href ?? team.manager?.photo ?? team.coaches?.[0]?.headshot?.href ?? null,
    players: (team.roster ?? []).map((entry: any) => ({
      playerId: String(
        entry.athlete?.id ?? entry.jersey ?? entry.athlete?.displayName
      ),
      player: entry.athlete?.displayName ?? "غير معروف",
      position: entry.position?.displayName ?? entry.position?.name ?? null,
      jersey: entry.jersey ?? null,
      starter: Boolean(entry.starter),
      status: entry.subbedOut
        ? "غادر"
        : entry.subbedIn
          ? "بديل داخل"
          : entry.starter
            ? "أساسي"
            : "بديل",
      photo:
        entry.athlete?.headshot?.href ??
        entry.athlete?.jerseyImages?.[0]?.href ??
        null,
    })),
  }));
}

async function fetchSeasonScoreboard(
  competition: CompetitionKey,
  signal?: AbortSignal
) {
  const now = new Date();
  const seasonYear =
    now.getUTCMonth() < 6 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const bounds = currentSeasonBounds(now);
  const start = bounds.start;
  const end = bounds.end;
  const body = await fetchJson<any>(
    `${ESPN_BASE}/${COMPETITIONS[competition].espn}/scoreboard?limit=1000&dates=${dateKey(start)}-${dateKey(end)}`,
    signal
  );
  return body.events ?? [];
}

export async function fetchCompetitionSnapshot(
  competition: CompetitionKey,
  signal?: AbortSignal
): Promise<CompetitionSnapshot> {
  const config = COMPETITIONS[competition];
  const [standingsResult, leadersResult, seasonEventsResult] =
    await Promise.allSettled([
      config.supportsStandings
        ? fetchJson<any>(`${ESPN_BASE}/${config.espn}/standings`, signal)
        : Promise.resolve(null),
      fetchJson<any>(`${ESPN_BASE}/${config.espn}/statistics`, signal),
      config.supportsStandings
        ? fetchSeasonScoreboard(competition, signal)
        : Promise.resolve([]),
    ]);
  const directStandings =
    standingsResult.status === "fulfilled" && standingsResult.value
      ? parseEspnStandings(standingsResult.value)
      : [];
  const derivedStandings = directStandings.length
    ? directStandings
    : seasonEventsResult.status === "fulfilled"
      ? deriveStandingsFromScoreboard(seasonEventsResult.value)
      : [];
  const scorers =
    leadersResult.status === "fulfilled" && leadersResult.value
      ? parseLeaderScorers(leadersResult.value)
      : [];
  const sourceUpdatedAt = nowIso();
  if (!config.supportsStandings)
    return {
      competition,
      label: config.label,
      standings: [],
      scorers,
      source: `ESPN public soccer feed${scorers.length ? " + statistics path" : ""}`,
      sourceUrl: config.official,
      sourceUpdatedAt,
      dataState: scorers.length ? "VERIFIED" : "UNAVAILABLE",
      standingsStatus: "not_supported",
      note: "هذه بطولة خروج مغلوب، لذلك لا يوجد جدول ترتيب دوري.",
    };
  if (derivedStandings.length || scorers.length)
    return {
      competition,
      label: config.label,
      standings: derivedStandings,
      scorers,
      source: `ESPN public soccer feed${directStandings.length ? "" : " + scoreboard fallback"}${scorers.length ? " + statistics path" : ""}`,
      sourceUrl: `${ESPN_BASE}/${config.espn}/${directStandings.length ? "standings" : "statistics"}`,
      sourceUpdatedAt,
      dataState: "VERIFIED",
      standingsStatus: derivedStandings.length ? "available" : "not_started",
      note: directStandings.length
        ? undefined
        : "تم احتساب الترتيب من نتائج المباريات المكتملة لأن مسار standings أعاد استجابة فارغة.",
    };
  if (config.tsdbLeague) {
    try {
      const fallback = await fetchSportsDbSnapshot(competition, signal);
      if (fallback) return fallback;
    } catch (error) {
      console.warn(
        `[Competition ${competition}] fallback snapshot failed`,
        error
      );
    }
  }
  return {
    competition,
    label: config.label,
    standings: [],
    scorers: [],
    source: "لا يوجد مصدر مستجيب",
    sourceUrl: config.official,
    sourceUpdatedAt: null,
    dataState: "UNAVAILABLE",
    standingsStatus: "unavailable",
  };
}

export function parseMatchIncidents(body: any): MatchEvent[] {
  const rawEvents = body?.incidents?.length
    ? body.incidents
    : (body?.keyEvents ?? []);
  const teamLogos = Object.fromEntries((body?.header?.competitions?.[0]?.competitors ?? []).map((item: any) => [item.team?.displayName, normalizeOfficialLogo(item.team)]));
  return rawEvents.map((incident: any) => ({
    type: classifyIncident(
      `${incident.type?.text ?? incident.type ?? ""} ${incident.text ?? ""}`
    ),
    minute: incident.clock?.displayValue ?? incident.time,
    team: incident.team?.displayName,
    ...((incident.team?.logos?.[0]?.href ?? teamLogos[incident.team?.displayName]) ? { teamLogo: incident.team?.logos?.[0]?.href ?? teamLogos[incident.team?.displayName] } : {}),
    player: incident.athlete?.displayName ?? incident.text,
    ...(incident.athlete?.jersey ? { playerNumber: incident.athlete.jersey } : {}),
    assist: incident.athletesInvolved?.find(
      (p: any) => p.displayName !== incident.athlete?.displayName
    )?.displayName,
    ...((incident.athletesInvolved?.find((p: any) => p.displayName !== incident.athlete?.displayName)?.jersey) ? { assistNumber: incident.athletesInvolved.find((p: any) => p.displayName !== incident.athlete?.displayName).jersey } : {}),
    detail: incident.text,
  }));
}

export async function fetchMatchSummary(
  matchId: string,
  competition: CompetitionKey,
  signal?: AbortSignal
) {
  if (matchId.startsWith("tsdb-")) {
    const eventId = matchId.replace("tsdb-", "");
    const body = await fetchJson<any>(
      `${SPORTS_DB_BASE}/lookupevent.php?id=${eventId}`,
      signal
    );
    return {
      incidents: [],
      stats: {},
      lineups: null,
      playerStats: [],
      lineupReleaseAt: null,
      broadcasters: [],
      commentary: body.events?.[0]?.strDescriptionEN || null,
      source: "TheSportsDB public feed",
      sourceUpdatedAt: nowIso(),
      dataState: "FALLBACK" as const,
      sources: [{ name: "TheSportsDB", status: "ok" }],
    };
  }
  const eventId = matchId.replace("espn-", "");
  const [summaryResult, secondaryResult, fallbackResult] =
    await Promise.allSettled([
      fetchJson<any>(
        `${ESPN_BASE}/${COMPETITIONS[competition].espn}/summary?event=${encodeURIComponent(eventId)}`,
        signal
      ),
      fetchJson<any>(
        `${ESPN_BASE}/${COMPETITIONS[competition].espn}/summary?event=${encodeURIComponent(eventId)}&lang=en`,
        signal
      ),
      fetchSportsDbMatches(signal),
    ]);
  const body =
    summaryResult.status === "fulfilled"
      ? summaryResult.value
      : secondaryResult.status === "fulfilled"
        ? secondaryResult.value
        : null;
  if (!body) throw new Error("No match detail source responded");
  const competitionHeader = body.header?.competitions?.[0] ?? {};
  const headerCompetitors = competitionHeader.competitors ?? [];
  const headerHome = headerCompetitors.find(
    (item: any) => item.homeAway === "home"
  );
  const headerAway = headerCompetitors.find(
    (item: any) => item.homeAway === "away"
  );
  const referee =
    (
      body.gameInfo?.officials ??
      body.header?.competitions?.[0]?.officials ??
      []
    )
      .map((official: any) => official.displayName ?? official.name)
      .filter(Boolean)
      .join(", ") || null;
  const incidents = parseMatchIncidents(body);
  const stats: MatchStats = {};
  const statKey = (stat: any) => {
    const name = String(stat.name ?? stat.displayName ?? "").toLowerCase();
    if (name.includes("possession")) return "possessionPct";
    if (name.includes("total shot")) return "totalShots";
    if (name.includes("shot on target") || name.includes("shots on goal")) return "shotsOnTarget";
    if (name.includes("corner")) return "wonCorners";
    if (name.includes("foul")) return "foulsCommitted";
    if (name.includes("offside")) return "offsides";
    if (name.includes("yellow")) return "yellowCards";
    if (name.includes("red")) return "redCards";
    if (name.includes("save")) return "saves";
    if (name.includes("penalty") && name.includes("goal")) return "penaltyKickGoals";
    if (name.includes("penalty")) return "penaltyKickShots";
    return stat.name ?? stat.displayName;
  };
  for (const [index, team] of (body.boxscore?.teams ?? []).entries()) {
    const side = team.homeAway === "away" || index === 1 ? "away" : "home";
    for (const stat of team.statistics ?? []) {
      if (!stat.name && !stat.displayName) continue;
      const key = statKey(stat);
      const value = stat.displayValue ?? stat.value ?? 0;
      const previous: any = stats[key];
      stats[key] = { home: previous?.home ?? (side === "home" ? value : 0), away: previous?.away ?? (side === "away" ? value : 0) };
    }
  }
  const teams = body.boxscore?.teams ?? [];
  const rosterTeams = body.rosters?.length ? body.rosters : teams;
  const kickoff = Date.parse(
    body.header?.competitions?.[0]?.date ?? body.date ?? ""
  );
  const alternateMatches =
    fallbackResult.status === "fulfilled" ? fallbackResult.value : [];
  const alternate = alternateMatches.find(
    (item: MatchRecord) =>
      Math.abs(item.startTimeUtc - kickoff) < 36 * 3600000 &&
      (item.homeTeam
        .toLowerCase()
        .includes(
          body.header?.competitions?.[0]?.competitors?.[0]?.team?.displayName?.toLowerCase?.() ??
            "never"
        ) ||
        item.awayTeam
          .toLowerCase()
          .includes(
            body.header?.competitions?.[0]?.competitors?.[0]?.team?.displayName?.toLowerCase?.() ??
              "never"
          ))
  );
  return {
    header: {
      venue:
        body.gameInfo?.venue?.fullName ??
        competitionHeader.venue?.fullName ??
        null,
      city: body.gameInfo?.venue?.address?.city ?? null,
      referee,
      season:
        body.header?.season?.displayName ?? body.header?.season?.slug ?? null,
      statusDetail:
        competitionHeader.status?.type?.shortDetail ??
        competitionHeader.status?.type?.detail ??
        null,
      period: competitionHeader.status?.period ?? null,
      clock: competitionHeader.status?.displayClock ?? null,
      homeScore: safeScore(headerHome?.score),
      awayScore: safeScore(headerAway?.score),
      homeHalfTime: safeScore(headerHome?.linescores?.[0]?.value),
      awayHalfTime: safeScore(headerAway?.linescores?.[0]?.value),
    },
    incidents,
    stats,
    lineups: rosterTeams.length ? parseLineups(rosterTeams) : null,
    playerStats: rosterTeams.length
      ? parsePlayerStats(rosterTeams, "ESPN match summary roster")
      : [],
    lineupReleaseAt: Number.isFinite(kickoff) ? kickoff - 45 * 60000 : null,
    broadcasters: (
      body.broadcasts ??
      body.header?.competitions?.[0]?.broadcasts ??
      []
    )
      .flatMap((item: any) => item.names ?? [])
      .filter(Boolean),
    commentary:
      body.broadcasts?.[0]?.commentators?.map((c: any) => c.name).join(", ") ??
      alternate?.commentary ??
      null,
    leaders: body.leaders ? parseLeaderScorers(body.leaders) : [],
    source: "ESPN match summary",
    sourceUpdatedAt: nowIso(),
    dataState:
      normalizeStatus(
        competitionHeader.status?.type?.name,
        competitionHeader.status?.type?.state,
        competitionHeader.status?.type?.completed
      ) === "live"
        ? ("LIVE" as const)
        : ("VERIFIED" as const),
    sources: [
      {
        name: "ESPN summary",
        status: summaryResult.status === "fulfilled" ? "ok" : "failed",
      },
      {
        name: "ESPN secondary summary path",
        status: secondaryResult.status === "fulfilled" ? "ok" : "failed",
      },
      {
        name: "TheSportsDB fallback path",
        status: fallbackResult.status === "fulfilled" ? "ok" : "failed",
      },
    ],
  };
}

export function isPublishedMeeting(
  match: MatchRecord,
  teamA: string,
  teamB: string
) {
  const sides = [
    normalizedTeamName(match.homeTeam),
    normalizedTeamName(match.awayTeam),
  ];
  const requested = [normalizedTeamName(teamA), normalizedTeamName(teamB)];
  return requested.every(team => sides.includes(team));
}
export function aggregatePublishedH2H(
  matches: MatchRecord[],
  teamA: string,
  teamB: string
) {
  return matches.reduce(
    (acc, match) => {
      if (
        !isPublishedMeeting(match, teamA, teamB) ||
        match.status !== "completed" ||
        match.homeScore == null ||
        match.awayScore == null
      )
        return acc;
      const aHome =
        normalizedTeamName(match.homeTeam) === normalizedTeamName(teamA);
      const goalsFor = aHome ? match.homeScore : match.awayScore;
      const goalsAgainst = aHome ? match.awayScore : match.homeScore;
      acc.played += 1;
      acc.goalsFor += goalsFor;
      acc.goalsAgainst += goalsAgainst;
      if (goalsFor > goalsAgainst) acc.wins += 1;
      else if (goalsFor === goalsAgainst) acc.draws += 1;
      else acc.losses += 1;
      return acc;
    },
    { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }
  );
}
async function fetchHistoricalMadridSchedule(signal?: AbortSignal) {
  const from = new Date("2010-07-01T00:00:00Z");
  const to = new Date();
  const results = await Promise.allSettled(
    (Object.keys(COMPETITIONS) as CompetitionKey[]).map(async competition => {
      const body = await fetchJson<any>(
        `${ESPN_BASE}/${COMPETITIONS[competition].espn}/teams/86/schedule?limit=1000&dates=${dateKey(from)}-${dateKey(to)}`,
        signal
      );
      return (body.events ?? [])
        .map((event: any) => toEspnRecord(event, competition, nowIso()))
        .filter(Boolean) as MatchRecord[];
    })
  );
  return results.flatMap(result =>
    result.status === "fulfilled" ? result.value : []
  );
}
export async function fetchPublishedH2H(
  teamA: string,
  teamB: string,
  signal?: AbortSignal
) {
  const now = Date.now();
  const cached = await getCachedMatches(
    now - 10 * 365 * 86400000,
    now + 365 * 86400000
  );
  const parsed = cached.flatMap((row: { payload: string }) => {
    try {
      return [JSON.parse(row.payload) as MatchRecord];
    } catch {
      return [];
    }
  });
  const recent = await fetchLiveBundle(
    new Date(now - 60 * 86400000),
    new Date(now + 365 * 86400000),
    signal
  ).catch(() => ({ matches: [] as MatchRecord[] }));
  const madridInvolved = [teamA, teamB].some(name => isMadrid(name));
  const historical = madridInvolved
    ? await fetchHistoricalMadridSchedule(signal).catch(
        () => [] as MatchRecord[]
      )
    : [];
  const all = dedupeMatches([...parsed, ...historical, ...recent.matches]);
  return all.filter(match => isPublishedMeeting(match, teamA, teamB));
}
export async function fetchRealMadridSeasonFixtures(signal?: AbortSignal) {
  const { start, end } = currentSeasonBounds();
  return (await fetchLiveBundle(start, end, signal)).matches.filter(
    match => match.isRealMadrid
  );
}
