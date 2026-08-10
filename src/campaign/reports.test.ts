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
    expect(campaignReportGroup(event("ENEMY_INTENTION_DECLARED"))).toBe("COMMAND");
  });

  it("describes a projected enemy intention without inferring hidden formations", () => {
    expect(describeCampaignReportEvent(event("ENEMY_INTENTION_DECLARED", {
      orderType: "ADVANCE",
      targetId: "dep-tank",
      targetPreference: "VEHICLE",
      destination: { q: 1, r: 0 },
    }, "dep-heavy"), new Map([
      ["dep-heavy", "BEHEMOTH"],
      ["dep-tank", "IRON-1"],
    ]))).toBe("BEHEMOTH declared an advance intention against IRON-1 prioritising vehicle via hex 1.0.");
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

  it("explains when Rapid Fire doubled the damage result", () => {
    expect(describeCampaignReportEvent(
      event("UNIT_ATTACKED", {
        targetId: "dep-horde",
        healthLoss: 4,
        rapidFireMultiplier: 2,
        penetrated: true,
      }, "dep-vehicle"),
      new Map([
        ["dep-vehicle", "LANTERN"],
        ["dep-horde", "SKITTER-9"],
      ]),
    )).toBe("LANTERN attacked SKITTER-9: 4 damage, Rapid Fire doubled the damage result, armour penetrated.");
  });

  it("explains the high-ground damage modifier", () => {
    expect(describeCampaignReportEvent(
      event("UNIT_ATTACKED", {
        targetId: "dep-target",
        healthLoss: 3,
        highGroundModifier: 1,
        penetrated: true,
      }, "dep-attacker"),
      new Map([
        ["dep-attacker", "ROOK-7"],
        ["dep-target", "CHITIN-4"],
      ]),
    )).toBe("ROOK-7 attacked CHITIN-4: 3 damage, high ground added +1, armour penetrated.");
  });

  it("explains cover, Dig In, and prepared-position transitions", () => {
    expect(describeCampaignReportEvent(
      event("UNIT_ATTACKED", {
        targetId: "dep-target",
        healthLoss: 0,
        coverArmor: 1,
        digInDefense: 2,
      }, "dep-attacker"),
      new Map([["dep-attacker", "ROOK-7"], ["dep-target", "ANVIL-2"]]),
    )).toBe("ROOK-7 attacked ANVIL-2: 0 damage, cover added +1 Armor, Dig In added +2 Defense.");
    expect(campaignReportGroup(event("UNIT_DUG_IN"))).toBe("MOVEMENT");
    expect(describeCampaignReportEvent(event("UNIT_DUG_OUT", {}, "dep-target"), new Map([["dep-target", "ANVIL-2"]])))
      .toBe("ANVIL-2 left its prepared position and lost Dig In Defense.");
  });

  it("explains the distance increment and reason for a movement block", () => {
    expect(describeCampaignReportEvent(event("UNIT_BLOCKED", {
      at: "0,0",
      reason: "HOSTILE_ROUTE_CONTEST",
      distanceIncrement: 1.5,
    }, "dep-attacker"), new Map([["dep-attacker", "ROOK-7"]])))
      .toBe("ROOK-7 met an opposing ground formation at 0,0 after 1.5 distance; both stopped before entering.");
  });

  it("names an arriving enemy wave from its public event payload", () => {
    expect(describeCampaignReportEvent(event("ENEMY_REINFORCEMENTS_ARRIVED", {
      waveId: "k17-wave-2",
      callsigns: ["RAZOR-2", "CHITIN-7"],
    }))).toBe("Enemy reinforcements entered the battlespace: RAZOR-2, CHITIN-7.");
  });
});
