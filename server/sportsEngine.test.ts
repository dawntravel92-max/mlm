import { describe, expect, it, vi } from "vitest";
import {
  detectCompetition,
  EspnProvider,
  normalizeEspnMatch,
  normalizeStatus,
  ResilientSportsEngine,
  seasonFromLabel,
  TheSportsDbProvider,
  validateRawResponse,
} from "./sportsEngine";

const season = seasonFromLabel("2025-2026");
const event = {
  id: "1",
  date: "2025-09-01T19:00:00Z",
  competitions: [
    {
      competitors: [
        {
          homeAway: "home",
          score: "2",
          team: { id: "rm", displayName: "Real Madrid" },
        },
        {
          homeAway: "away",
          score: "1",
          team: { id: "betis", displayName: "Real Betis" },
        },
      ],
      status: {
        type: { name: "STATUS_FINAL", state: "post", completed: true },
      },
      details: [],
    },
  ],
};

describe("sports data engine", () => {
  it("normalizes every supported match status without using provider casing", () => {
    expect(normalizeStatus("Scheduled", "pre")).toBe("SCHEDULED");
    expect(normalizeStatus("In Progress", "in")).toBe("LIVE");
    expect(normalizeStatus("Halftime", "in")).toBe("HALFTIME");
    expect(normalizeStatus("Extra Time", "in")).toBe("EXTRA_TIME");
    expect(normalizeStatus("Penalty Shootout", "post")).toBe("PENALTIES");
    expect(normalizeStatus("Final", "post", true)).toBe("FINISHED");
    expect(normalizeStatus("Postponed", "pre")).toBe("POSTPONED");
    expect(normalizeStatus("Cancelled", "pre")).toBe("CANCELLED");
    expect(normalizeStatus("something else", "")).toBe("UNKNOWN");
  });
  it("detects known competitions and preserves unknown instead of defaulting to LaLiga", () => {
    expect(detectCompetition("UEFA Champions League")).toBe("championsLeague");
    expect(detectCompetition("Copa del Rey")).toBe("copaDelRey");
    expect(detectCompetition("pre-season friendly")).toBe("friendly");
    expect(detectCompetition("unmapped tournament")).toBe("unknown");
  });
  it("propagates an explicitly selected season", () => {
    expect(season.id).toBe("2025-2026");
    expect(season.startDate).toBe("2025-07-01");
    expect(season.endDate).toBe("2026-06-30");
  });
  it("normalizes ESPN events into a provider-agnostic model", () => {
    const match = normalizeEspnMatch(event, "laliga", season, {
      source: "ESPN",
      lastUpdated: new Date().toISOString(),
      freshness: "LIVE",
      status: "LIVE",
    });
    expect(match).toMatchObject({
      id: "espn-1",
      competition: "laliga",
      status: "FINISHED",
      home: { name: "Real Madrid" },
      away: { name: "Real Betis" },
      homeScore: 2,
      awayScore: 1,
    });
  });
  it("rejects malformed non-object payloads gracefully", () => {
    expect(() => validateRawResponse([], "ESPN")).toThrow(/schema validation/);
  });
  it("executes primary then fallback and caches the usable dataset", async () => {
    const primary = new EspnProvider({
      request: vi.fn().mockRejectedValue(new Error("primary down")),
      retries: 0,
    });
    const fallback = new TheSportsDbProvider({
      request: vi.fn().mockResolvedValue({
        events: [
          {
            idEvent: "2",
            dateEvent: "2025-09-01",
            strTime: "19:00:00",
            strHomeTeam: "Real Madrid",
            strAwayTeam: "Real Betis",
            strStatus: "FT",
            intHomeScore: "1",
            intAwayScore: "0",
          },
        ],
      }),
      retries: 0,
    });
    const engine = new ResilientSportsEngine(primary, fallback);
    const result = await engine.fetchMatches("laliga", season);
    expect(result.meta).toMatchObject({
      source: "TheSportsDB",
      status: "FALLBACK",
    });
    expect(result.data[0].home.name).toBe("Real Madrid");
    const second = await engine.fetchMatches("laliga", season);
    expect(second.data).toHaveLength(1);
  });
  it("deduplicates concurrent requests", async () => {
    let calls = 0;
    const request = vi.fn(async () => {
      calls++;
      await new Promise(r => setTimeout(r, 5));
      return { events: [] };
    });
    const engine = new ResilientSportsEngine(
      new EspnProvider({ request, retries: 0 }),
      new TheSportsDbProvider({ request, retries: 0 })
    );
    await Promise.all([
      engine.fetchMatches("laliga", season),
      engine.fetchMatches("laliga", season),
    ]);
    expect(calls).toBe(1);
  });
});
