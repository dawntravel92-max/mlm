import { describe, expect, it } from "vitest";
import { parseMatchIncidents } from "./sportsData";

describe("match center incident presentation data", () => {
  it("keeps the incident team logo and shirt numbers for goals", () => {
    const incidents = parseMatchIncidents({
      header: { competitions: [{ competitors: [{ team: { displayName: "Real Madrid", logos: [{ href: "home-logo" }] } }] }] },
      incidents: [{
        type: { text: "Goal" },
        clock: { displayValue: "45:00" },
        team: { displayName: "Real Madrid" },
        athlete: { displayName: "Scorer", jersey: "9" },
        athletesInvolved: [{ displayName: "Scorer", jersey: "9" }, { displayName: "Assist", jersey: "10" }],
        text: "Goal",
      }],
    });
    expect(incidents[0]).toMatchObject({
      type: "goal",
      minute: "45:00",
      teamLogo: "home-logo",
      player: "Scorer",
      playerNumber: "9",
      assist: "Assist",
      assistNumber: "10",
    });
  });
});
