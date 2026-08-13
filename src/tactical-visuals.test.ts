import { describe, expect, it } from "vitest";
import type { CampaignDeployment, UnitOrder } from "../packages/domain/src";
import {
  stableDeploymentOrder,
  tacticalFormationLayout,
  tacticalFormationRole,
  tacticalFormationScale,
  tacticalSpriteFrame,
  tacticalSpriteMotion,
  tacticalSpriteState,
} from "./tactical-visuals";

const deployment = {
  currentHealth: 8,
  stats: { maxHealth: 10 },
  status: "ACTIVE",
  statuses: [],
} as unknown as CampaignDeployment;

const order = (type: string, routeLength = 1) => ({
  orderType: "ADVANCE",
  route: Array.from({ length: routeLength }, (_, q) => ({ q, r: 0 })),
  actions: type ? [{ type }] : [],
  incidentalActions: [],
}) as unknown as UnitOrder;

describe("tactical unit visuals", () => {
  it("provides deterministic unique anchors for overlapping formations through nine units", () => {
    for (let count = 1; count <= 9; count += 1) {
      const slots = tacticalFormationLayout(count);
      expect(slots).toHaveLength(count);
      expect(new Set(slots.map(({ x, y }) => `${x},${y}`)).size).toBe(count);
    }
    expect(tacticalFormationLayout(12)).toHaveLength(12);
    expect(tacticalFormationScale(8)).toBeLessThan(tacticalFormationScale(2));
    expect(tacticalFormationScale(4)).toBeGreaterThanOrEqual(.8);
  });

  it("layers combined arms from rear support to foreground air silhouettes", () => {
    const support = { id: "support", ownerId: "ally", side: "ALLIED", definitionId: "unit-artillery", tags: ["ARTILLERY"] } as CampaignDeployment;
    const armour = { id: "armour", ownerId: "ally", side: "ALLIED", definitionId: "unit-main-battle-tank", tags: ["VEHICLE"] } as CampaignDeployment;
    const infantry = { id: "infantry", ownerId: "ally", side: "ALLIED", definitionId: "unit-infantry-squad", tags: ["INFANTRY"] } as CampaignDeployment;
    const air = { id: "air", ownerId: "ally", side: "ALLIED", definitionId: "unit-vtol", tags: ["VTOL"] } as CampaignDeployment;
    expect(tacticalFormationRole(support)).toBe("SUPPORT");
    expect(tacticalFormationRole(armour)).toBe("ARMOUR");
    expect(tacticalFormationRole(infantry)).toBe("INFANTRY");
    expect(tacticalFormationRole(air)).toBe("AIR");
    expect([air, infantry, support, armour].sort(stableDeploymentOrder).map((unit) => unit.id)).toEqual([
      "support", "armour", "infantry", "air",
    ]);
  });

  it("selects action states without overriding damaged presentation", () => {
    expect(tacticalSpriteState(deployment, order("ATTACK"))).toBe("ATTACK");
    expect(tacticalSpriteState(deployment, order("HEAL"))).toBe("SUPPORT");
    expect(tacticalSpriteState(deployment, order("", 2))).toBe("MOVE");
    expect(tacticalSpriteState({ ...deployment, currentHealth: 4 }, order("ATTACK"))).toBe("DAMAGED");
  });

  it("uses stable animation frames and a reduced-motion fallback", () => {
    expect(tacticalSpriteFrame("MOVE", 0)).toBe(1);
    expect(tacticalSpriteFrame("MOVE", 180)).toBe(2);
    expect(tacticalSpriteFrame("ATTACK", 0)).toBe(3);
    expect(tacticalSpriteFrame("ATTACK", 200)).toBe(0);
    expect(tacticalSpriteFrame("SUPPORT", 900, true)).toBe(4);
  });

  it("limits sprite animation to transform and opacity values", () => {
    expect(tacticalSpriteMotion("IDLE", 300)).toEqual({ translateX: 0, translateY: 0, rotation: 0, scale: 1, opacity: 1 });
    expect(tacticalSpriteMotion("ATTACK", 0).translateY).toBeGreaterThan(0);
    expect(tacticalSpriteMotion("SUPPORT", 200).opacity).toBeLessThanOrEqual(1);
    expect(tacticalSpriteMotion("MOVE", 90).rotation).not.toBe(0);
    expect(tacticalSpriteMotion("MOVE", 90, true)).toEqual({ translateX: 0, translateY: 0, rotation: 0, scale: 1, opacity: 1 });
  });
});
