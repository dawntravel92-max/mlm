import { z } from "zod";

export const ENGINE_COMPETITIONS = {
  laliga: {
    label: "LaLiga",
    espn: "esp.1",
    tsdb: "4335",
    supportsStandings: true,
  },
  championsLeague: {
    label: "Champions League",
    espn: "uefa.champions",
    tsdb: null,
    supportsStandings: true,
  },
  copaDelRey: {
    label: "Copa del Rey",
    espn: "esp.copa_del_rey",
    tsdb: null,
    supportsStandings: false,
  },
  superCup: {
    label: "Spanish Super Cup",
    espn: "esp.super_cup",
    tsdb: null,
    supportsStandings: false,
  },
  friendly: {
    label: "Friendly",
    espn: "club.friendly",
    tsdb: null,
    supportsStandings: false,
  },
  unknown: {
    label: "Unknown",
    espn: null,
    tsdb: null,
    supportsStandings: false,
  },
} as const;
export type EngineCompetition = keyof typeof ENGINE_COMPETITIONS;
export type NormalizedStatus =
  | "SCHEDULED"
  | "LIVE"
  | "HALFTIME"
  | "EXTRA_TIME"
  | "PENALTIES"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED"
  | "UNKNOWN";
export type DatasetStatus =
  | "LIVE"
  | "FRESH"
  | "STALE"
  | "FALLBACK"
  | "UNAVAILABLE"
  | "ERROR";
export type Endpoint =
  | "matches"
  | "competitions"
  | "standings"
  | "scorers"
  | "lineups"
  | "stats"
  | "events";
export type SeasonContext = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
};
export type DatasetMeta = {
  source: "ESPN" | "TheSportsDB" | "CACHE" | "NONE";
  lastUpdated: string | null;
  freshness: "LIVE" | "FRESH" | "STALE" | "UNKNOWN";
  status: DatasetStatus;
};
export type UnifiedTeam = { id: string; name: string; logo: string | null };
export type UnifiedMatch = {
  id: string;
  competition: EngineCompetition;
  season: SeasonContext;
  home: UnifiedTeam;
  away: UnifiedTeam;
  startTimeUtc: number;
  status: NormalizedStatus;
  homeScore: number | null;
  awayScore: number | null;
  events: unknown[];
  stats: Record<string, unknown>;
  lineups: unknown[] | null;
  meta: DatasetMeta;
};
export type UnifiedDataset<T> = {
  data: T;
  competition: EngineCompetition;
  season: SeasonContext;
  meta: DatasetMeta;
};

const rawObject = z.object({}).catchall(z.unknown());
export const rawProviderResponseSchema = z.object({}).catchall(z.unknown());
export const rawEventsResponseSchema = rawProviderResponseSchema.extend({
  events: z.array(rawObject).optional(),
});
export const rawSportsDbResponseSchema = rawProviderResponseSchema.extend({
  events: z.array(rawObject).optional(),
  results: z.array(rawObject).optional(),
  table: z.array(rawObject).optional(),
});
export function validateRawResponse(
  value: unknown,
  provider: "ESPN" | "TheSportsDB"
): Record<string, unknown> {
  const result = (
    provider === "ESPN" ? rawProviderResponseSchema : rawSportsDbResponseSchema
  ).safeParse(value);
  if (!result.success)
    throw new Error(`${provider} payload failed schema validation`);
  return result.data;
}

