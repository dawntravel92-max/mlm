var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// drizzle/schema.ts
import {
  bigint,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar
} from "drizzle-orm/mysql-core";
var users, matches, syncRuns, dataCache, providerConflicts;
var init_schema = __esm({
  "drizzle/schema.ts"() {
    "use strict";
    users = mysqlTable("users", {
      id: int("id").autoincrement().primaryKey(),
      openId: varchar("openId", { length: 64 }).notNull().unique(),
      name: text("name"),
      email: varchar("email", { length: 320 }),
      loginMethod: varchar("loginMethod", { length: 64 }),
      role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
      lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
    });
    matches = mysqlTable("matches", {
      id: int("id").autoincrement().primaryKey(),
      providerId: varchar("providerId", { length: 128 }).notNull().unique(),
      competition: varchar("competition", { length: 64 }).notNull(),
      competitionLabel: varchar("competitionLabel", { length: 128 }).notNull(),
      seasonId: varchar("seasonId", { length: 16 }),
      homeTeam: varchar("homeTeam", { length: 128 }).notNull(),
      awayTeam: varchar("awayTeam", { length: 128 }).notNull(),
      startTimeUtc: bigint("startTimeUtc", { mode: "number" }).notNull(),
      status: varchar("status", { length: 32 }).notNull(),
      homeScore: int("homeScore"),
      awayScore: int("awayScore"),
      isRealMadrid: int("isRealMadrid").notNull().default(0),
      payload: text("payload").notNull(),
      source: varchar("source", { length: 128 }).notNull(),
      sourceUpdatedAt: timestamp("sourceUpdatedAt").notNull(),
      verifiedAt: timestamp("verifiedAt").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    syncRuns = mysqlTable("syncRuns", {
      id: int("id").autoincrement().primaryKey(),
      source: varchar("source", { length: 128 }).notNull(),
      startedAt: timestamp("startedAt").notNull(),
      completedAt: timestamp("completedAt"),
      status: varchar("status", { length: 32 }).notNull(),
      matchCount: int("matchCount").notNull().default(0),
      latencyMs: int("latencyMs"),
      recordsReceived: int("recordsReceived").notNull().default(0),
      recordsUpdated: int("recordsUpdated").notNull().default(0),
      error: text("error")
    });
    dataCache = mysqlTable("dataCache", {
      id: int("id").autoincrement().primaryKey(),
      cacheKey: varchar("cacheKey", { length: 255 }).notNull().unique(),
      payload: text("payload").notNull(),
      source: varchar("source", { length: 128 }).notNull(),
      storedAt: timestamp("storedAt").notNull(),
      expiresAt: timestamp("expiresAt").notNull(),
      staleUntil: timestamp("staleUntil").notNull()
    });
    providerConflicts = mysqlTable("providerConflicts", {
      id: int("id").autoincrement().primaryKey(),
      matchKey: varchar("matchKey", { length: 255 }).notNull(),
      field: varchar("field", { length: 64 }).notNull(),
      providerA: varchar("providerA", { length: 64 }).notNull(),
      providerB: varchar("providerB", { length: 64 }).notNull(),
      valueA: text("valueA").notNull(),
      valueB: text("valueB").notNull(),
      winnerProvider: varchar("winnerProvider", { length: 64 }).notNull(),
      detectedAt: timestamp("detectedAt").notNull()
    });
  }
});

// server/_core/env.ts
var ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    ENV = {
      appId: process.env.VITE_APP_ID ?? "",
      cookieSecret: process.env.JWT_SECRET ?? "",
      databaseUrl: process.env.DATABASE_URL ?? "",
      oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
      ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
      isProduction: process.env.NODE_ENV === "production",
      forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
      forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
    };
  }
});

