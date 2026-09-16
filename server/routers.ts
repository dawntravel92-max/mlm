import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  COMPETITIONS,
  fetchCompetitionSnapshot,
  fetchLiveBundle,
  fetchMatchSummary,
  fetchPublishedH2H,
  aggregatePublishedH2H,
  fetchRealMadridSeasonFixtures,
  getDataCenterStatus,
  markStale,
  currentSeasonBounds,
  type CompetitionKey,
} from "./sportsData";
import { getCachedMatches, getLastSync, getLastSyncBySource } from "./db";
import {
  enqueueBackgroundJob,
  getBackgroundQueueStatus,
} from "./backgroundQueue";

const competitionSchema = z.enum([
  "laliga",
  "championsLeague",
  "copaDelRey",
  "superCup",
]);
const engineCompetitionSchema = z.enum([
  "laliga",
  "championsLeague",
  "copaDelRey",
  "superCup",
  "friendly",
  "unknown",
]);
function cachedToPublic(rows: any[]) {
  return rows.map(row => {
    let parsed: any = {};
    try {
      parsed = JSON.parse(row.payload);
    } catch {
      parsed = {};
    }
    const isStale =
      Date.now() - new Date(row.sourceUpdatedAt).getTime() > 10 * 60 * 1000;
    return {
      ...parsed,
      source: parsed.source ?? row.source,
      sourceUpdatedAt:
        parsed.sourceUpdatedAt ?? new Date(row.sourceUpdatedAt).toISOString(),
      dataState: isStale ? "STALE" : (parsed.dataState ?? "VERIFIED"),
    };
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  admin: router({
    operations: adminProcedure.query(async () => {
      const [status, syncRuns] = await Promise.all([
        getDataCenterStatus(),
        getLastSyncBySource(),
      ]);
      return {
        checkedAt: new Date().toISOString(),
        status,
        syncRuns,
        cache: {
          state: status.freshness.state,
          source: status.freshness.source,
          updatedAt: status.freshness.updatedAt,
          ageMs: status.freshness.ageMs,
          protection:
            status.freshness.indicator === "stale" ? "stale-cache" : "normal",
        },
      };
    }),
    refresh: adminProcedure.mutation(async () => {
      const { runScheduledLiveSync } = await import("./sportsData");
      const bundle = await runScheduledLiveSync();
      return {
        completedAt: new Date().toISOString(),
        dataState: bundle.dataState,
        matchCount: bundle.matches.length,
        source: bundle.source,
      };
    }),
    enqueueRefresh: adminProcedure.mutation(() => {
      const job = enqueueBackgroundJob("live-data-refresh", async () => {
        const { runScheduledLiveSync } = await import("./sportsData");
        await runScheduledLiveSync();
      });
      return { queued: true, job };
    }),
    queueStatus: adminProcedure.query(() => getBackgroundQueueStatus()),
  }),
  matches: router({
    list: publicProcedure
      .input(
        z
          .object({
            daysBefore: z.number().min(0).max(120).default(30),
            daysAfter: z.number().min(1).max(365).default(180),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const now = Date.now();
        const from = new Date(now - (input?.daysBefore ?? 30) * 86400000);
        const to = new Date(now + (input?.daysAfter ?? 180) * 86400000);
        try {
          const bundle = await fetchLiveBundle(from, to);
          if (bundle.matches.length > 0)
            return {
              ...bundle,
              matches: markStale(bundle.matches),
              lastSync: bundle.sourceUpdatedAt,
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
          dataState: cached.length
            ? ("STALE" as const)
            : ("UNAVAILABLE" as const),
          failures: cached.length ? 0 : 1,
          sources: [],
          lastSync: lastSync?.completedAt?.toISOString() ?? null,
          cacheKey: "database",
          sourceConfidence: cached.length ? ("low" as const) : undefined,
        };
      }),
    snapshot: publicProcedure
      .input(z.object({ competition: competitionSchema }))
      .query(async ({ input }) => {
        try {
          return await fetchCompetitionSnapshot(
            input.competition as CompetitionKey
          );
        } catch {
          return {
            competition: input.competition,
            label: COMPETITIONS[input.competition].label,
            standings: [],
            scorers: [],
            source: "لا يوجد مصدر مستجيب",
            sourceUrl: COMPETITIONS[input.competition].official,
            sourceUpdatedAt: null,
            dataState: "UNAVAILABLE" as const,
            standingsStatus: "UNAVAILABLE" as const,
          };
        }
      }),
    h2h: publicProcedure
      .input(
        z.object({
          teamA: z.string().min(1).max(128),
          teamB: z.string().min(1).max(128),
        })
      )
      .query(async ({ input }) => {
        const matches = await fetchPublishedH2H(input.teamA, input.teamB);
        return {
          matches,
          aggregate: aggregatePublishedH2H(matches, input.teamA, input.teamB),
          publishedOnly: true,
        };
      }),
    byId: publicProcedure
      .input(
        z.object({
          matchId: z.string(),
          competition: competitionSchema.optional(),
        })
      )
      .query(async ({ input }) => {
        if (input.competition)
          return fetchMatchSummary(
            input.matchId,
            input.competition as CompetitionKey
          );
        for (const competition of Object.keys(
          COMPETITIONS
        ) as CompetitionKey[]) {
          try {
            return await fetchMatchSummary(input.matchId, competition);
          } catch {
            /* try the next supported competition */
          }
        }
        throw new Error(
          "No supported competition matched this provider fixture"
        );
      }),
    detail: publicProcedure
      .input(z.object({ matchId: z.string(), competition: competitionSchema }))
      .query(async ({ input }) => {
        try {
          return await fetchMatchSummary(
            input.matchId,
            input.competition as CompetitionKey
          );
        } catch {
          return {
            incidents: [],
            stats: {},
            lineups: null,
            lineupReleaseAt: null,
            broadcasters: [],
            commentary: null,
            dataState: "UNAVAILABLE" as const,
            sourceUpdatedAt: null,
          };
        }
      }),
    engine: publicProcedure
      .input(
        z
          .object({
            competition: engineCompetitionSchema.default("laliga"),
            season: z
              .string()
              .regex(/^\d{4}-\d{4}$/)
              .optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const competition = input?.competition ?? "laliga";
        const bounds = currentSeasonBounds();
        const dataset = await fetchLiveBundle(bounds.start, bounds.end);
        return {
          ...dataset,
          matches: dataset.matches.filter(match => match.competition === competition),
          detectedCompetition: competition,
        };
      }),
    health: publicProcedure.query(async () => {
      const lastSync = await getLastSync();
      return {
        lastSync: lastSync?.completedAt?.toISOString() ?? null,
        status: lastSync?.status ?? "live_on_request",
        checkedAt: new Date().toISOString(),
      };
    }),
    status: publicProcedure.query(async () => getDataCenterStatus()),
    calendar: publicProcedure.query(async () => {
      const rows = await fetchRealMadridSeasonFixtures();
      return {
        matches: rows,
        source: rows.length ? "ESPN public soccer feed" : "No provider data",
        sourceUpdatedAt: rows[0]?.sourceUpdatedAt ?? null,
        dataState: rows.length
          ? rows.some((row: any) => row.dataState === "LIVE")
            ? "LIVE"
            : "VERIFIED"
          : "UNAVAILABLE",
        generatedAt: new Date().toISOString(),
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