export function seasonFromLabel(
  label?: string,
  now = new Date()
): SeasonContext {
  const match = label?.match(/^(\d{4})[-/](\d{4})$/);
  const startYear = match
    ? Number(match[1])
    : now.getUTCMonth() < 6
      ? now.getUTCFullYear() - 1
      : now.getUTCFullYear();
  return {
    id: `${startYear}-${startYear + 1}`,
    label: `${startYear}-${startYear + 1}`,
    startDate: `${startYear}-07-01`,
    endDate: `${startYear + 1}-06-30`,
  };
}
export function detectCompetition(value: unknown): EngineCompetition {
  const text =
    typeof value === "string"
      ? value.toLowerCase()
      : JSON.stringify(value ?? {}).toLowerCase();
  if (text.includes("champions") || text.includes("uefa.champions"))
    return "championsLeague";
  if (text.includes("copa") || text.includes("del rey")) return "copaDelRey";
  if (
    text.includes("super cup") ||
    text.includes("supercopa") ||
    text.includes("super_cup")
  )
    return "superCup";
  if (text.includes("friendly") || text.includes("club.friendly"))
    return "friendly";
  if (
    text.includes("laliga") ||
    text.includes("primera") ||
    text.includes("spanish") ||
    text.includes("esp.1")
  )
    return "laliga";
  return "unknown";
}
export function normalizeStatus(
  name?: unknown,
  state?: unknown,
  completed?: unknown
): NormalizedStatus {
  const text = `${String(name ?? "")} ${String(state ?? "")}`.toLowerCase();
  if (text.includes("cancel")) return "CANCELLED";
  if (text.includes("postpon")) return "POSTPONED";
  if (text.includes("penalt")) return "PENALTIES";
  if (text.includes("extra") || text.includes("aet")) return "EXTRA_TIME";
  if (text.includes("half") || text.includes("ht")) return "HALFTIME";
  if (
    completed === true ||
    state === "post" ||
    text.includes("final") ||
    text.includes("full time") ||
    text.trim() === "ft"
  )
    return "FINISHED";
  if (state === "in" || text.includes("live") || text.includes("playing"))
    return "LIVE";
  if (
    state === "pre" ||
    text.includes("scheduled") ||
    text.includes("not started") ||
    text.trim() === "ns"
  )
    return "SCHEDULED";
  return "UNKNOWN";
}

export type Requester = (url: string, signal: AbortSignal) => Promise<unknown>;
export type ProviderOptions = {
  request?: Requester;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
};
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";

async function defaultRequest(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    signal,
    headers: { accept: "application/json", "user-agent": "IBRA-LIVE-RMA/2.0" },
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}
async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parent?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  parent?.addEventListener("abort", abort, { once: true });
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  }
}

export class EspnProvider {
  readonly name = "ESPN" as const;
  private request: Requester;
  private timeoutMs: number;
  private retries: number;
  private backoffMs: number;
  constructor(options: ProviderOptions = {}) {
    this.request = options.request ?? defaultRequest;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.retries = options.retries ?? 2;
    this.backoffMs = options.backoffMs ?? 150;
  }
  async get(
    endpoint: Endpoint,
    competition: EngineCompetition,
    season: SeasonContext,
    params: Record<string, string> = {},
    signal?: AbortSignal
  ) {
    const league = ENGINE_COMPETITIONS[competition].espn ?? "";
    if (!league)
      throw new Error(`ESPN competition mapping unavailable: ${competition}`);
    const path =
      endpoint === "matches"
        ? "scoreboard"
        : endpoint === "competitions"
          ? "scoreboard"
          : endpoint === "standings"
            ? "standings"
            : endpoint === "scorers"
              ? "leaders"
              : "summary";
    const query = new URLSearchParams({
      season: season.id.slice(0, 4),
      ...params,
    });
    if (endpoint === "matches") query.set("limit", "1000");
    const url = `${ESPN_BASE}/${league}/${path}?${query}`;
    let last: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const body = await withTimeout(
          s => this.request(url, s),
          this.timeoutMs,
          signal
        );
        return validateRawResponse(body, "ESPN");
      } catch (error) {
        last = error;
        if (attempt < this.retries)
          await new Promise(resolve =>
            setTimeout(resolve, this.backoffMs * 2 ** attempt)
          );
      }
    }
    throw last instanceof Error ? last : new Error("ESPN request failed");
  }
  matches(
    c: EngineCompetition,
    s: SeasonContext,
    p?: Record<string, string>,
    signal?: AbortSignal
  ) {
    return this.get("matches", c, s, p, signal);
  }
  competitions(c: EngineCompetition, s: SeasonContext, signal?: AbortSignal) {
    return this.get("competitions", c, s, {}, signal);
  }
  standings(c: EngineCompetition, s: SeasonContext, signal?: AbortSignal) {
    return this.get("standings", c, s, {}, signal);
  }
  scorers(c: EngineCompetition, s: SeasonContext, signal?: AbortSignal) {
    return this.get("scorers", c, s, {}, signal);
  }
  lineups(
    c: EngineCompetition,
    s: SeasonContext,
    eventId: string,
    signal?: AbortSignal
  ) {
    return this.get("lineups", c, s, { event: eventId }, signal);
  }
  stats(
    c: EngineCompetition,
    s: SeasonContext,
    eventId: string,
    signal?: AbortSignal
  ) {
    return this.get("stats", c, s, { event: eventId }, signal);
  }
  events(
    c: EngineCompetition,
    s: SeasonContext,
    eventId: string,
    signal?: AbortSignal
  ) {
    return this.get("events", c, s, { event: eventId }, signal);
  }
}