// server/validators.ts
import { z } from "zod";
function validateEspnResponse(value, url) {
  const parsed = espnResponseSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid ESPN response from ${url}`);
  return parsed.data;
}
function validateSportsDbResponse(value, url) {
  const parsed = sportsDbResponseSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(`Invalid TheSportsDB response from ${url}`);
  return parsed.data;
}
var externalRecord, externalObject, matchStatus, dataState, flexibleStats, matchEvent, persistedMatchSchema, espnResponseSchema, sportsDbResponseSchema;
var init_validators = __esm({
  "server/validators.ts"() {
    "use strict";
    externalRecord = z.record(z.string(), z.unknown());
    externalObject = z.object({}).catchall(z.unknown());
    matchStatus = z.enum([
      "scheduled",
      "live",
      "completed",
      "postponed",
      "cancelled",
      "unknown"
    ]);
    dataState = z.enum([
      "LIVE",
      "FRESH",
      "VERIFIED",
      "STALE",
      "FALLBACK",
      "UNAVAILABLE",
      "ERROR"
    ]);
    flexibleStats = z.record(z.string(), z.union([z.string(), z.number()]));
    matchEvent = z.object({
      type: z.string(),
      minute: z.string().optional(),
      team: z.string().optional(),
      player: z.string().optional(),
      assist: z.string().optional(),
      detail: z.string().optional()
    });
    persistedMatchSchema = z.object({
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
      sourceConfidence: z.enum(["high", "medium", "low"]).optional()
    }).strict();
    espnResponseSchema = externalObject.extend({
      events: z.array(externalRecord).optional(),
      children: z.array(externalRecord).optional(),
      incidents: z.array(externalRecord).optional(),
      broadcasts: z.array(externalRecord).optional(),
      leaders: z.unknown().optional(),
      boxscore: externalRecord.optional(),
      rosters: z.array(externalRecord).optional(),
      header: externalRecord.optional()
    });
    sportsDbResponseSchema = externalObject.extend({
      events: z.array(externalRecord).optional(),
      results: z.array(externalRecord).optional(),
      table: z.array(externalRecord).optional()
    });
  }
});

// server/db.ts
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values = { openId: user.openId };
  const updateSet = {
    lastSignedIn: user.lastSignedIn ?? /* @__PURE__ */ new Date()
  };
  for (const field of ["name", "email", "loginMethod"]) {
    if (user[field] !== void 0) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.role !== void 0 || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  values.lastSignedIn = user.lastSignedIn ?? /* @__PURE__ */ new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
function sourcePriority(source) {
  return source.toLowerCase().startsWith("espn") ? 2 : source.toLowerCase().startsWith("thesportsdb") ? 1 : 0;
}
async function upsertMatches(items) {
  const db = await getDb();
  if (!db || items.length === 0) return 0;
  let updated = 0;
  for (const item of items) {
    const validated = persistedMatchSchema.safeParse(item);
    if (!validated.success) {
      console.error(
        `[Database] skipped invalid match payload ${item?.providerId ?? "unknown"}`,
        validated.error.issues
      );
      continue;
    }
    const providerExisting = (await db.select().from(matches).where(eq(matches.providerId, item.providerId)).limit(1))[0];
    const tupleWhere = and(
      eq(matches.competition, item.competition),
      eq(matches.homeTeam, item.homeTeam),
      eq(matches.awayTeam, item.awayTeam),
      eq(matches.startTimeUtc, item.startTimeUtc)
    );
    const existing = providerExisting ?? (await db.select().from(matches).where(tupleWhere).limit(1))[0];
    const values = {
      providerId: item.providerId,
      competition: item.competition,
      competitionLabel: item.competitionLabel,
      seasonId: item.seasonId ?? null,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      startTimeUtc: item.startTimeUtc,
      status: item.status,
      homeScore: item.homeScore,
      awayScore: item.awayScore,
      isRealMadrid: item.isRealMadrid ? 1 : 0,
      payload: JSON.stringify(item),
      source: item.source,
      sourceUpdatedAt: new Date(item.sourceUpdatedAt),
      verifiedAt: new Date(item.verifiedAt)
    };
    if (existing) {
      if (sourcePriority(item.source) < sourcePriority(existing.source))
        continue;
      await db.update(matches).set(values).where(eq(matches.id, existing.id));
    } else {
      await db.insert(matches).values(values);
    }
    updated += 1;
  }
  return updated;
}
async function getCachedMatches(from, to) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(matches).where(and(gte(matches.startTimeUtc, from), lte(matches.startTimeUtc, to))).orderBy(desc(matches.isRealMadrid), matches.startTimeUtc);
}
async function createSyncRun(source) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(syncRuns).values({
    source,
    startedAt: /* @__PURE__ */ new Date(),
    status: "running",
    matchCount: 0,
    recordsReceived: 0,
    recordsUpdated: 0
  });
  return result[0]?.insertId ? Number(result[0].insertId) : null;
}
async function finishSyncRun(id, status, matchCount, details = {}) {
  const db = await getDb();
  if (!db || !id) return;
  await db.update(syncRuns).set({
    status,
    matchCount,
    latencyMs: details.latencyMs ?? null,
    recordsReceived: details.recordsReceived ?? matchCount,
    recordsUpdated: details.recordsUpdated ?? 0,
    error: details.error ?? null,
    completedAt: /* @__PURE__ */ new Date()
  }).where(eq(syncRuns.id, id));
}
async function getLastSync() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1);
  return rows[0] ?? null;
}
async function getLastSyncBySource() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(100);
}
async function putDataCache(entry) {
  const db = await getDb();
  if (!db) return;
  await db.insert(dataCache).values(entry).onDuplicateKeyUpdate({
    set: {
      payload: entry.payload,
      source: entry.source,
      storedAt: entry.storedAt,
      expiresAt: entry.expiresAt,
      staleUntil: entry.staleUntil
    }
  });
}
async function getDataCache(cacheKey) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(dataCache).where(eq(dataCache.cacheKey, cacheKey)).limit(1);
  return rows[0] ?? null;
}
async function recordProviderConflicts(conflicts) {
  const db = await getDb();
  if (!db || conflicts.length === 0) return;
  await db.insert(providerConflicts).values(conflicts);
}
async function getRecentProviderConflicts(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(providerConflicts).orderBy(desc(providerConflicts.detectedAt)).limit(limit);
}
var _db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    init_env();
    init_validators();
    _db = null;
  }
});

// shared/domain.ts
function getMatchPollingIntervalMs(match, now = Date.now()) {
  if (match.status === "live") return 15e3;
  if (match.dataState === "LIVE") return 15e3;
  if (match.status === "scheduled") {
    const untilKickoff = match.startTimeUtc - now;
    if (untilKickoff <= 30 * 60 * 1e3) return 3e4;
    if (untilKickoff <= 24 * 60 * 60 * 1e3) return 6e4;
    return 5 * 6e4;
  }
  return 5 * 6e4;
}
function getBundlePollingIntervalMs(matches2, now = Date.now()) {
  if (!matches2.length) return 5 * 6e4;
  return Math.min(
    ...matches2.map((match) => getMatchPollingIntervalMs(match, now))
  );
}
var init_domain = __esm({
  "shared/domain.ts"() {
    "use strict";
  }
});

// server/syncEngine.ts
function circuitFor(provider) {
  const current = circuits.get(provider);
  if (current) return current;
  const created = {
    failures: 0,
    openedAt: null,
    halfOpenProbe: false
  };
  circuits.set(provider, created);
  return created;
}
function getCircuitState(provider, now = Date.now(), cooldownMs = 6e4) {
  const current = circuitFor(provider);
  const isOpen = current.openedAt !== null && now - current.openedAt < cooldownMs;
  const state = isOpen ? "open" : current.openedAt !== null ? "half-open" : "closed";
  return {
    provider,
    state,
    consecutiveFailures: current.failures,
    openedAt: current.openedAt ? new Date(current.openedAt).toISOString() : null,
    nextRetryAt: isOpen ? new Date(current.openedAt + cooldownMs).toISOString() : null
  };
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function withTimeout(work, timeoutMs, parentSignal) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  let rejectAbort;
  const callerAbort = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    controller.abort();
    rejectAbort?.(new DOMException("The operation was aborted", "AbortError"));
  };
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([work(controller.signal), timeout, callerAbort]);
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
  }
}
async function resilientRequest(provider, dedupeKey, work, options = {}, parentSignal) {
  const existing = pending.get(dedupeKey);
  if (existing) {
    if (!parentSignal) return existing;
    return await Promise.race([
      existing,
      new Promise((_, reject) => {
        if (parentSignal.aborted)
          reject(new DOMException("The operation was aborted", "AbortError"));
        else
          parentSignal.addEventListener(
            "abort",
            () => reject(
              new DOMException("The operation was aborted", "AbortError")
            ),
            { once: true }
          );
      })
    ]);
  }
  const timeoutMs = options.timeoutMs ?? 12e3;
  const retries = options.retries ?? (provider === "ESPN" ? 2 : 1);
  const backoffMs = options.backoffMs ?? (provider === "ESPN" ? 250 : 400);
  const failureThreshold = options.circuitFailureThreshold ?? 3;
  const cooldownMs = options.circuitCooldownMs ?? 6e4;
  const circuit = circuitFor(provider);
  const currentState = getCircuitState(provider, Date.now(), cooldownMs);
  if (currentState.state === "open") {
    throw new Error(
      `${provider} circuit open until ${currentState.nextRetryAt}`
    );
  }
  if (currentState.state === "half-open") {
    if (circuit.halfOpenProbe)
      throw new Error(`${provider} circuit half-open probe in progress`);
    circuit.halfOpenProbe = true;
  }
  const request = (async () => {
    let lastError;
    try {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const value = await withTimeout(work, timeoutMs);
          circuit.failures = 0;
          circuit.openedAt = null;
          return value;
        } catch (error) {
          lastError = error;
          if (attempt < retries) await sleep(backoffMs * 2 ** attempt);
        }
      }
      circuit.failures += 1;
      if (circuit.failures >= failureThreshold) circuit.openedAt = Date.now();
      throw lastError instanceof Error ? lastError : new Error(`${provider} request failed`);
    } finally {
      circuit.halfOpenProbe = false;
    }
  })();
  pending.set(dedupeKey, request);
  try {
    return await request;
  } finally {
    pending.delete(dedupeKey);
  }
}
function providerOperationalStatus(provider, lastRun, now = Date.now()) {
  const circuit = getCircuitState(provider, now);
  const lastCheckedAt = lastRun?.completedAt ? new Date(lastRun.completedAt).toISOString() : null;
  return {
    provider,
    status: circuit.state === "open" ? "outage" : lastRun?.status === "success" ? "operational" : lastRun ? "degraded" : "standby",
    circuit: circuit.state,
    latencyMs: lastRun?.latencyMs ?? null,
    lastCheckedAt,
    error: lastRun?.error ?? (circuit.state === "open" ? "Circuit breaker open" : null)
  };
}
var pending, circuits;
var init_syncEngine = __esm({
  "server/syncEngine.ts"() {
    "use strict";
    pending = /* @__PURE__ */ new Map();
    circuits = /* @__PURE__ */ new Map();
  }
});

// server/providerAdapters.ts
function getProviderAdapter(id) {
  return PROVIDER_ADAPTERS.find((adapter) => adapter.id === id) ?? PROVIDER_ADAPTERS[0];
}
var PROVIDER_ADAPTERS;
var init_providerAdapters = __esm({
  "server/providerAdapters.ts"() {
    "use strict";
    PROVIDER_ADAPTERS = [
      {
        id: "ESPN",
        label: "ESPN public soccer feed",
        priority: 100,
        baseUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer",
        authoritative: true,
        mode: "primary",
        capabilities: [
          "fixtures",
          "match_detail",
          "live",
          "incidents",
          "lineups",
          "player_stats",
          "standings",
          "scorers",
          "teams",
          "seasons"
        ]
      },
      {
        id: "TheSportsDB",
        label: "TheSportsDB public feed",
        priority: 50,
        baseUrl: "https://www.thesportsdb.com/api/v1/json/3",
        authoritative: false,
        mode: "fallback",
        capabilities: ["fixtures", "match_detail", "standings", "teams", "seasons"]
      }
    ];
  }
});

// server/redisCache.ts
import Redis from "ioredis";
function getClient() {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (!unavailableLogged) {
      console.info("[Redis] REDIS_URL not configured; using database cache fallback");
      unavailableLogged = true;
    }
    return null;
  }
  if (!client) {
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempts) => Math.min(250 * 2 ** attempts, 5e3)
    });
    client.on(
      "error",
      (error) => console.warn("[Redis] connection failure; database cache fallback active", error)
    );
    client.on(
      "reconnecting",
      (delay) => console.warn(`[Redis] reconnecting in ${delay}ms`)
    );
  }
  return client;
}
async function withRedis(operation) {
  const redis = getClient();
  if (!redis) return null;
  try {
    if (redis.status === "wait") await redis.connect();
    return await operation(redis);
  } catch (error) {
    console.warn("[Redis] operation failed; database cache fallback active", error);
    return null;
  }
}
async function getRedisCache(cacheKey) {
  return withRedis((redis) => redis.get(`rma:${cacheKey}`));
}
async function putRedisCache(cacheKey, payload, ttlMs) {
  const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1e3));
  return withRedis((redis) => redis.set(`rma:${cacheKey}`, payload, "EX", ttlSeconds));
}
var client, unavailableLogged;
var init_redisCache = __esm({
  "server/redisCache.ts"() {
    "use strict";
    client = null;
    unavailableLogged = false;
  }
});

// server/sportsData.ts
var sportsData_exports = {};
__export(sportsData_exports, {
  COMPETITIONS: () => COMPETITIONS,
  aggregatePublishedH2H: () => aggregatePublishedH2H,
  currentSeasonBounds: () => currentSeasonBounds,
  deriveStandingsFromScoreboard: () => deriveStandingsFromScoreboard,
  fetchCompetitionSnapshot: () => fetchCompetitionSnapshot,
  fetchLiveBundle: () => fetchLiveBundle,
  fetchMatchSummary: () => fetchMatchSummary,
  fetchPublishedH2H: () => fetchPublishedH2H,
  fetchRealMadridSeasonFixtures: () => fetchRealMadridSeasonFixtures,
  getDataCenterStatus: () => getDataCenterStatus,
  isPublishedMeeting: () => isPublishedMeeting,
  markStale: () => markStale,
  mergeProviderMatches: () => mergeProviderMatches,
  normalizeOfficialLogo: () => normalizeOfficialLogo,
  parseCachedBundle: () => parseCachedBundle,
  parseLeaderScorers: () => parseLeaderScorers,
  parseMatchIncidents: () => parseMatchIncidents,
  resetLiveDataState: () => resetLiveDataState,
  runScheduledLiveSync: () => runScheduledLiveSync,
  startLiveSyncScheduler: () => startLiveSyncScheduler,
  stopLiveSyncScheduler: () => stopLiveSyncScheduler,
  toEspnRecord: () => toEspnRecord,
  toSportsDbRecord: () => toSportsDbRecord
});
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function currentSeasonBounds(now = /* @__PURE__ */ new Date()) {
  const startYear = now.getUTCMonth() < 6 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const start = new Date(Date.UTC(startYear, 6, 1));
  const end = new Date(
    Math.min(now.getTime(), Date.UTC(startYear + 1, 6, 1) - 1)
  );
  return { start, end, label: `${startYear}-${startYear + 1}` };
}
function currentSeasonLabel(now = /* @__PURE__ */ new Date()) {
  return currentSeasonBounds(now).label;
}
function inferCompetition(event) {
  const league = String(event.strLeague ?? "").toLowerCase();
  if (league.includes("champions")) return "championsLeague";
  if (league.includes("copa") || league.includes("del rey"))
    return "copaDelRey";
  if (league.includes("super") || league.includes("supercopa"))
    return "superCup";
  if (league.includes("laliga") || league.includes("primera") || league.includes("spanish"))
    return "laliga";
  return null;
}
function safeScore(value) {
  if (value === null || value === void 0 || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}
function normalizedTeamName(name) {
  return String(name ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(cf|club de futbol|football club|fc)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function isMadrid(name, id) {
  return REAL_MADRID_TEAM_IDS.has(String(id ?? "")) || REAL_MADRID_NAMES.has(normalizedTeamName(name));
}
function normalizeOfficialLogo(team) {
  const candidates = [
    team?.logo,
    team?.logos?.[0]?.href,
    team?.logos?.[0]?.url,
    team?.team?.logo,
    team?.team?.logos?.[0]?.href,
    team?.team?.logos?.[0]?.url
  ];
  const value = candidates.find(
    (item) => typeof item === "string" && item.trim()
  );
  if (!value) return null;
  const normalized = value.trim();
  return normalized.startsWith("http://") ? `https://${normalized.slice(7)}` : normalized;
}
function classifyIncident(text2) {
  const value = text2.toLowerCase();
  if (value.includes("goal") || value.includes("scored") || value.includes("\u0647\u062F\u0641"))
    return "goal";
  if (value.includes("yellow")) return "yellow_card";
  if (value.includes("red") || value.includes("sent off")) return "red_card";
  if (value.includes("chance") || value.includes("missed")) return "chance";
  return "event";
}
function normalizeStatus(name, state, completed) {
  const text2 = `${name ?? ""} ${state ?? ""}`.toLowerCase();
  if (text2.includes("cancel")) return "cancelled";
  if (text2.includes("cancel")) return "cancelled";
  if (text2.includes("postpon")) return "postponed";
  if (state === "in" || text2.includes("live") || text2.includes("halftime"))
    return "live";
  if (completed || state === "post" || text2.includes("final") || text2.includes("full time") || text2 === "ft")
    return "completed";
  if (state === "pre" || text2.includes("scheduled") || text2 === "ns")
    return "scheduled";
  return "unknown";
}
function validate(record) {
  if (!record.providerId || !record.homeTeam || !record.awayTeam || !Number.isFinite(record.startTimeUtc))
    return null;
  return record;
}
async function fetchJson(url, signal) {
  const provider = url.includes("thesportsdb.com") ? "TheSportsDB" : "ESPN";
  return resilientRequest(
    provider,
    url,
    async (requestSignal) => {
      const response = await fetch(url, {
        signal: requestSignal,
        headers: {
          accept: "application/json",
          "user-agent": "RealMadridMatchDesk/2.0"
        }
      });
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);
      const payload = await response.json();
      const validated = provider === "TheSportsDB" ? validateSportsDbResponse(payload, url) : validateEspnResponse(payload, url);
      return validated;
    },
    {
      timeoutMs: FETCH_TIMEOUT_MS,
      retries: FETCH_RETRIES,
      backoffMs: FETCH_BACKOFF_MS
    },
    signal
  );
}
function toEspnRecord(event, competition, fetchedAt) {
  const competitors = event.competitions?.[0]?.competitors ?? [];
  const homeEntry = competitors.find((item) => item.homeAway === "home");
  const awayEntry = competitors.find((item) => item.homeAway === "away");
  const home = homeEntry?.team;
  const away = awayEntry?.team;
  const start = Date.parse(event.date ?? "");
  if (!event.id || !home?.displayName || !away?.displayName || !Number.isFinite(start))
    return null;
  const detail = event.competitions?.[0];
  const incidents = (detail?.details ?? []).map((item) => ({
    type: classifyIncident(`${item.type?.text ?? ""} ${item.text ?? ""}`),
    minute: item.clock?.displayValue,
    team: item.team?.displayName,
    ...item.team?.logos?.[0]?.href ? { teamLogo: item.team.logos[0].href } : {},
    player: item.athlete?.displayName,
    ...item.athlete?.jersey ? { playerNumber: item.athlete.jersey } : {},
    assist: item.athletesInvolved?.[1]?.displayName,
    ...item.athletesInvolved?.[1]?.jersey ? { assistNumber: item.athletesInvolved[1].jersey } : {},
    detail: item.text
  }));
  const record = {
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
    ) ? safeScore(homeEntry?.score) : null,
    awayScore: ["live", "completed"].includes(
      normalizeStatus(
        detail?.status?.type?.name,
        detail?.status?.type?.state,
        detail?.status?.type?.completed
      )
    ) ? safeScore(awayEntry?.score) : null,
    isRealMadrid: isMadrid(home.displayName, home.id) || isMadrid(away.displayName, away.id),
    events: incidents,
    stats: {},
    lineups: null,
    playerStats: [],
    broadcasters: (detail?.broadcasts ?? []).flatMap((item) => item.names ?? []).filter(Boolean),
    commentary: null,
    source: "ESPN public soccer feed",
    sourceUrl: event.links?.[0]?.href ?? `${ESPN_BASE}/${COMPETITIONS[competition].espn}/scoreboard`,
    sourceUpdatedAt: fetchedAt,
    verifiedAt: fetchedAt,
    dataState: "VERIFIED",
    sourceConfidence: "high"
  };
  return validate(record);
}
function toSportsDbRecord(event, competition, fetchedAt) {
  const rawTimestamp = String(event.strTimestamp ?? "").trim();
  const timestamp2 = rawTimestamp ? /([zZ]|[+-]\d{2}:?\d{2})$/.test(rawTimestamp) ? rawTimestamp : `${rawTimestamp}Z` : `${event.dateEvent}T${event.strTime ?? "12:00:00"}Z`;
  const start = Date.parse(timestamp2);
  const record = {
    providerId: `tsdb-${event.idEvent}`,
    competition,
    competitionLabel: COMPETITIONS[competition].label,
    homeTeam: event.strHomeTeam,
    awayTeam: event.strAwayTeam,
    homeLogo: event.strHomeTeamBadge ?? null,
    awayLogo: event.strAwayTeamBadge ?? null,
    venue: event.strVenue || null,
    round: event.intRound ? `\u0627\u0644\u062C\u0648\u0644\u0629 ${event.intRound}` : null,
    startTimeUtc: start,
    status: normalizeStatus(
      event.strStatus,
      event.strStatus,
      event.strStatus === "FT"
    ),
    homeScore: safeScore(event.intHomeScore),
    awayScore: safeScore(event.intAwayScore),
    isRealMadrid: isMadrid(event.strHomeTeam ?? "", event.idHomeTeam) || isMadrid(event.strAwayTeam ?? "", event.idAwayTeam),
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
    sourceConfidence: "medium"
  };
  return validate(record);
}
function dateKey(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}
function buildChunks(from, to, days = 45) {
  const chunks = [];
  let cursor = new Date(from);
  while (cursor < to) {
    const end = new Date(
      Math.min(cursor.getTime() + days * 864e5, to.getTime())
    );
    chunks.push([new Date(cursor), end]);
    cursor = end;
  }
  return chunks;
}
async function fetchEspnCompetition(competition, from, to, signal) {
  const fetchedAt = nowIso();
  const chunks = buildChunks(from, to);
  const payloads = await Promise.all(
    chunks.map(
      ([start, end]) => fetchJson(
        `${ESPN_BASE}/${COMPETITIONS[competition].espn}/scoreboard?limit=1000&dates=${dateKey(start)}-${dateKey(end)}`,
        signal
      )
    )
  );
  return payloads.flatMap(
    (body) => (body.events ?? []).map((event) => toEspnRecord(event, competition, fetchedAt)).filter(Boolean)
  ).filter((match) => match.isRealMadrid);
}
async function fetchSportsDbMatches(signal) {
  const fetchedAt = nowIso();
  const urls = [
    `${SPORTS_DB_BASE}/eventsnext.php?id=${"133738"}`,
    `${SPORTS_DB_BASE}/eventslast.php?id=${"133738"}`
  ];
  const responses = await Promise.allSettled(
    urls.map((url) => fetchJson(url, signal))
  );
  if (responses.every((result) => result.status === "rejected")) {
    const errors = responses.filter(
      (result) => result.status === "rejected"
    ).map(
      (result) => result.reason instanceof Error ? result.reason.message : String(result.reason)
    );
    throw new Error(errors.join(" | ") || "TheSportsDB returned no responses");
  }
  const events = responses.flatMap(
    (result) => result.status === "fulfilled" ? result.value.events ?? result.value.results ?? [] : []
  );
  return events.map((event) => {
    const competition = inferCompetition(event);
    return competition ? toSportsDbRecord(event, competition, fetchedAt) : null;
  }).filter(Boolean);
}
function dedupeMatches(items) {
  const map = /* @__PURE__ */ new Map();
  const providerKeys = /* @__PURE__ */ new Map();
  for (const item of items) {
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
function resetLiveDataState() {
  bundleCache = null;
  lastSecondaryAuditAt = 0;
  bundleRequests.clear();
}
function bundleCacheKey(from, to) {
  return `${from.toISOString().slice(0, 10)}:${to.toISOString().slice(0, 10)}`;
}
function matchKey(item) {
  return `${item.competition}:${item.homeTeam.trim().toLowerCase()}:${item.awayTeam.trim().toLowerCase()}:${new Date(item.startTimeUtc).toISOString().slice(0, 10)}`;
}
function stableValue(value) {
  return value === void 0 || value === null ? "\u2205" : JSON.stringify(value);
}
function mergeProviderMatches(espnMatches, sportsDbMatches, detectedAt = /* @__PURE__ */ new Date()) {
  const espnByKey = new Map(espnMatches.map((item) => [matchKey(item), item]));
  const conflicts = [];
  const conflictFields = [
    "startTimeUtc",
    "status",
    "homeScore",
    "awayScore",
    "events",
    "stats"
  ];
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
          detectedAt
        });
      }
    }
  }
  const merged = [...espnMatches, ...sportsDbMatches].map((item) => {
    const primary = espnByKey.get(matchKey(item));
    const fallback = sportsDbMatches.find((candidate) => matchKey(candidate) === matchKey(item));
    return primary && fallback && item === primary ? mergeMatchFields(primary, fallback) : item;
  });
  return {
    matches: dedupeMatches(merged),
    conflicts
  };
}
function chooseFieldProvider(field, primary, fallback) {
  const primaryValue = primary[field];
  const fallbackValue = fallback[field];
  if (field === "stats" || field === "events") {
    const primarySize = Array.isArray(primaryValue) ? primaryValue.length : Object.keys(primaryValue ?? {}).length;
    const fallbackSize = Array.isArray(fallbackValue) ? fallbackValue.length : Object.keys(fallbackValue ?? {}).length;
    return fallbackSize > primarySize ? "TheSportsDB" : "ESPN";
  }
  if (primaryValue === null || primaryValue === void 0 || primaryValue === "") return "TheSportsDB";
  return "ESPN";
}
function mergeMatchFields(primary, fallback) {
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
    sourceUpdatedAt: new Date(Math.max(Date.parse(primary.sourceUpdatedAt), Date.parse(fallback.sourceUpdatedAt))).toISOString()
  };
}
function parseCachedBundle(payload, source, stale = false) {
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || !Array.isArray(parsed.matches) || !parsed.cacheKey || !parsed.source || !parsed.sourceUpdatedAt || !parsed.dataState)
      return null;
    const validMatches = parsed.matches.filter(
      (match) => match && typeof match.providerId === "string" && typeof match.competition === "string" && COMPETITIONS[match.competition] && typeof match.status === "string" && Number.isFinite(match.startTimeUtc) && typeof match.homeTeam === "string" && typeof match.awayTeam === "string" && typeof match.source === "string" && typeof match.sourceUpdatedAt === "string" && typeof match.verifiedAt === "string" && [
        "LIVE",
        "FRESH",
        "VERIFIED",
        "STALE",
        "FALLBACK",
        "UNAVAILABLE",
        "ERROR"
      ].includes(match.dataState)
    );
    if (validMatches.length !== parsed.matches.length) return null;
    return {
      ...parsed,
      source: stale ? `${source} \xB7 stale cache` : parsed.source,
      dataState: stale ? "STALE" : parsed.dataState,
      matches: stale ? markStale(validMatches) : validMatches
    };
  } catch {
    return null;
  }
}
function ensureBundleRefresh(from, to, signal) {
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
async function fetchLiveBundle(from, to, signal, options) {
  const cacheKey = bundleCacheKey(from, to);
  const now = Date.now();
  if (bundleCache && bundleCache.expiresAt > now && bundleCache.bundle.cacheKey === cacheKey)
    return bundleCache.bundle;
  let persisted = null;
  if (!options?.bypassPersistentCache)
    try {
      const redisPayload = await getRedisCache(cacheKey);
      const row = redisPayload ? {
        payload: redisPayload,
        source: "Redis cache",
        expiresAt: new Date(now + BUNDLE_TTL_MS),
        staleUntil: new Date(now + BUNDLE_TTL_MS + BUNDLE_STALE_WINDOW_MS)
      } : await getDataCache(cacheKey);
      if (row) {
        const isFresh = row.expiresAt.getTime() > now;
        persisted = parseCachedBundle(String(row.payload), String(row.source), !isFresh);
        if (persisted && isFresh) {
          bundleCache = {
            expiresAt: row.expiresAt.getTime(),
            bundle: persisted
          };
          return persisted;
        }
        if (persisted && row.staleUntil.getTime() > now) {
          void ensureBundleRefresh(from, to, signal).catch(
            (error) => console.warn("[Live bundle] background refresh failed", error)
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
    if (bundleCache?.bundle.cacheKey === cacheKey && bundleCache.bundle.matches.length > 0) {
      return {
        ...bundleCache.bundle,
        source: "In-memory cache \xB7 stale fallback",
        dataState: "STALE",
        matches: markStale(bundleCache.bundle.matches)
      };
    }
    if (persisted) return persisted;
    return refreshed;
  } catch (error) {
    if (bundleCache?.bundle.cacheKey === cacheKey) {
      return {
        ...bundleCache.bundle,
        source: "In-memory cache \xB7 stale fallback",
        dataState: "STALE",
        matches: markStale(bundleCache.bundle.matches)
      };
    }
    if (persisted) return persisted;
    throw error;
  }
}
async function fetchLiveBundleUncached(from, to, signal) {
  const checkedAt = nowIso();
  const cacheKey = bundleCacheKey(from, to);
  const primaryStarted = Date.now();
  const primaryRunId = await createSyncRun("ESPN");
  const results = await Promise.allSettled(
    Object.keys(COMPETITIONS).map(
      (competition) => fetchEspnCompetition(competition, from, to, signal)
    )
  );
  const primaryMatches = results.flatMap(
    (result) => result.status === "fulfilled" ? result.value : []
  );
  const failures = results.filter(
    (result) => result.status === "rejected"
  ).length;
  const primaryErrors = results.filter(
    (result) => result.status === "rejected"
  ).map(
    (result) => result.reason instanceof Error ? result.reason.message : String(result.reason)
  );
  const primaryHealth = {
    name: "ESPN",
    status: results.some((result) => result.status === "fulfilled") ? "ok" : "failed",
    checkedAt,
    latencyMs: Date.now() - primaryStarted,
    url: `${ESPN_BASE}/.../scoreboard`,
    message: primaryErrors.length ? primaryErrors.slice(0, 2).join(" \xB7 ") : void 0
  };
  let selectedMatches = primaryMatches;
  let source = "ESPN public soccer feed";
  let dataState2 = primaryMatches.length ? primaryMatches.some((match) => match.status === "live") ? "LIVE" : "VERIFIED" : "UNAVAILABLE";
  const fallbackStarted = Date.now();
  const fallbackNeeded = failures > 0 || primaryMatches.length === 0;
  const auditDue = Date.now() - lastSecondaryAuditAt >= SHADOW_PROVIDER_AUDIT_MS;
  const shouldQuerySecondary = fallbackNeeded || auditDue;
  let fallbackMatches = [];
  let conflicts = [];
  const fallbackHealth = {
    name: "TheSportsDB",
    status: shouldQuerySecondary ? "failed" : "standby",
    checkedAt,
    latencyMs: null,
    url: `${SPORTS_DB_BASE}/eventsnext.php?id=${"133738"}`
  };
  const fallbackRunId = shouldQuerySecondary ? await createSyncRun("TheSportsDB") : null;
  if (shouldQuerySecondary) {
    try {
      fallbackMatches = (await fetchSportsDbMatches(signal)).filter(
        (item) => item.startTimeUtc >= from.getTime() && item.startTimeUtc <= to.getTime()
      );
      lastSecondaryAuditAt = Date.now();
      const merged = mergeProviderMatches(
        primaryMatches,
        fallbackMatches,
        /* @__PURE__ */ new Date()
      );
      selectedMatches = merged.matches;
      conflicts = merged.conflicts;
      fallbackHealth.status = fallbackMatches.length ? "ok" : "failed";
      fallbackHealth.latencyMs = Date.now() - fallbackStarted;
      fallbackHealth.message = fallbackMatches.length ? fallbackNeeded ? "Used after primary degradation" : "Shadow-audited for agreement" : "No records returned in range";
      if (fallbackNeeded && fallbackMatches.length) {
        dataState2 = "FALLBACK";
        source = primaryMatches.length ? "ESPN + TheSportsDB fallback" : "TheSportsDB fallback";
      }
    } catch (error) {
      fallbackHealth.status = "failed";
      fallbackHealth.latencyMs = Date.now() - fallbackStarted;
      fallbackHealth.message = error instanceof Error ? error.message : "TheSportsDB request failed";
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
    results.some((result) => result.status === "fulfilled") ? "success" : "failed",
    primaryMatches.length,
    {
      latencyMs: Date.now() - primaryStarted,
      recordsReceived: primaryMatches.length,
      recordsUpdated,
      error: primaryErrors.length ? primaryErrors.join(" | ") : null
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
        error: fallbackHealth.status === "failed" ? fallbackHealth.message : null
      }
    );
  }
  const officialHealth = {
    name: "Real Madrid / LaLiga / UEFA",
    status: "standby",
    checkedAt,
    latencyMs: null,
    url: "https://www.realmadrid.com/en-US/schedule",
    message: "Official source retained for manual review"
  };
  const bundle = {
    matches: finalMatches,
    source,
    sourceUpdatedAt: checkedAt,
    dataState: dataState2,
    failures,
    sources: [primaryHealth, fallbackHealth, officialHealth],
    cacheKey,
    sourceConfidence: source.startsWith("ESPN") ? "high" : "medium"
  };
  try {
    const payload = JSON.stringify(bundle);
    await putRedisCache(cacheKey, payload, BUNDLE_TTL_MS + BUNDLE_STALE_WINDOW_MS);
    await putDataCache({
      cacheKey,
      payload,
      source,
      storedAt: /* @__PURE__ */ new Date(),
      expiresAt: new Date(Date.now() + BUNDLE_TTL_MS),
      staleUntil: new Date(Date.now() + BUNDLE_TTL_MS + BUNDLE_STALE_WINDOW_MS)
    });
  } catch (error) {
    console.warn("[Live bundle] operational cache write failed", error);
  }
  bundleCache = { expiresAt: Date.now() + BUNDLE_TTL_MS, bundle };
  return bundle;
}
async function runScheduledLiveSync() {
  schedulerState.running = true;
  schedulerState.lastRunAt = nowIso();
  try {
    const from = new Date(Date.now() - 2 * 864e5);
    const to = new Date(Date.now() + 30 * 864e5);
    return await fetchLiveBundle(from, to);
  } finally {
    schedulerState.running = false;
  }
}
function startLiveSyncScheduler() {
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
      const delay = 6e4;
      schedulerState.nextRunAt = new Date(Date.now() + delay).toISOString();
      schedulerState.timer = setTimeout(() => void tick(), delay);
    }
  };
  void tick();
}
function stopLiveSyncScheduler() {
  if (schedulerState.timer) clearTimeout(schedulerState.timer);
  schedulerState.timer = null;
  schedulerState.nextRunAt = null;
}
async function getDataCenterStatus() {
  const runs = await getLastSyncBySource();
  const lastFor = (provider) => runs.find((run) => run.source === provider) ?? null;
  const espnRun = lastFor("ESPN");
  const sportsDbRun = lastFor("TheSportsDB");
  let cached = bundleCache?.bundle ?? null;
  if (!cached) {
    const schedulerKey = bundleCacheKey(
      new Date(Date.now() - 2 * 864e5),
      new Date(Date.now() + 30 * 864e5)
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
  const ageMs = cached?.sourceUpdatedAt ? Math.max(0, Date.now() - Date.parse(cached.sourceUpdatedAt)) : null;
  const indicator = freshnessState === "LIVE" ? "live" : freshnessState === "STALE" ? "stale" : freshnessState === "UNAVAILABLE" ? "unavailable" : "fresh";
  const sourceHealth = (name) => cached?.sources.find((source) => source.name === name) ?? null;
  const runLike = (name, run) => {
    if (run) return run;
    const health = sourceHealth(name);
    return health ? {
      status: health.status === "ok" ? "success" : health.status === "failed" ? "failed" : "standby",
      latencyMs: health.latencyMs,
      completedAt: health.checkedAt,
      error: health.message ?? null
    } : null;
  };
  return {
    generatedAt: nowIso(),
    lastSync: runs[0]?.completedAt?.toISOString() ?? null,
    nextSync: schedulerState.nextRunAt,
    scheduler: {
      running: schedulerState.running,
      lastRunAt: schedulerState.lastRunAt
    },
    providers: [
      providerOperationalStatus("ESPN", runLike("ESPN", espnRun)),
      providerOperationalStatus(
        "TheSportsDB",
        runLike("TheSportsDB", sportsDbRun)
      )
    ],
    freshness: {
      state: freshnessState,
      source: cached?.source ?? "No data loaded",
      updatedAt: cached?.sourceUpdatedAt ?? null,
      ageMs,
      indicator
    },
    fallback: {
      active: freshnessState === "FALLBACK" || freshnessState === "STALE",
      state: freshnessState,
      source: cached?.source ?? "Unavailable",
      message: freshnessState === "FALLBACK" ? "ESPN degraded; fallback data is being served" : freshnessState === "STALE" ? "Provider unavailable; stale cache is being shown" : null
    },
    recentConflicts: await getRecentProviderConflicts(12)
  };
}
function markStale(matches2, maxAgeMs = 10 * 60 * 1e3) {
  const now = Date.now();
  return matches2.map((match) => ({
    ...match,
    dataState: now - Date.parse(match.sourceUpdatedAt) > maxAgeMs ? "STALE" : match.dataState
  }));
}
function parseEspnStandings(body) {
  const groups = body.children ?? body.standings?.groups ?? body.standings?.entries ?? [];
  const entries = Array.isArray(groups) ? groups.flatMap(
    (group) => Array.isArray(group?.standings?.entries) ? group.standings.entries : Array.isArray(group?.entries) ? group.entries : group?.team ? [group] : []
  ) : [];
  return entries.map((entry, index) => {
    const stats = Object.fromEntries(
      (entry.stats ?? []).map((stat) => [
        stat.name,
        stat.value ?? stat.displayValue
      ])
    );
    const number = (...keys) => {
      for (const key of keys)
        if (stats[key] !== void 0 && stats[key] !== null && stats[key] !== "")
          return Number(stats[key]) || 0;
      return null;
    };
    return {
      rank: Number(stats.rank ?? index + 1),
      team: entry.team?.displayName ?? entry.team?.name ?? "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
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
      allStats: stats
    };
  }).filter((row) => row.team !== "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641");
}
function deriveStandingsFromScoreboard(events, asOf = Date.now()) {
  const table = /* @__PURE__ */ new Map();
  const ensure = (competitor) => {
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
        form: []
      });
    return table.get(key);
  };
  for (const event of events ?? []) {
    const kickoff = Date.parse(event.date ?? "");
    if (!Number.isFinite(kickoff) || kickoff > asOf) continue;
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors ?? [];
    const home = competitors.find((item) => item.homeAway === "home");
    const away = competitors.find((item) => item.homeAway === "away");
    const homeScore = safeScore(home?.score);
    const awayScore = safeScore(away?.score);
    const status = normalizeStatus(
      competition?.status?.type?.name,
      competition?.status?.type?.state,
      competition?.status?.type?.completed
    );
    if (!home || !away || homeScore === null || awayScore === null || status !== "completed")
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
  return Array.from(table.values()).sort(
    (a, b) => b.points - a.points || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team)
  ).map((row, index) => ({
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
      goalDifference: row.goalsFor - row.goalsAgainst
    }
  }));
}
async function fetchSportsDbSnapshot(competition, signal) {
  const league = COMPETITIONS[competition].tsdbLeague;
  if (!league) return null;
  const season = currentSeasonLabel();
  const body = await fetchJson(
    `${SPORTS_DB_BASE}/lookuptable.php?l=${league}&s=${season}`,
    signal
  );
  const standings = (body.table ?? []).map((row, index) => ({
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
      goalDifference: Number(row.intGoalDifference ?? 0)
    }
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
    standingsStatus: standings.length ? "available" : "unavailable"
  };
}
function extractLeaderCategories(body) {
  const result = [];
  const visit = (value) => {
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
function isGoalsLeaderCategory(category) {
  const name = `${category?.name ?? ""} ${category?.displayName ?? ""}`.toLowerCase();
  return /goal|scor/.test(name) && !/assist|pass|shot|save|tackle/.test(name);
}
function scorerValue(entry) {
  const statisticValue = (names) => (entry.athlete?.statistics ?? entry.statistics ?? []).find(
    (stat) => names.includes(String(stat.name ?? stat.abbreviation ?? "").toLowerCase())
  )?.value;
  return safeScore(
    entry.value ?? entry.goals ?? statisticValue(["goals", "totalgoals", "scoring"])
  );
}
function parseLeaderScorers(body) {
  const categories = extractLeaderCategories(body).filter(
    isGoalsLeaderCategory
  );
  const seen = /* @__PURE__ */ new Set();
  return categories.flatMap(
    (category) => (category.leaders ?? []).map((entry) => {
      const player = entry.athlete?.displayName ?? entry.athlete?.fullName;
      const team = entry.team?.displayName ?? entry.athlete?.team?.displayName ?? entry.athlete?.team?.name ?? "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641";
      const goals = scorerValue(entry);
      const key = `${player ?? ""}|${team}`;
      if (!player || seen.has(key)) return null;
      seen.add(key);
      return {
        player,
        team,
        ...normalizeOfficialLogo(entry.team ?? entry.athlete?.team) ? { teamLogo: normalizeOfficialLogo(entry.team ?? entry.athlete?.team) } : {},
        goals,
        assists: safeScore(
          entry.assists ?? entry.athlete?.statistics?.find(
            (stat) => ["goalassists", "assists"].includes(
              String(stat.name ?? stat.abbreviation ?? "").toLowerCase()
            )
          )?.value
        ),
        photo: entry.athlete?.headshot?.href ?? entry.athlete?.headshot?.url ?? entry.athlete?.jerseyImages?.[0]?.href ?? null
      };
    }).filter(Boolean)
  ).sort((a, b) => (b.goals ?? -1) - (a.goals ?? -1)).slice(0, 20);
}
function parsePlayerStats(teams, source) {
  return teams.flatMap(
    (team) => (team.roster ?? []).map((entry) => ({
      playerId: String(
        entry.athlete?.id ?? `${team.team?.id}-${entry.jersey ?? entry.athlete?.displayName}`
      ),
      player: entry.athlete?.displayName ?? "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
      team: team.team?.displayName ?? "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
      teamLogo: normalizeOfficialLogo(team),
      position: entry.position?.displayName ?? entry.position?.name ?? null,
      jersey: entry.jersey ?? null,
      starter: Boolean(entry.starter),
      minutes: safeScore(
        entry.stats?.find(
          (stat) => ["minutesPlayed", "minutes"].includes(stat.name)
        )?.value
      ),
      stats: Object.fromEntries(
        (entry.stats ?? []).map((stat) => [
          stat.abbreviation ?? stat.shortDisplayName ?? stat.name,
          stat.displayValue ?? stat.value
        ])
      ),
      source
    }))
  ).filter((item) => item.player !== "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641");
}
function parseLineups(teams) {
  return teams.map((team) => ({
    team: team.team?.displayName ?? "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
    teamLogo: normalizeOfficialLogo(team),
    formation: team.formation?.displayName ?? team.formation ?? null,
    coach: team.coach?.displayName ?? team.coach?.name ?? team.manager?.displayName ?? team.manager?.name ?? team.coaches?.[0]?.displayName ?? team.coaches?.[0]?.name ?? null,
    coachPhoto: team.coach?.headshot?.href ?? team.coach?.photo ?? team.manager?.headshot?.href ?? team.manager?.photo ?? team.coaches?.[0]?.headshot?.href ?? null,
    players: (team.roster ?? []).map((entry) => ({
      playerId: String(
        entry.athlete?.id ?? entry.jersey ?? entry.athlete?.displayName
      ),
      player: entry.athlete?.displayName ?? "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
      position: entry.position?.displayName ?? entry.position?.name ?? null,
      jersey: entry.jersey ?? null,
      starter: Boolean(entry.starter),
      status: entry.subbedOut ? "\u063A\u0627\u062F\u0631" : entry.subbedIn ? "\u0628\u062F\u064A\u0644 \u062F\u0627\u062E\u0644" : entry.starter ? "\u0623\u0633\u0627\u0633\u064A" : "\u0628\u062F\u064A\u0644",
      photo: entry.athlete?.headshot?.href ?? entry.athlete?.jerseyImages?.[0]?.href ?? null
    }))
  }));
}
async function fetchSeasonScoreboard(competition, signal) {
  const now = /* @__PURE__ */ new Date();
  const seasonYear = now.getUTCMonth() < 6 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const bounds = currentSeasonBounds(now);
  const start = bounds.start;
  const end = bounds.end;
  const body = await fetchJson(
    `${ESPN_BASE}/${COMPETITIONS[competition].espn}/scoreboard?limit=1000&dates=${dateKey(start)}-${dateKey(end)}`,
    signal
  );
  return body.events ?? [];
}
async function fetchCompetitionSnapshot(competition, signal) {
  const config = COMPETITIONS[competition];
  const [standingsResult, leadersResult, seasonEventsResult] = await Promise.allSettled([
    config.supportsStandings ? fetchJson(`${ESPN_BASE}/${config.espn}/standings`, signal) : Promise.resolve(null),
    fetchJson(`${ESPN_BASE}/${config.espn}/statistics`, signal),
    config.supportsStandings ? fetchSeasonScoreboard(competition, signal) : Promise.resolve([])
  ]);
  const directStandings = standingsResult.status === "fulfilled" && standingsResult.value ? parseEspnStandings(standingsResult.value) : [];
  const derivedStandings = directStandings.length ? directStandings : seasonEventsResult.status === "fulfilled" ? deriveStandingsFromScoreboard(seasonEventsResult.value) : [];
  const scorers = leadersResult.status === "fulfilled" && leadersResult.value ? parseLeaderScorers(leadersResult.value) : [];
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
      note: "\u0647\u0630\u0647 \u0628\u0637\u0648\u0644\u0629 \u062E\u0631\u0648\u062C \u0645\u063A\u0644\u0648\u0628\u060C \u0644\u0630\u0644\u0643 \u0644\u0627 \u064A\u0648\u062C\u062F \u062C\u062F\u0648\u0644 \u062A\u0631\u062A\u064A\u0628 \u062F\u0648\u0631\u064A."
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
      note: directStandings.length ? void 0 : "\u062A\u0645 \u0627\u062D\u062A\u0633\u0627\u0628 \u0627\u0644\u062A\u0631\u062A\u064A\u0628 \u0645\u0646 \u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0645\u0628\u0627\u0631\u064A\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0645\u0644\u0629 \u0644\u0623\u0646 \u0645\u0633\u0627\u0631 standings \u0623\u0639\u0627\u062F \u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0641\u0627\u0631\u063A\u0629."
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
    source: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0635\u062F\u0631 \u0645\u0633\u062A\u062C\u064A\u0628",
    sourceUrl: config.official,
    sourceUpdatedAt: null,
    dataState: "UNAVAILABLE",
    standingsStatus: "unavailable"
  };
}
function parseMatchIncidents(body) {
  const rawEvents = body?.incidents?.length ? body.incidents : body?.keyEvents ?? [];
  const teamLogos = Object.fromEntries((body?.header?.competitions?.[0]?.competitors ?? []).map((item) => [item.team?.displayName, normalizeOfficialLogo(item.team)]));
  return rawEvents.map((incident) => ({
    type: classifyIncident(
      `${incident.type?.text ?? incident.type ?? ""} ${incident.text ?? ""}`
    ),
    minute: incident.clock?.displayValue ?? incident.time,
    team: incident.team?.displayName,
    ...incident.team?.logos?.[0]?.href ?? teamLogos[incident.team?.displayName] ? { teamLogo: incident.team?.logos?.[0]?.href ?? teamLogos[incident.team?.displayName] } : {},
    player: incident.athlete?.displayName ?? incident.text,
    ...incident.athlete?.jersey ? { playerNumber: incident.athlete.jersey } : {},
    assist: incident.athletesInvolved?.find(
      (p) => p.displayName !== incident.athlete?.displayName
    )?.displayName,
    ...incident.athletesInvolved?.find((p) => p.displayName !== incident.athlete?.displayName)?.jersey ? { assistNumber: incident.athletesInvolved.find((p) => p.displayName !== incident.athlete?.displayName).jersey } : {},
    detail: incident.text
  }));
}
async function fetchMatchSummary(matchId, competition, signal) {
  if (matchId.startsWith("tsdb-")) {
    const eventId2 = matchId.replace("tsdb-", "");
    const body2 = await fetchJson(
      `${SPORTS_DB_BASE}/lookupevent.php?id=${eventId2}`,
      signal
    );
    return {
      incidents: [],
      stats: {},
      lineups: null,
      playerStats: [],
      lineupReleaseAt: null,
      broadcasters: [],
      commentary: body2.events?.[0]?.strDescriptionEN || null,
      source: "TheSportsDB public feed",
      sourceUpdatedAt: nowIso(),
      dataState: "FALLBACK",
      sources: [{ name: "TheSportsDB", status: "ok" }]
    };
  }
  const eventId = matchId.replace("espn-", "");
  const [summaryResult, secondaryResult, fallbackResult] = await Promise.allSettled([
    fetchJson(
      `${ESPN_BASE}/${COMPETITIONS[competition].espn}/summary?event=${encodeURIComponent(eventId)}`,
      signal
    ),
    fetchJson(
      `${ESPN_BASE}/${COMPETITIONS[competition].espn}/summary?event=${encodeURIComponent(eventId)}&lang=en`,
      signal
    ),
    fetchSportsDbMatches(signal)
  ]);
  const body = summaryResult.status === "fulfilled" ? summaryResult.value : secondaryResult.status === "fulfilled" ? secondaryResult.value : null;
  if (!body) throw new Error("No match detail source responded");
  const competitionHeader = body.header?.competitions?.[0] ?? {};
  const headerCompetitors = competitionHeader.competitors ?? [];
  const headerHome = headerCompetitors.find(
    (item) => item.homeAway === "home"
  );
  const headerAway = headerCompetitors.find(
    (item) => item.homeAway === "away"
  );
  const referee = (body.gameInfo?.officials ?? body.header?.competitions?.[0]?.officials ?? []).map((official) => official.displayName ?? official.name).filter(Boolean).join(", ") || null;
  const incidents = parseMatchIncidents(body);
  const stats = {};
  const statKey = (stat) => {
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
      const previous = stats[key];
      stats[key] = { home: previous?.home ?? (side === "home" ? value : 0), away: previous?.away ?? (side === "away" ? value : 0) };
    }
  }
  const teams = body.boxscore?.teams ?? [];
  const rosterTeams = body.rosters?.length ? body.rosters : teams;
  const kickoff = Date.parse(
    body.header?.competitions?.[0]?.date ?? body.date ?? ""
  );
  const alternateMatches = fallbackResult.status === "fulfilled" ? fallbackResult.value : [];
  const alternate = alternateMatches.find(
    (item) => Math.abs(item.startTimeUtc - kickoff) < 36 * 36e5 && (item.homeTeam.toLowerCase().includes(
      body.header?.competitions?.[0]?.competitors?.[0]?.team?.displayName?.toLowerCase?.() ?? "never"
    ) || item.awayTeam.toLowerCase().includes(
      body.header?.competitions?.[0]?.competitors?.[0]?.team?.displayName?.toLowerCase?.() ?? "never"
    ))
  );
  return {
    header: {
      venue: body.gameInfo?.venue?.fullName ?? competitionHeader.venue?.fullName ?? null,
      city: body.gameInfo?.venue?.address?.city ?? null,
      referee,
      season: body.header?.season?.displayName ?? body.header?.season?.slug ?? null,
      statusDetail: competitionHeader.status?.type?.shortDetail ?? competitionHeader.status?.type?.detail ?? null,
      period: competitionHeader.status?.period ?? null,
      clock: competitionHeader.status?.displayClock ?? null,
      homeScore: safeScore(headerHome?.score),
      awayScore: safeScore(headerAway?.score),
      homeHalfTime: safeScore(headerHome?.linescores?.[0]?.value),
      awayHalfTime: safeScore(headerAway?.linescores?.[0]?.value)
    },
    incidents,
    stats,
    lineups: rosterTeams.length ? parseLineups(rosterTeams) : null,
    playerStats: rosterTeams.length ? parsePlayerStats(rosterTeams, "ESPN match summary roster") : [],
    lineupReleaseAt: Number.isFinite(kickoff) ? kickoff - 45 * 6e4 : null,
    broadcasters: (body.broadcasts ?? body.header?.competitions?.[0]?.broadcasts ?? []).flatMap((item) => item.names ?? []).filter(Boolean),
    commentary: body.broadcasts?.[0]?.commentators?.map((c) => c.name).join(", ") ?? alternate?.commentary ?? null,
    leaders: body.leaders ? parseLeaderScorers(body.leaders) : [],
    source: "ESPN match summary",
    sourceUpdatedAt: nowIso(),
    dataState: normalizeStatus(
      competitionHeader.status?.type?.name,
      competitionHeader.status?.type?.state,
      competitionHeader.status?.type?.completed
    ) === "live" ? "LIVE" : "VERIFIED",
    sources: [
      {
        name: "ESPN summary",
        status: summaryResult.status === "fulfilled" ? "ok" : "failed"
      },
      {
        name: "ESPN secondary summary path",
        status: secondaryResult.status === "fulfilled" ? "ok" : "failed"
      },
      {
        name: "TheSportsDB fallback path",
        status: fallbackResult.status === "fulfilled" ? "ok" : "failed"
      }
    ]
  };
}
function isPublishedMeeting(match, teamA, teamB) {
  const sides = [
    normalizedTeamName(match.homeTeam),
    normalizedTeamName(match.awayTeam)
  ];
  const requested = [normalizedTeamName(teamA), normalizedTeamName(teamB)];
  return requested.every((team) => sides.includes(team));
}
function aggregatePublishedH2H(matches2, teamA, teamB) {
  return matches2.reduce(
    (acc, match) => {
      if (!isPublishedMeeting(match, teamA, teamB) || match.status !== "completed" || match.homeScore == null || match.awayScore == null)
        return acc;
      const aHome = normalizedTeamName(match.homeTeam) === normalizedTeamName(teamA);
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
async function fetchHistoricalMadridSchedule(signal) {
  const from = /* @__PURE__ */ new Date("2010-07-01T00:00:00Z");
  const to = /* @__PURE__ */ new Date();
  const results = await Promise.allSettled(
    Object.keys(COMPETITIONS).map(async (competition) => {
      const body = await fetchJson(
        `${ESPN_BASE}/${COMPETITIONS[competition].espn}/teams/86/schedule?limit=1000&dates=${dateKey(from)}-${dateKey(to)}`,
        signal
      );
      return (body.events ?? []).map((event) => toEspnRecord(event, competition, nowIso())).filter(Boolean);
    })
  );
  return results.flatMap(
    (result) => result.status === "fulfilled" ? result.value : []
  );
}
async function fetchPublishedH2H(teamA, teamB, signal) {
  const now = Date.now();
  const cached = await getCachedMatches(
    now - 10 * 365 * 864e5,
    now + 365 * 864e5
  );
  const parsed = cached.flatMap((row) => {
    try {
      return [JSON.parse(row.payload)];
    } catch {
      return [];
    }
  });
  const recent = await fetchLiveBundle(
    new Date(now - 60 * 864e5),
    new Date(now + 365 * 864e5),
    signal
  ).catch(() => ({ matches: [] }));
  const madridInvolved = [teamA, teamB].some((name) => isMadrid(name));
  const historical = madridInvolved ? await fetchHistoricalMadridSchedule(signal).catch(
    () => []
  ) : [];
  const all = dedupeMatches([...parsed, ...historical, ...recent.matches]);
  return all.filter((match) => isPublishedMeeting(match, teamA, teamB));
}
async function fetchRealMadridSeasonFixtures(signal) {
  const { start, end } = currentSeasonBounds();
  return (await fetchLiveBundle(start, end, signal)).matches.filter(
    (match) => match.isRealMadrid
  );
}
var COMPETITIONS, ESPN_BASE, SPORTS_DB_BASE, REAL_MADRID_TEAM_IDS, REAL_MADRID_NAMES, FETCH_TIMEOUT_MS, FETCH_RETRIES, FETCH_BACKOFF_MS, BUNDLE_TTL_MS, BUNDLE_STALE_WINDOW_MS, SHADOW_PROVIDER_AUDIT_MS, bundleCache, lastSecondaryAuditAt, bundleRequests, schedulerState;
var init_sportsData = __esm({
  "server/sportsData.ts"() {
    "use strict";
    init_validators();
    init_domain();
    init_db();
    init_syncEngine();
    init_providerAdapters();
    init_redisCache();
    COMPETITIONS = {
      laliga: {
        label: "\u0627\u0644\u062F\u0648\u0631\u064A \u0627\u0644\u0625\u0633\u0628\u0627\u0646\u064A",
        espn: "esp.1",
        official: "https://www.laliga.com/en-GB/laliga-easports/standing",
        tsdbLeague: "4335",
        supportsStandings: true
      },
      championsLeague: {
        label: "\u062F\u0648\u0631\u064A \u0623\u0628\u0637\u0627\u0644 \u0623\u0648\u0631\u0648\u0628\u0627",
        espn: "uefa.champions",
        official: "https://www.uefa.com/uefachampionsleague/clubs/50051--real-madrid/matches/",
        tsdbLeague: null,
        supportsStandings: true
      },
      copaDelRey: {
        label: "\u0643\u0623\u0633 \u0627\u0644\u0645\u0644\u0643",
        espn: "esp.copa_del_rey",
        official: "https://www.laliga.com/en-GB/other-competitions/copa-del-rey",
        tsdbLeague: null,
        supportsStandings: false
      },
      superCup: {
        label: "\u0627\u0644\u0633\u0648\u0628\u0631 \u0627\u0644\u0625\u0633\u0628\u0627\u0646\u064A",
        espn: "esp.super_cup",
        official: "https://www.laliga.com/en-GB/other-competitions/supercopa-de-espana",
        tsdbLeague: null,
        supportsStandings: false
      }
    };
    ESPN_BASE = getProviderAdapter("ESPN").baseUrl;
    SPORTS_DB_BASE = getProviderAdapter("TheSportsDB").baseUrl;
    REAL_MADRID_TEAM_IDS = /* @__PURE__ */ new Set(["86", "133738"]);
    REAL_MADRID_NAMES = /* @__PURE__ */ new Set([
      "real madrid",
      "real madrid cf",
      "real madrid club de futbol"
    ]);
    FETCH_TIMEOUT_MS = 8e3;
    FETCH_RETRIES = 1;
    FETCH_BACKOFF_MS = 200;
    BUNDLE_TTL_MS = 3e4;
    BUNDLE_STALE_WINDOW_MS = 10 * 6e4;
    SHADOW_PROVIDER_AUDIT_MS = 5 * 6e4;
    bundleCache = null;
    lastSecondaryAuditAt = 0;
    bundleRequests = /* @__PURE__ */ new Map();
    schedulerState = { timer: null, nextRunAt: null, lastRunAt: null, running: false };
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
init_db();
import { parse as parseCookieHeader2 } from "cookie";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
init_db();
init_env();
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client2) {
    this.client = client2;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client2 = createOAuthHttpClient()) {
    this.client = client2;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
init_env();
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z as z2 } from "zod";

// server/_core/notification.ts
init_env();
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z2.object({
      timestamp: z2.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z2.object({
      title: z2.string().min(1, "title is required"),
      content: z2.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
init_sportsData();
init_db();
import { z as z3 } from "zod";

// server/backgroundQueue.ts
var jobs = /* @__PURE__ */ new Map();
var pending2 = [];
var running = false;
async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending2.length) {
      const next = pending2.shift();
      next.job.status = "running";
      console.info(`[BackgroundQueue] starting ${next.job.name} (${next.job.id})`);
      try {
        await next.handler();
        next.job.status = "completed";
        console.info(`[BackgroundQueue] completed ${next.job.name} (${next.job.id})`);
      } catch (error) {
        next.job.status = "failed";
        next.job.error = error instanceof Error ? error.message : String(error);
        console.error(`[BackgroundQueue] failed ${next.job.name} (${next.job.id})`, error);
      }
    }
  } finally {
    running = false;
  }
}
function enqueueBackgroundJob(name, handler) {
  const job = {
    id: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    enqueuedAt: (/* @__PURE__ */ new Date()).toISOString(),
    status: "queued"
  };
  jobs.set(job.id, job);
  pending2.push({ job, handler });
  void drain();
  return job;
}
function getBackgroundQueueStatus() {
  return {
    running,
    queued: pending2.length,
    recent: Array.from(jobs.values()).slice(-20).reverse()
  };
}

// server/routers.ts
var competitionSchema = z3.enum([
  "laliga",
  "championsLeague",
  "copaDelRey",
  "superCup"
]);
var engineCompetitionSchema = z3.enum([
  "laliga",
  "championsLeague",
  "copaDelRey",
  "superCup",
  "friendly",
  "unknown"
]);
function cachedToPublic(rows) {
  return rows.map((row) => {
    let parsed = {};
    try {
      parsed = JSON.parse(row.payload);
    } catch {
      parsed = {};
    }
    const isStale = Date.now() - new Date(row.sourceUpdatedAt).getTime() > 10 * 60 * 1e3;
    return {
      ...parsed,
      source: parsed.source ?? row.source,
      sourceUpdatedAt: parsed.sourceUpdatedAt ?? new Date(row.sourceUpdatedAt).toISOString(),
      dataState: isStale ? "STALE" : parsed.dataState ?? "VERIFIED"
    };
  });
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  admin: router({
    operations: adminProcedure.query(async () => {
      const [status, syncRuns2] = await Promise.all([
        getDataCenterStatus(),
        getLastSyncBySource()
      ]);
      return {
        checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
        status,
        syncRuns: syncRuns2,
        cache: {
          state: status.freshness.state,
          source: status.freshness.source,
          updatedAt: status.freshness.updatedAt,
          ageMs: status.freshness.ageMs,
          protection: status.freshness.indicator === "stale" ? "stale-cache" : "normal"
        }
      };
    }),
    refresh: adminProcedure.mutation(async () => {
      const { runScheduledLiveSync: runScheduledLiveSync2 } = await Promise.resolve().then(() => (init_sportsData(), sportsData_exports));
      const bundle = await runScheduledLiveSync2();
      return {
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        dataState: bundle.dataState,
        matchCount: bundle.matches.length,
        source: bundle.source
      };
    }),
    enqueueRefresh: adminProcedure.mutation(() => {
      const job = enqueueBackgroundJob("live-data-refresh", async () => {
        const { runScheduledLiveSync: runScheduledLiveSync2 } = await Promise.resolve().then(() => (init_sportsData(), sportsData_exports));
        await runScheduledLiveSync2();
      });
      return { queued: true, job };
    }),
    queueStatus: adminProcedure.query(() => getBackgroundQueueStatus())
  }),
  matches: router({
    list: publicProcedure.input(
      z3.object({
        daysBefore: z3.number().min(0).max(120).default(30),
        daysAfter: z3.number().min(1).max(365).default(180)
      }).optional()
    ).query(async ({ input }) => {
      const now = Date.now();
      const from = new Date(now - (input?.daysBefore ?? 30) * 864e5);
      const to = new Date(now + (input?.daysAfter ?? 180) * 864e5);
      try {
        const bundle = await fetchLiveBundle(from, to);
        if (bundle.matches.length > 0)
          return {
            ...bundle,
            matches: markStale(bundle.matches),
            lastSync: bundle.sourceUpdatedAt
          };
      } catch (error) {
        console.warn("[Live matches] all sources failed", error);
      }
      const cached = await getCachedMatches(from.getTime(), to.getTime());
      const lastSync = await getLastSync();
      return {
        matches: cachedToPublic(cached),
        source: "database cache",
        sourceUpdatedAt: lastSync?.completedAt?.toISOString() ?? null,
        dataState: cached.length ? "STALE" : "UNAVAILABLE",
        failures: cached.length ? 0 : 1,
        sources: [],
        lastSync: lastSync?.completedAt?.toISOString() ?? null,
        cacheKey: "database",
        sourceConfidence: cached.length ? "low" : void 0
      };
    }),
    snapshot: publicProcedure.input(z3.object({ competition: competitionSchema })).query(async ({ input }) => {
      try {
        return await fetchCompetitionSnapshot(
          input.competition
        );
      } catch {
        return {
          competition: input.competition,
          label: COMPETITIONS[input.competition].label,
          standings: [],
          scorers: [],
          source: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0635\u062F\u0631 \u0645\u0633\u062A\u062C\u064A\u0628",
          sourceUrl: COMPETITIONS[input.competition].official,
          sourceUpdatedAt: null,
          dataState: "UNAVAILABLE",
          standingsStatus: "UNAVAILABLE"
        };
      }
    }),
    h2h: publicProcedure.input(
      z3.object({
        teamA: z3.string().min(1).max(128),
        teamB: z3.string().min(1).max(128)
      })
    ).query(async ({ input }) => {
      const matches2 = await fetchPublishedH2H(input.teamA, input.teamB);
      return {
        matches: matches2,
        aggregate: aggregatePublishedH2H(matches2, input.teamA, input.teamB),
        publishedOnly: true
      };
    }),
    byId: publicProcedure.input(
      z3.object({
        matchId: z3.string(),
        competition: competitionSchema.optional()
      })
    ).query(async ({ input }) => {
      if (input.competition)
        return fetchMatchSummary(
          input.matchId,
          input.competition
        );
      for (const competition of Object.keys(
        COMPETITIONS
      )) {
        try {
          return await fetchMatchSummary(input.matchId, competition);
        } catch {
        }
      }
      throw new Error(
        "No supported competition matched this provider fixture"
      );
    }),
    detail: publicProcedure.input(z3.object({ matchId: z3.string(), competition: competitionSchema })).query(async ({ input }) => {
      try {
        return await fetchMatchSummary(
          input.matchId,
          input.competition
        );
      } catch {
        return {
          incidents: [],
          stats: {},
          lineups: null,
          lineupReleaseAt: null,
          broadcasters: [],
          commentary: null,
          dataState: "UNAVAILABLE",
          sourceUpdatedAt: null
        };
      }
    }),
    engine: publicProcedure.input(
      z3.object({
        competition: engineCompetitionSchema.default("laliga"),
        season: z3.string().regex(/^\d{4}-\d{4}$/).optional()
      }).optional()
    ).query(async ({ input }) => {
      const competition = input?.competition ?? "laliga";
      const bounds = currentSeasonBounds();
      const dataset = await fetchLiveBundle(bounds.start, bounds.end);
      return {
        ...dataset,
        matches: dataset.matches.filter((match) => match.competition === competition),
        detectedCompetition: competition
      };
    }),
    health: publicProcedure.query(async () => {
      const lastSync = await getLastSync();
      return {
        lastSync: lastSync?.completedAt?.toISOString() ?? null,
        status: lastSync?.status ?? "live_on_request",
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }),
    status: publicProcedure.query(async () => getDataCenterStatus()),
    calendar: publicProcedure.query(async () => {
      const rows = await fetchRealMadridSeasonFixtures();
      return {
        matches: rows,
        source: rows.length ? "ESPN public soccer feed" : "No provider data",
        sourceUpdatedAt: rows[0]?.sourceUpdatedAt ?? null,
        dataState: rows.length ? rows.some((row) => row.dataState === "LIVE") ? "LIVE" : "VERIFIED" : "UNAVAILABLE",
        generatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (!payload || typeof payload !== "object")
            throw new Error("Invalid debug payload");
          const body2 = payload;
          if (body2.consoleLogs?.length) {
            writeToLogFile("browserConsole", body2.consoleLogs);
          }
          if (body2.networkRequests?.length) {
            writeToLogFile("networkRequests", body2.networkRequests);
          }
          if (body2.sessionEvents?.length) {
            writeToLogFile("sessionReplay", body2.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [
  react(),
  tailwindcss(),
  vitePluginManusRuntime(),
  vitePluginManusDebugCollector()
];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return void 0;
          if (id.includes("recharts")) return "charts";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("@trpc") || id.includes("@tanstack/react-query"))
            return "data-client";
          if (id.includes("react") || id.includes("scheduler"))
            return "react-runtime";
          return "vendor";
        }
      }
    }
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
