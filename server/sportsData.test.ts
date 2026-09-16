import { describe, expect, it } from "vitest";
import {
  COMPETITIONS,
  deriveStandingsFromScoreboard,
  markStale,
  normalizeOfficialLogo,
  aggregatePublishedH2H,
  type MatchRecord,
} from "./sportsData";

describe("live sports data safeguards", () => {
  it("normalizes official logo variants and secure URLs", () => {
    expect(
      normalizeOfficialLogo({
        logos: [{ href: "http://cdn.example/crest.png" }],
      })
    ).toBe("https://cdn.example/crest.png");
    expect(
      normalizeOfficialLogo({
        logos: [{ url: "https://cdn.example/crest.svg" }],
      })
    ).toBe("https://cdn.example/crest.svg");
    expect(
      normalizeOfficialLogo({ displayName: "Club without logo" })
    ).toBeNull();
  });
  it("aggregates only published completed H2H meetings", () => {
    const matches = [
      {
        homeTeam: "Real Madrid",
        awayTeam: "Barcelona",
        status: "completed",
        homeScore: 2,
        awayScore: 1,
      },
      {
        homeTeam: "Barcelona",
        awayTeam: "Real Madrid",
        status: "completed",
        homeScore: 0,
        awayScore: 0,
      },
      {
        homeTeam: "Real Madrid",
        awayTeam: "Barcelona",
        status: "scheduled",
        homeScore: null,
        awayScore: null,
      },
    ] as MatchRecord[];
    expect(aggregatePublishedH2H(matches, "Real Madrid", "Barcelona")).toEqual({
      played: 2,
      wins: 1,
      draws: 1,
      losses: 0,
      goalsFor: 2,
      goalsAgainst: 1,
    });
  });

  it("keeps the supported Real Madrid competitions source-backed", () => {
    expect(Object.keys(COMPETITIONS)).toEqual([
      "laliga",
      "championsLeague",
      "copaDelRey",
      "superCup",
    ]);
    expect(COMPETITIONS.laliga.espn).toBe("esp.1");
    expect(COMPETITIONS.copaDelRey.espn).toBe("esp.copa_del_rey");
    expect(COMPETITIONS.laliga.supportsStandings).toBe(true);
    expect(COMPETITIONS.copaDelRey.supportsStandings).toBe(false);
  });

  it("derives a sorted standings table when ESPN standings is empty", () => {
    const events = [
      {
        date: "2026-08-15T17:30Z",
        competitions: [
          {
            status: { type: { state: "post", completed: true } },
            competitors: [
              {
                homeAway: "home",
                score: "2",
                team: { id: "madrid", displayName: "Real Madrid" },
              },
              {
                homeAway: "away",
                score: "0",
                team: { id: "betis", displayName: "Real Betis" },
              },
            ],
          },
        ],
      },
      {
        date: "2026-08-22T17:30Z",
        competitions: [
          {
            status: { type: { state: "post", completed: true } },
            competitors: [
              {
                homeAway: "home",
                score: "1",
                team: { id: "betis", displayName: "Real Betis" },
              },
              {
                homeAway: "away",
                score: "1",
                team: { id: "sevilla", displayName: "Sevilla FC" },
              },
            ],
          },
        ],
      },
    ];
    const table = deriveStandingsFromScoreboard(
      events,
      Date.parse("2026-09-01T00:00:00Z")
    );
    expect(table.map(row => row.team)).toEqual([
      "Real Madrid",
      "Sevilla FC",
      "Real Betis",
    ]);
    expect(table[0]).toMatchObject({
      rank: 1,
      played: 1,
      points: 3,
      goalsFor: 2,
      goalDifference: 2,
      form: "W",
    });
    expect(table[2]).toMatchObject({
      played: 2,
      points: 1,
      draws: 1,
      losses: 1,
      form: "LD",
    });
  });

  it("marks an old provider payload as stale instead of live", () => {
    const old = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const match = {
      providerId: "espn-1",
      competition: "laliga",
      competitionLabel: "الدوري الإسباني",
      homeTeam: "Real Madrid",
      awayTeam: "Real Betis",
      homeLogo: null,
      awayLogo: null,
      venue: null,
      round: null,
      startTimeUtc: Date.now(),
      status: "live",
      homeScore: 0,
      awayScore: 0,
      isRealMadrid: true,
      events: [],
      stats: {},
      lineups: null,
      broadcasters: [],
      commentary: null,
      source: "test",
      sourceUrl: "https://example.com",
      sourceUpdatedAt: old,
      verifiedAt: old,
      dataState: "VERIFIED",
    } as MatchRecord;
    expect(markStale([match])[0].dataState).toBe("STALE");
  });

  it("does not mutate fresh verified payloads", () => {
    const fresh = new Date().toISOString();
    const match = {
      providerId: "espn-2",
      competition: "laliga",
      competitionLabel: "الدوري الإسباني",
      homeTeam: "Real Madrid",
      awayTeam: "Real Sociedad",
      homeLogo: null,
      awayLogo: null,
      venue: null,
      round: null,
      startTimeUtc: Date.now(),
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      isRealMadrid: true,
      events: [],
      stats: {},
      lineups: null,
      broadcasters: [],
      commentary: null,
      source: "test",
      sourceUrl: "https://example.com",
      sourceUpdatedAt: fresh,
      verifiedAt: fresh,
      dataState: "VERIFIED",
    } as MatchRecord;
    expect(markStale([match])[0].dataState).toBe("VERIFIED");
  });
});

