import { describe, expect, it } from "vitest";
import {
  getProviderAdapter,
  PROVIDER_ADAPTERS,
  providerCapabilities,
} from "./providerAdapters";

describe("provider adapter registry", () => {
  it("keeps ESPN authoritative and TheSportsDB as fallback", () => {
    expect(PROVIDER_ADAPTERS.map(adapter => adapter.id)).toEqual([
      "ESPN",
      "TheSportsDB",
    ]);
    expect(getProviderAdapter("ESPN").authoritative).toBe(true);
    expect(getProviderAdapter("TheSportsDB").mode).toBe("fallback");
  });

  it("declares only capabilities supported by the adapter contract", () => {
    expect(providerCapabilities("ESPN")).toContain("lineups");
    expect(providerCapabilities("TheSportsDB")).not.toContain("player_stats");
  });
});
