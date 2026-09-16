export type CanonicalMatchState =
  | "SCHEDULED" | "PRE_MATCH" | "LIVE" | "HALFTIME" | "SECOND_HALF"
  | "EXTRA_TIME" | "PENALTY_SHOOTOUT" | "FINISHED" | "POSTPONED"
  | "CANCELLED" | "SUSPENDED" | "ABANDONED";

export type VerificationState = "VERIFIED" | "HIGH_CONFIDENCE" | "SECONDARY_SOURCE" | "CONFLICT" | "STALE" | "UNAVAILABLE";

export interface DataProvenance {
  source: string;
  lastUpdated: string | null;
  confidence: "high" | "medium" | "low";
  verificationState: VerificationState;
}

export function canonicalMatchState(status: unknown, period?: unknown): CanonicalMatchState {
  const value = String(status ?? "").toLowerCase();
  const p = String(period ?? "").toLowerCase();
  if (value.includes("cancel")) return "CANCELLED";
  if (value.includes("postpon")) return "POSTPONED";
  if (value.includes("suspend")) return "SUSPENDED";
  if (value.includes("abandon")) return "ABANDONED";
  if (value.includes("finish") || value.includes("complete") || value === "ft") return "FINISHED";
  if (value.includes("half") || value === "ht") return "HALFTIME";
  if (value.includes("extra")) return "EXTRA_TIME";
  if (value.includes("penalty")) return "PENALTY_SHOOTOUT";
  if (value.includes("live") || value.includes("in progress") || value.includes("playing")) {
    return p.includes("second") ? "SECOND_HALF" : "LIVE";
  }
  if (value.includes("pre")) return "PRE_MATCH";
  return "SCHEDULED";
}

export function isRealMadridTeam(team: { id?: unknown; name?: unknown } | string | null | undefined): boolean {
  const id = typeof team === "string" ? "" : String(team?.id ?? "");
  const name = typeof team === "string" ? team : String(team?.name ?? "");
  const normalized = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return new Set(["86", "133738", "real madrid", "real madrid cf", "real madrid club de futbol"]).has(id || normalized);
}

export function realMadridPriority(match: { status?: unknown; isRealMadrid?: boolean; homeTeam?: unknown; awayTeam?: unknown; startTimeUtc?: number }): number {
  const madrid = Boolean(match.isRealMadrid) || isRealMadridTeam(match.homeTeam as any) || isRealMadridTeam(match.awayTeam as any);
  const state = canonicalMatchState(match.status);
  if (madrid && (state === "LIVE" || state === "HALFTIME" || state === "SECOND_HALF")) return 0;
  if (state === "LIVE" || state === "HALFTIME" || state === "SECOND_HALF") return 1;
  if (madrid && (state === "SCHEDULED" || state === "PRE_MATCH")) return 2;
  if (state === "SCHEDULED" || state === "PRE_MATCH") return 3;
  if (madrid) return 4;
  return 5;
}

export function sortRealMadridFirst<T extends { status?: unknown; isRealMadrid?: boolean; homeTeam?: unknown; awayTeam?: unknown; startTimeUtc?: number }>(matches: T[]): T[] {
  return [...matches].sort((a, b) => realMadridPriority(a) - realMadridPriority(b) || (a.startTimeUtc ?? 0) - (b.startTimeUtc ?? 0));
}

const IRAQ_TIME_ZONE = "Asia/Baghdad";
export function formatIraqDate(value: number | string | Date | null | undefined, withTime = true): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-IQ", { timeZone: IRAQ_TIME_ZONE, day: "numeric", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(value));
}

export function adaptiveRefreshMs(status: unknown, startTimeUtc?: number, now = Date.now()): number {
  const state = canonicalMatchState(status);
  if (state === "LIVE" || state === "SECOND_HALF") return 15_000;
  if (state === "HALFTIME") return 60_000;
  if (state === "FINISHED") return 5 * 60_000;
  if (state === "SCHEDULED" || state === "PRE_MATCH") return startTimeUtc && startTimeUtc - now < 2 * 60 * 60 * 1000 ? 60_000 : 5 * 60_000;
  return 15 * 60_000;
}

export function meaningfulMatchChange(before: any, after: any): boolean {
  return ["status", "homeScore", "awayScore", "events", "stats", "lineups", "venue"].some(key => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
}
