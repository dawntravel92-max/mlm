export type LivePeriod = "PRE_MATCH" | "FIRST_HALF" | "HALFTIME" | "SECOND_HALF" | "EXTRA_TIME" | "PENALTY_SHOOTOUT" | "FULL_TIME";

export type LiveEventType =
  | "MATCH_STARTED" | "GOAL" | "GOAL_REVERSED" | "PENALTY" | "PENALTY_MISSED"
  | "YELLOW_CARD" | "SECOND_YELLOW" | "RED_CARD" | "SUBSTITUTION" | "VAR"
  | "HALFTIME" | "SECOND_HALF_STARTED" | "EXTRA_TIME" | "PENALTY_SHOOTOUT"
  | "FULL_TIME" | "LINEUPS_UPDATED" | "STATISTICS_UPDATED" | "MATCH_STATUS_UPDATED";

export type Provenance = {
  source: string;
  providerTimestamp: string | null;
  confidence: "high" | "medium" | "low";
};

export type LiveEvent = {
  eventId: string;
  matchId: string;
  type: LiveEventType;
  timestamp: string;
  period: LivePeriod;
  sequence: number;
  source: Provenance;
  providerTimestamp: string | null;
  minute?: string | null;
  player?: string | null;
  team?: string | null;
  detail?: string | null;
};

export type CanonicalLiveSnapshot<T = Record<string, unknown>> = {
  matchId: string;
  status: string;
  period: LivePeriod;
  clock: string | null;
  homeScore: number | null;
  awayScore: number | null;
  events: LiveEvent[];
  stats: T;
  lineups: unknown[] | null;
  sequence: number;
  providerTimestamp: string | null;
  fetchedAt: string;
  freshness: "LIVE" | "FRESH" | "STALE" | "OFFLINE";
  provenance: Record<string, Provenance>;
};

export function eventIdentity(event: Pick<LiveEvent, "eventId" | "matchId" | "type">): string {
  return `${event.matchId}:${event.eventId}:${event.type}`;
}

export function mergeLiveSnapshot<T extends Record<string, unknown>>(
  previous: CanonicalLiveSnapshot<T> | null,
  incoming: CanonicalLiveSnapshot<T>,
): CanonicalLiveSnapshot<T> {
  if (previous && incoming.sequence < previous.sequence) return previous;
  const events = new Map<string, LiveEvent>();
  for (const event of previous?.events ?? []) events.set(eventIdentity(event), event);
  for (const event of incoming.events) {
    const key = eventIdentity(event);
    const existing = events.get(key);
    if (!existing || event.sequence >= existing.sequence) events.set(key, event);
  }
  return {
    ...(previous ?? {}),
    ...incoming,
    events: Array.from(events.values()).sort((a, b) => a.sequence - b.sequence || a.timestamp.localeCompare(b.timestamp)),
    stats: { ...(previous?.stats ?? {}), ...(incoming.stats ?? {}) },
    lineups: incoming.lineups ?? previous?.lineups ?? null,
    provenance: { ...(previous?.provenance ?? {}), ...(incoming.provenance ?? {}) },
  };
}

export function livePollingIntervalMs(snapshot: Pick<CanonicalLiveSnapshot, "status" | "period">): number {
  const status = snapshot.status.toLowerCase();
  if (status.includes("live") || snapshot.period === "FIRST_HALF" || snapshot.period === "SECOND_HALF") return 15_000;
  if (snapshot.period === "HALFTIME") return 60_000;
  if (status.includes("pre") || status.includes("scheduled")) return 60_000;
  return 5 * 60_000;
}

export function freshnessFromAge(ageMs: number | null): CanonicalLiveSnapshot["freshness"] {
  if (ageMs === null) return "OFFLINE";
  if (ageMs <= 30_000) return "LIVE";
  if (ageMs <= 2 * 60_000) return "FRESH";
  if (ageMs <= 10 * 60_000) return "STALE";
  return "OFFLINE";
}
