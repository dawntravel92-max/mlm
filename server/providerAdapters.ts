export type ProviderCapability =
  | "fixtures"
  | "match_detail"
  | "live"
  | "incidents"
  | "lineups"
  | "player_stats"
  | "standings"
  | "scorers"
  | "h2h"
  | "teams"
  | "seasons";

export type ProviderAdapter = {
  id: "ESPN" | "TheSportsDB";
  label: string;
  priority: number;
  baseUrl: string;
  capabilities: readonly ProviderCapability[];
  authoritative: boolean;
  mode: "primary" | "fallback";
};

export const PROVIDER_ADAPTERS: readonly ProviderAdapter[] = [
  {
    id: "ESPN",
    label: "ESPN public soccer feed",
    priority: 100,
    baseUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer",
    authoritative: true,
    mode: "primary",
    capabilities: [
      "fixtures",
      "match_detail",
      "live",
      "incidents",
      "lineups",
      "player_stats",
      "standings",
      "scorers",
      "teams",
      "seasons",
    ],
  },
  {
    id: "TheSportsDB",
    label: "TheSportsDB public feed",
    priority: 50,
    baseUrl: "https://www.thesportsdb.com/api/v1/json/3",
    authoritative: false,
    mode: "fallback",
    capabilities: ["fixtures", "match_detail", "standings", "teams", "seasons"],
  },
];

export function getProviderAdapter(id: ProviderAdapter["id"]): ProviderAdapter {
  return (
    PROVIDER_ADAPTERS.find(adapter => adapter.id === id) ?? PROVIDER_ADAPTERS[0]
  );
}

export function providerCapabilities(
  id: ProviderAdapter["id"]
): readonly ProviderCapability[] {
  return getProviderAdapter(id).capabilities;
}