export class TheSportsDbProvider {
  readonly name = "TheSportsDB" as const;
  private request: Requester;
  private timeoutMs: number;
  private retries: number;
  private backoffMs: number;
  constructor(options: ProviderOptions = {}) {
    this.request = options.request ?? defaultRequest;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.retries = options.retries ?? 1;
    this.backoffMs = options.backoffMs ?? 200;
  }
  async get(
    endpoint: Endpoint,
    competition: EngineCompetition,
    season: SeasonContext,
    params: Record<string, string> = {},
    signal?: AbortSignal
  ) {
    const league = ENGINE_COMPETITIONS[competition].tsdb;
    if (!league)
      throw new Error(
        `TheSportsDB competition mapping unavailable: ${competition}`
      );
    const routes: Record<Endpoint, string> = {
      matches: `eventsseason.php?id=${league}&s=${season.label}`,
      competitions: `lookupleague.php?id=${league}`,
      standings: `lookuptable.php?l=${league}&s=${season.label}`,
      scorers: `lookupleague.php?id=${league}`,
      lineups: `lookupevent.php?id=${params.event ?? ""}`,
      stats: `lookupevent.php?id=${params.event ?? ""}`,
      events: `lookupevent.php?id=${params.event ?? ""}`,
    };
    const url = `${TSDB_BASE}/${routes[endpoint]}`;
    let last: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const body = await withTimeout(
          s => this.request(url, s),
          this.timeoutMs,
          signal
        );
        return validateRawResponse(body, "TheSportsDB");
      } catch (error) {
        last = error;
        if (attempt < this.retries)
          await new Promise(resolve =>
            setTimeout(resolve, this.backoffMs * 2 ** attempt)
          );
      }
    }
    throw last instanceof Error
      ? last
      : new Error("TheSportsDB request failed");
  }
  matches(
    c: EngineCompetition,
    s: SeasonContext,
    p?: Record<string, string>,
    signal?: AbortSignal
  ) {
    return this.get("matches", c, s, p, signal);
  }
  competitions(c: EngineCompetition, s: SeasonContext, signal?: AbortSignal) {
    return this.get("competitions", c, s, {}, signal);
  }
  standings(c: EngineCompetition, s: SeasonContext, signal?: AbortSignal) {
    return this.get("standings", c, s, {}, signal);
  }
  scorers(c: EngineCompetition, s: SeasonContext, signal?: AbortSignal) {
    return this.get("scorers", c, s, {}, signal);
  }
  lineups(
    c: EngineCompetition,
    s: SeasonContext,
    id: string,
    signal?: AbortSignal
  ) {
    return this.get("lineups", c, s, { event: id }, signal);
  }
  stats(
    c: EngineCompetition,
    s: SeasonContext,
    id: string,
    signal?: AbortSignal
  ) {
    return this.get("stats", c, s, { event: id }, signal);
  }
  events(
    c: EngineCompetition,
    s: SeasonContext,
    id: string,
    signal?: AbortSignal
  ) {
    return this.get("events", c, s, { event: id }, signal);
  }
}

