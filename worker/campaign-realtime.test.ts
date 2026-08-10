import { describe, expect, it } from "vitest";

import { createDemoCampaignState } from "../packages/rules-engine/src";
import { campaignRealtimeProjection, parseCampaignRealtimeCursor } from "./campaign-realtime";

describe("campaign realtime projection", () => {
  it("returns only visible missed events and a monotonic cursor", () => {
    const state = createDemoCampaignState(1_000);
    state.events.push(
      {
        eventId: "allied-order",
        campaignId: state.campaignId,
        round: state.round,
        sequence: 2,
        type: "ORDER_SUBMITTED",
        actor: "dep-rook-7",
        payload: { orderId: "secret-order" },
        timestamp: 1_001,
        visibility: "ALLIED",
      },
      {
        eventId: "public-lock",
        campaignId: state.campaignId,
        round: state.round,
        sequence: 3,
        type: "ORDER_LOCKED",
        payload: {},
        timestamp: 1_002,
        visibility: "PUBLIC",
      },
    );
    state.version = 4;

    const allied = campaignRealtimeProjection(state, { userId: "demo-user", side: "ALLIED", role: "PLAYER" }, {
      round: state.round,
      sequence: 1,
      version: 1,
    });
    const enemy = campaignRealtimeProjection(state, { userId: "enemy-user", side: "ENEMY", role: "PLAYER" }, {
      round: state.round,
      sequence: 1,
      version: 1,
    });

    expect(allied.events.map((event) => event.eventId)).toEqual(["allied-order", "public-lock"]);
    expect(allied.cursor).toEqual({ round: state.round, sequence: 3, version: 4 });
    expect(enemy.events.map((event) => event.eventId)).toEqual(["public-lock"]);
    expect(JSON.stringify(enemy)).not.toContain("secret-order");
  });

  it("caps catch-up and validates client cursors", () => {
    const state = createDemoCampaignState(1_000);
    for (let sequence = 2; sequence <= 6; sequence += 1) {
      state.events.push({
        eventId: `public-${sequence}`,
        campaignId: state.campaignId,
        round: state.round,
        sequence,
        type: "ORDER_LOCKED",
        payload: {},
        timestamp: 1_000 + sequence,
        visibility: "PUBLIC",
      });
    }
    const projected = campaignRealtimeProjection(state, { userId: "demo-user", side: "ALLIED", role: "PLAYER" }, {
      round: state.round,
      sequence: 1,
      version: 1,
    }, 2);
    expect(projected.events.map((event) => event.sequence)).toEqual([5, 6]);
    expect(projected.truncated).toBe(true);
    expect(parseCampaignRealtimeCursor(new URL("https://game.test/ws?sinceRound=18&sinceSequence=4&sinceVersion=9")))
      .toEqual({ round: 18, sequence: 4, version: 9 });
    expect(parseCampaignRealtimeCursor(new URL("https://game.test/ws?sinceRound=bad&sinceSequence=4&sinceVersion=9")))
      .toBeUndefined();
  });
});