describe("production hardening safeguards", () => {
  it("does not expose provider zero scores for scheduled fixtures", async () => {
    const { toEspnRecord } = await import("./sportsData");
    const record = toEspnRecord(
      {
        id: "scheduled-1",
        date: "2026-09-10T19:00:00Z",
        competitions: [
          {
            status: {
              type: {
                state: "pre",
                name: "STATUS_SCHEDULED",
                completed: false,
              },
            },
            competitors: [
              {
                homeAway: "home",
                score: "0",
                team: { id: "86", displayName: "Real Madrid" },
              },
              {
                homeAway: "away",
                score: "0",
                team: { id: "99", displayName: "Opponent" },
              },
            ],
          },
        ],
      },
      "laliga",
      new Date().toISOString()
    );
    expect(record).toMatchObject({
      isRealMadrid: true,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
    });
  });

  it("keeps a legitimate completed zero-zero result", async () => {
    const { toEspnRecord } = await import("./sportsData");
    const record = toEspnRecord(
      {
        id: "finished-1",
        date: "2026-08-10T19:00:00Z",
        competitions: [
          {
            status: {
              type: { state: "post", name: "STATUS_FINAL", completed: true },
            },
            competitors: [
              {
                homeAway: "home",
                score: "0",
                team: { id: "86", displayName: "Real Madrid CF" },
              },
              {
                homeAway: "away",
                score: "0",
                team: { id: "99", displayName: "Opponent" },
              },
            ],
          },
        ],
      },
      "laliga",
      new Date().toISOString()
    );
    expect(record).toMatchObject({
      status: "completed",
      homeScore: 0,
      awayScore: 0,
    });
  });

  it("uses July 1 as the season boundary", async () => {
    const { currentSeasonBounds } = await import("./sportsData");
    expect(
      currentSeasonBounds(new Date("2026-06-30T12:00:00Z")).start.toISOString()
    ).toBe("2025-07-01T00:00:00.000Z");
    expect(
      currentSeasonBounds(new Date("2026-07-01T12:00:00Z")).start.toISOString()
    ).toBe("2026-07-01T00:00:00.000Z");
  });

  it("parses ESPN statistics goals leaders and athlete team fields", async () => {
    const { parseLeaderScorers } = await import("./sportsData");
    expect(
      parseLeaderScorers({
        stats: [
          {
            name: "goalsLeaders",
            displayName: "Goals",
            leaders: [
              {
                value: 7,
                athlete: {
                  displayName: "Top Scorer",
                  team: { displayName: "Real Madrid" },
                  headshot: { href: "https://cdn.example/player.png" },
                },
              },
            ],
          },
          {
            name: "assistsLeaders",
            displayName: "Assists",
            leaders: [{ athlete: { displayName: "Assistant" }, value: 9 }],
          },
        ],
      })
    ).toEqual([
      {
        player: "Top Scorer",
        team: "Real Madrid",
        goals: 7,
        assists: null,
        photo: "https://cdn.example/player.png",
      },
    ]);
  });

  it("does not treat a generic points leaderboard as goals", async () => {
    const { parseLeaderScorers } = await import("./sportsData");
    expect(
      parseLeaderScorers({
        leaders: [
          {
            name: "points",
            leaders: [{ athlete: { displayName: "Player" }, value: 10 }],
          },
        ],
      })
    ).toEqual([]);
  });

  it("parses ESPN keyEvents when incidents is absent", async () => {
    const { parseMatchIncidents } = await import("./sportsData");
    expect(
      parseMatchIncidents({
        incidents: [],
        keyEvents: [
          {
            type: { text: "Goal" },
            clock: { displayValue: "42'" },
            athlete: { displayName: "Scorer" },
            text: "Goal by Scorer",
          },
        ],
      })
    ).toEqual([
      {
        type: "goal",
        minute: "42'",
        team: undefined,
        player: "Scorer",
        assist: undefined,
        detail: "Goal by Scorer",
      },
    ]);
  });

  it("rejects malformed cached match entries", async () => {
    const { parseCachedBundle } = await import("./sportsData");
    expect(
      parseCachedBundle(
        JSON.stringify({
          cacheKey: "x",
          source: "cache",
          sourceUpdatedAt: new Date().toISOString(),
          dataState: "VERIFIED",
          matches: [{ providerId: "x" }],
        }),
        "cache"
      )
    ).toBeNull();
  });
});