function team(value: any): UnifiedTeam {
  return {
    id: String(
      value?.id ??
        value?.idTeam ??
        value?.team?.id ??
        value?.idHomeTeam ??
        value?.idAwayTeam ??
        value?.displayName ??
        value?.strTeam ??
        "unknown"
    ),
    name: String(
      value?.displayName ?? value?.name ?? value?.strTeam ?? "Unknown"
    ),
    logo: value?.logo ?? value?.logos?.[0]?.href ?? value?.strBadge ?? null,
  };
}
export function normalizeEspnMatch(
  event: any,
  competition: EngineCompetition,
  season: SeasonContext,
  meta: DatasetMeta
): UnifiedMatch | null {
  const c = event?.competitions?.[0];
  const home = c?.competitors?.find((x: any) => x.homeAway === "home");
  const away = c?.competitors?.find((x: any) => x.homeAway === "away");
  const start = Date.parse(event?.date ?? "");
  if (!event?.id || !home || !away || !Number.isFinite(start)) return null;
  return {
    id: `espn-${event.id}`,
    competition,
    season,
    home: team(home.team),
    away: team(away.team),
    startTimeUtc: start,
    status: normalizeStatus(
      c?.status?.type?.name,
      c?.status?.type?.state,
      c?.status?.type?.completed
    ),
    homeScore:
      ["LIVE", "HALFTIME", "EXTRA_TIME", "PENALTIES", "FINISHED"].includes(
        normalizeStatus(
          c?.status?.type?.name,
          c?.status?.type?.state,
          c?.status?.type?.completed
        )
      ) && Number.isFinite(Number(home.score))
        ? Number(home.score)
        : null,
    awayScore:
      ["LIVE", "HALFTIME", "EXTRA_TIME", "PENALTIES", "FINISHED"].includes(
        normalizeStatus(
          c?.status?.type?.name,
          c?.status?.type?.state,
          c?.status?.type?.completed
        )
      ) && Number.isFinite(Number(away.score))
        ? Number(away.score)
        : null,
    events: c?.details ?? [],
    stats: {},
    lineups: null,
    meta,
  };
}
export function normalizeSportsDbMatch(
  event: any,
  competition: EngineCompetition,
  season: SeasonContext,
  meta: DatasetMeta
): UnifiedMatch | null {
  const start = Date.parse(
    event?.strTimestamp
      ? event.strTimestamp
      : `${event?.dateEvent ?? ""}T${event?.strTime ?? "00:00:00"}Z`
  );
  if (
    !event?.idEvent ||
    !event?.strHomeTeam ||
    !event?.strAwayTeam ||
    !Number.isFinite(start)
  )
    return null;
  return {
    id: `tsdb-${event.idEvent}`,
    competition,
    season,
    home: team({
      id: event.idHomeTeam,
      name: event.strHomeTeam,
      logo: event.strHomeTeamBadge,
    }),
    away: team({
      id: event.idAwayTeam,
      name: event.strAwayTeam,
      logo: event.strAwayTeamBadge,
    }),
    startTimeUtc: start,
    status: normalizeStatus(
      event.strStatus,
      event.strStatus,
      event.strStatus === "FT"
    ),
    homeScore:
      ["LIVE", "HALFTIME", "EXTRA_TIME", "PENALTIES", "FINISHED"].includes(
        normalizeStatus(
          event.strStatus,
          event.strStatus,
          event.strStatus === "FT"
        )
      ) && event.intHomeScore != null
        ? Number(event.intHomeScore)
        : null,
    awayScore:
      ["LIVE", "HALFTIME", "EXTRA_TIME", "PENALTIES", "FINISHED"].includes(
        normalizeStatus(
          event.strStatus,
          event.strStatus,
          event.strStatus === "FT"
        )
      ) && event.intAwayScore != null
        ? Number(event.intAwayScore)
        : null,
    events: [],
    stats: {},
    lineups: null,
    meta,
  };
}

