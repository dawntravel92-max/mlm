import { describe, expect, it, beforeEach } from "vitest";
import {
  getBundlePollingIntervalMs,
  getMatchPollingIntervalMs,
} from "../shared/domain";
import { validateEspnResponse } from "./validators";
import {
  fetchLiveBundle,
  markStale,
  mergeProviderMatches,
  parseCachedBundle,
  resetLiveDataState,
  type MatchRecord,
} from "./sportsData";
import {
  getCircuitState,
  resetReliabilityState,
  resilientRequest,
} from "./syncEngine";

function match(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    providerId: "espn-1",
    competition: "laliga",
    competitionLabel: "LaLiga",
    homeTeam: "Real Madrid",
    awayTeam: "Barcelona",
    homeLogo: null,
    awayLogo: null,
    venue: null,
    round: null,
    startTimeUtc: Date.UTC(2026, 8, 10, 19),
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    isRealMadrid: true,
    events: [],
    stats: {},
    lineups: null,
    playerStats: [],
    broadcasters: [],
    commentary: null,
    source: "ESPN public soccer feed",
    sourceUrl: "https://example.test/espn",
    sourceUpdatedAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
    dataState: "VERIFIED",
    ...overrides,
  };
}

describe("Phase 6 reliability", () => {
  beforeEach(() => {
    resetReliabilityState();
    resetLiveDataState();
  });

  it("keeps ESPN authoritative and records field-level conflicts", () => {
    const espn = match({ homeScore: 2, status: "live" });
    const tsdb = match({
      providerId: "tsdb-1",
      homeScore: 1,
      status: "scheduled",
      source: "TheSportsDB public feed",
    });
    const result = mergeProviderMatches([espn], [tsdb]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].providerId).toBe("espn-1");
    expect(result.matches[0].homeScore).toBe(2);
    expect(result.conflicts.map(conflict => conflict.field)).toEqual(
      expect.arrayContaining(["status", "homeScore"])
    );
    expect(
      result.conflicts.every(conflict => conflict.winnerProvider === "ESPN")
    ).toBe(true);
  });

  it("does not accept malformed provider envelopes", () => {
    expect(() =>
      validateEspnResponse({ events: "not-an-array" }, "https://example.test")
    ).toThrow("Invalid ESPN response");
    expect(
      validateEspnResponse({ events: [] }, "https://example.test")
    ).toEqual({ events: [] });
  });

  it("fails a stalled provider request at the timeout deadline", async () => {
    await expect(
      resilientRequest(
        "ESPN",
        "timeout-test",
        async () =>
          new Promise<string>(resolve =>
            setTimeout(() => resolve("too late"), 80)
          ),
        { retries: 0, timeoutMs: 5 }
      )
    ).rejects.toThrow("request timeout");
  });

  it("retries a transient provider failure with exponential backoff", async () => {
    let calls = 0;
    const value = await resilientRequest(
      "ESPN",
      "retry-test",
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("temporary outage");
        return "recovered";
      },
      { retries: 1, backoffMs: 0, timeoutMs: 100 }
    );
    expect(value).toBe("recovered");
    expect(calls).toBe(2);
    expect(getCircuitState("ESPN").state).toBe("closed");
  });

  it("opens the circuit after repeated provider failures", async () => {
    for (let index = 0; index < 2; index += 1) {
      await expect(
        resilientRequest(
          "TheSportsDB",
          `failure-${index}`,
          async () => {
            throw new Error("offline");
          },
          {
            retries: 0,
            circuitFailureThreshold: 2,
            backoffMs: 0,
            timeoutMs: 100,
          }
        )
      ).rejects.toThrow("offline");
    }
    expect(getCircuitState("TheSportsDB").state).toBe("open");
    await expect(
      resilientRequest("TheSportsDB", "blocked", async () => "should not run", {
        retries: 0,
        circuitFailureThreshold: 2,
        circuitCooldownMs: 60_000,
      })
    ).rejects.toThrow("circuit open");
  });

  it("deduplicates concurrent requests sharing the same key", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const work = () =>
      resilientRequest(
        "ESPN",
        "same-flight",
        async () => {
          calls += 1;
          await gate;
          return 42;
        },
        { retries: 0, timeoutMs: 1000 }
      );
    const first = work();
    const second = work();
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([42, 42]);
    expect(calls).toBe(1);
  });

  it("falls back from an unavailable ESPN feed to TheSportsDB", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("site.api.espn.com")) throw new Error("ESPN offline");
      return new Response(
        JSON.stringify({
          events: [
            {
              idEvent: "tsdb-1",
              strLeague: "Spanish La Liga",
              strHomeTeam: "Real Madrid",
              strAwayTeam: "Barcelona",
              dateEvent: "2099-10-10",
              strTime: "19:00:00",
              strStatus: "NS",
              intHomeScore: null,
              intAwayScore: null,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    try {
      const bundle = await fetchLiveBundle(
        new Date("2099-10-01T00:00:00Z"),
        new Date("2099-10-30T00:00:00Z"),
        undefined,
        { bypassPersistentCache: true }
      );
      expect(bundle.dataState).toBe("FALLBACK");
      expect(bundle.source).toContain("TheSportsDB");
      expect(bundle.matches[0]?.providerId).toBe("tsdb-tsdb-1");
      expect(
        bundle.sources.find(source => source.name === "ESPN")?.status
      ).toBe("failed");
      expect(
        bundle.sources.find(source => source.name === "TheSportsDB")?.status
      ).toBe("ok");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("marks old records stale instead of presenting them as live", () => {
    const old = match({
      sourceUpdatedAt: new Date(Date.now() - 11 * 60_000).toISOString(),
      dataState: "LIVE",
    });
    expect(markStale([old])[0].dataState).toBe("STALE");
  });

  it("deserializes persistent cache as stale when its freshness window expires", () => {
    const saved = {
      matches: [
        match({
          sourceUpdatedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
          dataState: "LIVE",
        }),
      ],
      source: "ESPN public soccer feed",
      sourceUpdatedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      dataState: "LIVE",
      failures: 0,
      sources: [],
      cacheKey: "test-range",
    };
    const parsed = parseCachedBundle(
      JSON.stringify(saved),
      "Persistent cache",
      true
    );
    expect(parsed?.dataState).toBe("STALE");
    expect(parsed?.source).toContain("stale cache");
    expect(parsed?.matches[0].dataState).toBe("STALE");
  });

  it("uses the fastest cadence required by visible matches", () => {
    const now = Date.UTC(2026, 8, 2, 12);
    expect(
      getMatchPollingIntervalMs({ status: "live", startTimeUtc: now }, now)
    ).toBe(15_000);
    expect(
      getMatchPollingIntervalMs(
        { status: "scheduled", startTimeUtc: now + 2 * 60 * 60 * 1000 },
        now
      )
    ).toBe(60_000);
    expect(
      getMatchPollingIntervalMs(
        { status: "scheduled", startTimeUtc: now + 3 * 86400000 },
        now
      )
    ).toBe(5 * 60_000);
    expect(
      getBundlePollingIntervalMs(
        [
          { status: "completed", startTimeUtc: now },
          { status: "live", startTimeUtc: now },
        ],
        now
      )
    ).toBe(15_000);
  });
});
