import { describe, expect, it } from "vitest";
import { LiveMatchEngine } from "./liveEngine";
import { mergeLiveSnapshot, type CanonicalLiveSnapshot } from "../shared/liveDomain";

const snapshot = (overrides: Partial<CanonicalLiveSnapshot> = {}): CanonicalLiveSnapshot => ({
  matchId: "match-1", status: "LIVE", period: "FIRST_HALF", clock: "12:10",
  homeScore: 1, awayScore: 0, events: [], stats: { possession: 52 }, lineups: [{ team: "RM" }],
  sequence: 1, providerTimestamp: new Date().toISOString(), fetchedAt: new Date().toISOString(),
  freshness: "LIVE", provenance: {}, ...overrides,
});

describe("live match engine", () => {
  it("rejects older snapshots and preserves partial fields", () => {
    const first = snapshot({ sequence: 5, events: [{ eventId: "g1", matchId: "match-1", type: "GOAL", timestamp: "2026-01-01T00:00:00Z", period: "FIRST_HALF", sequence: 5, source: { source: "ESPN", providerTimestamp: null, confidence: "high" } }] });
    const older = snapshot({ sequence: 4, homeScore: 0, stats: {}, lineups: null });
    const result = mergeLiveSnapshot(first, older);
    expect(result.homeScore).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.lineups).toEqual([{ team: "RM" }]);
  });

  it("coalesces concurrent refreshes and notifies subscribers", async () => {
    const engine = new LiveMatchEngine();
    let calls = 0;
    let notifications = 0;
    engine.subscribe("match-1", () => { notifications += 1; });
    const fetcher = async () => { calls += 1; await new Promise(resolve => setTimeout(resolve, 2)); return snapshot(); };
    await Promise.all([engine.refresh("match-1", fetcher), engine.refresh("match-1", fetcher)]);
    expect(calls).toBe(1);
    expect(notifications).toBe(1);
    expect(engine.get("match-1")?.freshness).toBe("LIVE");
  });
});