export class ResilientSportsEngine {
  private primary: EspnProvider;
  private fallback: TheSportsDbProvider;
  private cache = new Map<string, UnifiedDataset<unknown>>();
  private pending = new Map<string, Promise<UnifiedDataset<unknown>>>();
  constructor(
    primary = new EspnProvider(),
    fallback = new TheSportsDbProvider()
  ) {
    this.primary = primary;
    this.fallback = fallback;
  }
  async fetchMatches(
    competition: EngineCompetition,
    season = seasonFromLabel(),
    params: Record<string, string> = {},
    signal?: AbortSignal
  ): Promise<UnifiedDataset<UnifiedMatch[]>> {
    return this.fetch(
      "matches",
      competition,
      season,
      async p => {
        const body = await p.matches(competition, season, params, signal);
        const events = Array.isArray(body.events)
          ? body.events
          : Array.isArray(body.results)
            ? body.results
            : [];
        return events
          .map((e: any) =>
            p instanceof EspnProvider
              ? normalizeEspnMatch(
                  e,
                  competition,
                  season,
                  this.meta("ESPN", "FRESH")
                )
              : normalizeSportsDbMatch(
                  e,
                  competition,
                  season,
                  this.meta("TheSportsDB", "FALLBACK")
                )
          )
          .filter(Boolean) as UnifiedMatch[];
      },
      signal
    );
  }
  async fetchDataset<T>(
    endpoint: Endpoint,
    competition: EngineCompetition,
    season: SeasonContext,
    loader: (provider: EspnProvider | TheSportsDbProvider) => Promise<T>,
    signal?: AbortSignal
  ): Promise<UnifiedDataset<T>> {
    return this.fetch(endpoint, competition, season, loader, signal);
  }
  private meta(
    source: DatasetMeta["source"],
    status: DatasetStatus
  ): DatasetMeta {
    const now = new Date().toISOString();
    return {
      source,
      lastUpdated: now,
      freshness:
        status === "LIVE" ? "LIVE" : status === "FALLBACK" ? "FRESH" : "FRESH",
      status,
    };
  }
  private async fetch<T>(
    endpoint: Endpoint,
    competition: EngineCompetition,
    season: SeasonContext,
    loader: (provider: EspnProvider | TheSportsDbProvider) => Promise<T>,
    signal?: AbortSignal
  ): Promise<UnifiedDataset<T>> {
    const key = `${endpoint}:${competition}:${season.id}`;
    const cached = this.cache.get(key);
    const pending = this.pending.get(key);
    if (pending) return pending as Promise<UnifiedDataset<T>>;
    const work = (async () => {
      try {
        const data = await loader(this.primary);
        const result = {
          data,
          competition,
          season,
          meta: this.meta("ESPN", "LIVE"),
        } as UnifiedDataset<T>;
        this.cache.set(key, result as UnifiedDataset<unknown>);
        return result;
      } catch (primaryError) {
        try {
          const data = await loader(this.fallback);
          const result = {
            data,
            competition,
            season,
            meta: this.meta("TheSportsDB", "FALLBACK"),
          } as UnifiedDataset<T>;
          this.cache.set(key, result as UnifiedDataset<unknown>);
          return result;
        } catch (fallbackError) {
          if (cached)
            return {
              ...cached,
              meta: {
                ...cached.meta,
                source: "CACHE",
                freshness: "STALE",
                status: "STALE",
              },
            } as UnifiedDataset<T>;
          return {
            data: [] as T,
            competition,
            season,
            meta: {
              source: "NONE" as const,
              lastUpdated: null,
              freshness: "UNKNOWN" as const,
              status: "UNAVAILABLE" as const,
            },
          };
        }
      }
    })();
    this.pending.set(key, work as Promise<UnifiedDataset<unknown>>);
    try {
      return await work;
    } finally {
      this.pending.delete(key);
    }
  }
  invalidate(prefix?: string) {
    Array.from(this.cache.keys()).forEach(key => {
      if (!prefix || key.startsWith(prefix)) this.cache.delete(key);
    });
  }
  cached(key: string) {
    return this.cache.get(key);
  }
}

export type SyncPersistence<T> = {
  persist: (dataset: UnifiedDataset<T>) => Promise<void> | void;
  invalidateCache: (dataset: UnifiedDataset<T>) => Promise<void> | void;
};
export class SyncService<T> {
  constructor(
    private readonly engine: ResilientSportsEngine,
    private readonly persistence: SyncPersistence<T>
  ) {}
  async sync(
    competition: EngineCompetition,
    season: SeasonContext,
    loader: (provider: EspnProvider | TheSportsDbProvider) => Promise<T>,
    signal?: AbortSignal
  ) {
    const dataset = await this.engine.fetchDataset(
      "matches",
      competition,
      season,
      loader,
      signal
    );
    if (dataset.meta.status !== "UNAVAILABLE") {
      await this.persistence.persist(dataset);
      await this.persistence.invalidateCache(dataset);
    }
    return {
      phase: "Fetch → Validate → Normalize → Persist → Invalidate Cache",
      dataset,
    };
  }
  static intervalMs(status: NormalizedStatus | "IDLE") {
    return status === "LIVE" ? 15_000 : status === "IDLE" ? 300_000 : 60_000;
  }
}
