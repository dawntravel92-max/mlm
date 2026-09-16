import { mergeLiveSnapshot, type CanonicalLiveSnapshot, type LiveEvent } from "../shared/liveDomain";

type Listener = (snapshot: CanonicalLiveSnapshot) => void;
type Fetcher = (matchId: string, signal?: AbortSignal) => Promise<CanonicalLiveSnapshot>;

/** In-process live engine: single-flight fetches, monotonic sequences, last-known-good state and subscriptions. */
export class LiveMatchEngine {
  private snapshots = new Map<string, CanonicalLiveSnapshot>();
  private inFlight = new Map<string, Promise<CanonicalLiveSnapshot>>();
  private listeners = new Map<string, Set<Listener>>();

  get(matchId: string) { return this.snapshots.get(matchId) ?? null; }

  subscribe(matchId: string, listener: Listener) {
    const listeners = this.listeners.get(matchId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(matchId, listeners);
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(matchId); };
  }

  apply(snapshot: CanonicalLiveSnapshot) {
    const current = this.snapshots.get(snapshot.matchId) ?? null;
    const merged = mergeLiveSnapshot(current, snapshot);
    if (current && merged === current) return current;
    this.snapshots.set(snapshot.matchId, merged);
    for (const listener of Array.from(this.listeners.get(snapshot.matchId) ?? [])) listener(merged);
    return merged;
  }

  async refresh(matchId: string, fetcher: Fetcher, signal?: AbortSignal) {
    const existing = this.inFlight.get(matchId);
    if (existing) return existing;
    const request = fetcher(matchId, signal).then(snapshot => this.apply(snapshot));
    this.inFlight.set(matchId, request);
    try { return await request; } finally { this.inFlight.delete(matchId); }
  }

  markStale(matchId: string): CanonicalLiveSnapshot | null {
    const current = this.snapshots.get(matchId);
    if (!current) return null;
    const stale = { ...current, freshness: "STALE" as const };
    this.snapshots.set(matchId, stale);
    return stale;
  }

  recover(matchId: string, events: LiveEvent[] = []) {
    const current = this.snapshots.get(matchId);
    if (!current) return null;
    return this.apply({ ...current, events, sequence: current.sequence + 1, fetchedAt: new Date().toISOString(), freshness: "FRESH" });
  }

  clear() { this.snapshots.clear(); this.inFlight.clear(); this.listeners.clear(); }
}

export const liveMatchEngine = new LiveMatchEngine();
