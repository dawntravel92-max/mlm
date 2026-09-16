import { and, desc, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  dataCache,
  InsertUser,
  matches,
  providerConflicts,
  syncRuns,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { MatchRecord } from "./sportsData";
import { persistedMatchSchema } from "./validators";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {
    lastSignedIn: user.lastSignedIn ?? new Date(),
  };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

function sourcePriority(source: string): number {
  return source.toLowerCase().startsWith("espn")
    ? 2
    : source.toLowerCase().startsWith("thesportsdb")
      ? 1
      : 0;
}

/**
 * Persist normalized records while treating ESPN as the authoritative source.
 * A lower-priority fallback can fill a missing row, but does not overwrite an
 * ESPN row that is already present.
 */
export async function upsertMatches(items: MatchRecord[]): Promise<number> {
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
    const providerExisting = (
      await db
        .select()
        .from(matches)
        .where(eq(matches.providerId, item.providerId))
        .limit(1)
    )[0];
    const tupleWhere = and(
      eq(matches.competition, item.competition),
      eq(matches.homeTeam, item.homeTeam),
      eq(matches.awayTeam, item.awayTeam),
      eq(matches.startTimeUtc, item.startTimeUtc)
    );
    const existing =
      providerExisting ??
      (await db.select().from(matches).where(tupleWhere).limit(1))[0];
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
      verifiedAt: new Date(item.verifiedAt),
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

export async function getCachedMatches(from: number, to: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(matches)
    .where(and(gte(matches.startTimeUtc, from), lte(matches.startTimeUtc, to)))
    .orderBy(desc(matches.isRealMadrid), matches.startTimeUtc);
}

export async function createSyncRun(source: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(syncRuns).values({
    source,
    startedAt: new Date(),
    status: "running",
    matchCount: 0,
    recordsReceived: 0,
    recordsUpdated: 0,
  });
  return result[0]?.insertId ? Number(result[0].insertId) : null;
}

export async function finishSyncRun(
  id: number | null,
  status: string,
  matchCount: number,
  details: {
    latencyMs?: number;
    recordsReceived?: number;
    recordsUpdated?: number;
    error?: string | null;
  } = {}
) {
  const db = await getDb();
  if (!db || !id) return;
  await db
    .update(syncRuns)
    .set({
      status,
      matchCount,
      latencyMs: details.latencyMs ?? null,
      recordsReceived: details.recordsReceived ?? matchCount,
      recordsUpdated: details.recordsUpdated ?? 0,
      error: details.error ?? null,
      completedAt: new Date(),
    })
    .where(eq(syncRuns.id, id));
}

export async function getLastSync() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLastSyncBySource() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(100);
}

export async function putDataCache(entry: {
  cacheKey: string;
  payload: string;
  source: string;
  storedAt: Date;
  expiresAt: Date;
  staleUntil: Date;
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(dataCache)
    .values(entry)
    .onDuplicateKeyUpdate({
      set: {
        payload: entry.payload,
        source: entry.source,
        storedAt: entry.storedAt,
        expiresAt: entry.expiresAt,
        staleUntil: entry.staleUntil,
      },
    });
}

export async function getDataCache(cacheKey: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(dataCache)
    .where(eq(dataCache.cacheKey, cacheKey))
    .limit(1);
  return rows[0] ?? null;
}

export async function recordProviderConflicts(
  conflicts: Array<{
    matchKey: string;
    field: string;
    providerA: string;
    providerB: string;
    valueA: string;
    valueB: string;
    winnerProvider: string;
    detectedAt: Date;
  }>
) {
  const db = await getDb();
  if (!db || conflicts.length === 0) return;
  await db.insert(providerConflicts).values(conflicts);
}

export async function getRecentProviderConflicts(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(providerConflicts)
    .orderBy(desc(providerConflicts.detectedAt))
    .limit(limit);
}
