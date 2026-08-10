import type { CampaignEvent } from "../../packages/domain/src";
import { describe, expect, it } from "vitest";
import {
  campaignReportGroup,
  describeCampaignReportEvent,
  summarizeCampaignReport,
} from "./reports";

function event(type: CampaignEvent["type"], payload: Record<string, unknown> = {}, actor?: string): CampaignEvent {
  return {
    eventId: `event-${type}`,
    campaignId: "outpost-k17",
    round: 18,
    sequence: 1,
    type,
    actor,
    payload,
    timestamp: 1,
    visibility: "PUBLIC",
  };
}

describe("campaign reports", () => {
  it("summarizes authoritative round events without inferring hidden state", () => {
    const summary = summarizeCampaignReport([
      event("UNIT_MOVED"),
      event("DICE_ROLLED"),
      event("UNIT_ATTACKED", { healthLoss: 3 }),
      event("DAMAGE_APPLIED", { loss: 3 }),
      event("UNIT_DESTROYED"),
      event("OBJECTIVE_CAPTURED"),
      event("ORDER_REJECTED"),
      event("ROUND_FINISHED", { ordersAccepted: 4, ordersRejected: 2 }),
    ]);

    expect(summary).toEqual({
      movements: 1,
      attacks: 1,
      diceRolls: 1,
      damage: 3,
      destroyed: 1,
      objectiveChanges: 1,
      acceptedOrders: 4,
      rejectedOrders: 2,
    });
  });

  it("groups combat and objective events for the report sections", () => {
    expect(campaignReportGroup(event("DAMAGE_APPLIED"))).toBe("COMBAT");
    expect(campaignReportGroup(event("OBJECTIVE_CAPTURED"))).toBe("OBJECTIVES");
    expect(campaignReportGroup(event("ORDER_REJECTED"))).toBe("COMMAND");
    expect(campaignReportGroup(event("ENEMY_REINFORCEMENTS_ARRIVED"))).toBe("OBJECTIVES");
  });

  it("uses projected deployment callsigns in human-readable entries", () => {
    const description = describeCampaignReportEvent(
      event("UNIT_ATTACKED", { targetId: "dep-target", healthLoss: 2, penetrated: true }, "dep-attacker"),
      new Map([
        ["dep-attacker", "ROOK-7"],
        ["dep-target", "SKITTER-1"],
      ]),
    );

    expect(description).toBe("ROOK-7 attacked SKITTER-1: 2 damage, armour penetrated.");
  });

  it("names an arriving enemy wave from its public event payload", () => {
    expect(describeCampaignReportEvent(event("ENEMY_REINFORCEMENTS_ARRIVED", {
      waveId: "k17-wave-2",
      callsigns: ["RAZOR-2", "CHITIN-7"],
    }))).toBe("Enemy reinforcements entered the battlespace: RAZOR-2, CHITIN-7.");
  });
});
