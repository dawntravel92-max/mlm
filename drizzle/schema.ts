import {
  bigint,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const matches = mysqlTable("matches", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Provider-level audit trail for every sync attempt. */
export const syncRuns = mysqlTable("syncRuns", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 128 }).notNull(),
  startedAt: timestamp("startedAt").notNull(),
  completedAt: timestamp("completedAt"),
  status: varchar("status", { length: 32 }).notNull(),
  matchCount: int("matchCount").notNull().default(0),
  latencyMs: int("latencyMs"),
  recordsReceived: int("recordsReceived").notNull().default(0),
  recordsUpdated: int("recordsUpdated").notNull().default(0),
  error: text("error"),
});

/** Persistent stale-while-revalidate cache surviving process restarts. */
export const dataCache = mysqlTable("dataCache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cacheKey", { length: 255 }).notNull().unique(),
  payload: text("payload").notNull(),
  source: varchar("source", { length: 128 }).notNull(),
  storedAt: timestamp("storedAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  staleUntil: timestamp("staleUntil").notNull(),
});

/** Field-level disagreements retained for operational review and debugging. */
export const providerConflicts = mysqlTable("providerConflicts", {
  id: int("id").autoincrement().primaryKey(),
  matchKey: varchar("matchKey", { length: 255 }).notNull(),
  field: varchar("field", { length: 64 }).notNull(),
  providerA: varchar("providerA", { length: 64 }).notNull(),
  providerB: varchar("providerB", { length: 64 }).notNull(),
  valueA: text("valueA").notNull(),
  valueB: text("valueB").notNull(),
  winnerProvider: varchar("winnerProvider", { length: 64 }).notNull(),
  detectedAt: timestamp("detectedAt").notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type DbMatch = typeof matches.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
export type DataCacheEntry = typeof dataCache.$inferSelect;
export type ProviderConflict = typeof providerConflicts.$inferSelect;
