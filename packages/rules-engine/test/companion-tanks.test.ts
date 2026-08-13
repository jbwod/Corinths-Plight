import type { CampaignDeployment, StructuredAction, UnitOrder } from "../../domain/src";
import { describe, expect, it } from "vitest";
import {
  COMPANION_TANK_SUBSYSTEM_DEFINITIONS,
  COMPANION_TANK_SUBSYSTEM_PROFILE,
  PUBLIC_V1_COMPANION_ARMOUR_PROFILE,
  createSeededRandom,
  getActionDefinition,
  getPublicV1CompanionTankProfile,
  resolveAttackRoll,
  resolveRound,
  resolveSubsystemDamage,
  selectCompanionTankAttackWeapons,
  validateHatClearAirDrop,
  validateCompanionTankTransport,
  validateOrder,
} from "../src";
import { makeHex, makeState, makeRoundInput } from "./fixtures";

function tankDeployment(
  definitionId: "unit-light-battle-tank" | "unit-heavy-battle-tank" | "unit-super-heavy-tank",
  id: string,
  side: "ALLIED" | "ENEMY",
  position: { q: number; r: number },
): CampaignDeployment {
  const profile = getPublicV1CompanionTankProfile(definitionId, 3);
  return {
    id,
    campaignId: "campaign-companion-tanks",
    persistentUnitId: `persistent-${id}`,
    ownerId: `${side.toLowerCase()}-owner`,
    side,
    definitionId,
    callsign: id,
    tags: profile.tags,
    status: "ACTIVE",
    position,
    facing: 0,
    stats: profile.stats,
    currentHealth: profile.stats.maxHealth,
    weapons: structuredClone(profile.weapons),
    ammunition: {},
    cooldowns: {},
    statuses: [],
    equipmentIds: [],
    subsystems: [],
  };
}

function action(id: string, targetDeploymentId: string): StructuredAction {
  const rule = getActionDefinition("ATTACK");
  return {
    id,
    type: "ATTACK",
    economy: rule.economy,
    speedCost: rule.speedCost,
    targetDeploymentId,
    weaponIds: ["client-must-not-narrow-super-heavy"],
    equipmentIds: [],
  };
}

function attackOrder(attacker: CampaignDeployment, target: CampaignDeployment): UnitOrder {
  const attackAction = action(`attack-${attacker.id}`, target.id);
  if (attacker.definitionId === "unit-super-heavy-tank") attackAction.economy = "PRIMARY";
  return {
    id: `order-${attacker.id}`,
    revision: 1,
    unitId: attacker.id,
    campaignId: attacker.campaignId,
    round: 1,
    orderType: "HOLD",
    lifecycle: "SUBMITTED",
    startHex: { ...attacker.position },
    route: [{ ...attacker.position }],
    endHex: { ...attacker.position },
    facing: attacker.facing,
    actions: [attackAction],
    targets: [target.id],
    equipmentUsed: [],
    ammoUsed: {},
    incidentalActions: [],
    submittedBy: attacker.ownerId,
    submittedAt: 1,
  };
}

describe("public-v1 companion tank conversion", () => {
  it("converts source FS to equal Hits and retains approved armour, speed, range, and AP", () => {
    const light = getPublicV1CompanionTankProfile("unit-light-battle-tank", 3);
    const heavy = getPublicV1CompanionTankProfile("unit-heavy-battle-tank", 4);
    const superHeavy = getPublicV1CompanionTankProfile("unit-super-heavy-tank", 5);

    expect(light).toMatchObject({
      rulesetVersion: PUBLIC_V1_COMPANION_ARMOUR_PROFILE,
      stats: { healthModel: "HITS", maxHealth: 3, armor: 2, speed: 3, sensors: 3 },
      requisitionCost: 10,
      tags: expect.arrayContaining(["LIGHT_VEHICLE", "REAR_WEAK_SPOT", "SUBSYSTEMS"]),
      weapons: [{ damage: { count: 1, sides: 4 }, armorPiercing: 2, range: 2 }],
      slots: { secondary: 1, internal: 1 },
    });
    expect(heavy).toMatchObject({
      stats: { healthModel: "HITS", maxHealth: 3, armor: 4, speed: 2, sensors: 4 },
      requisitionCost: 14,
      weapons: [{ damage: { count: 1, sides: 8 }, armorPiercing: 2, range: 3 }],
      slots: { secondary: 1, internal: 1 },
    });
    expect(superHeavy).toMatchObject({
      stats: { healthModel: "HITS", maxHealth: 4, armor: 5, speed: 1, sensors: 5 },
      requisitionCost: 20,
      slots: { secondary: 2, internal: 2 },
    });
    expect(superHeavy.weapons).toEqual([
      expect.objectContaining({ damage: { count: 1, sides: 8 }, armorPiercing: 5, range: 3 }),
    ]);
  });

  it("requires scenario-authored sensors instead of inventing a catalogue default", () => {
    expect(() => getPublicV1CompanionTankProfile("unit-light-battle-tank", Number.NaN)).toThrow(/sensor range/i);
    expect(() => getPublicV1CompanionTankProfile("unit-heavy-battle-tank", -1)).toThrow(/sensor range/i);
  });

  it("selects one governed shot for Light/Heavy and exactly two stable shots for Super Heavy", () => {
    for (const id of ["unit-light-battle-tank", "unit-heavy-battle-tank"] as const) {
      const profile = getPublicV1CompanionTankProfile(id, 0);
      expect(selectCompanionTankAttackWeapons(id, profile.weapons)).toMatchObject({
        legal: true,
        shotCount: 1,
        weapons: [{ id: profile.weapons[0]!.id }],
      });
    }
    const superHeavy = getPublicV1CompanionTankProfile("unit-super-heavy-tank", 0);
    expect(selectCompanionTankAttackWeapons(superHeavy.id, superHeavy.weapons)).toMatchObject({
      legal: true,
      shotCount: 2,
      weapons: [
        { id: "weapon-super-heavy-dual-cannon-public-v1" },
        { id: "weapon-super-heavy-dual-cannon-public-v1" },
      ],
    });
    expect(selectCompanionTankAttackWeapons(superHeavy.id, [])).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/missing a governed main cannon/i),
      shotCount: 0,
    });
  });

  it("applies shared penetrated natural-5 weapon and natural-6 mobility subsystem failures", () => {
    const weaponFailure = resolveSubsystemDamage({
      profile: COMPANION_TANK_SUBSYSTEM_PROFILE,
      definitions: COMPANION_TANK_SUBSYSTEM_DEFINITIONS,
      states: [],
      penetrated: true,
      naturalRoll: 5,
      sourceId: "attacker",
      round: 4,
    });
    expect(weaponFailure).toMatchObject({
      triggered: true,
      affectedSubsystemIds: ["WEAPONS"],
      states: [{ subsystemId: "WEAPONS", state: "DISABLED", damageSourceId: "attacker", damagedRound: 4 }],
    });
    expect(resolveSubsystemDamage({
      profile: COMPANION_TANK_SUBSYSTEM_PROFILE,
      definitions: COMPANION_TANK_SUBSYSTEM_DEFINITIONS,
      states: [],
      penetrated: true,
      naturalRoll: 6,
    })).toMatchObject({ triggered: true, affectedSubsystemIds: ["MOBILITY"] });
    expect(resolveSubsystemDamage({
      profile: COMPANION_TANK_SUBSYSTEM_PROFILE,
      definitions: COMPANION_TANK_SUBSYSTEM_DEFINITIONS,
      states: [],
      penetrated: false,
      naturalRoll: 6,
    })).toMatchObject({ triggered: false, states: [] });
  });

  it("permits only Light Tank HAT carriage/drop and reserves Heavy/Super Heavy for Heavy Lift", () => {
    expect(validateCompanionTankTransport("unit-light-battle-tank", "unit-heavy-air-transport")).toEqual({
      legal: true,
      airDropAllowed: true,
      hazardousDropPolicy: "REJECT",
    });
    for (const id of ["unit-heavy-battle-tank", "unit-super-heavy-tank"] as const) {
      expect(validateCompanionTankTransport(id, "unit-heavy-air-transport")).toMatchObject({
        legal: false,
        airDropAllowed: false,
      });
      expect(validateCompanionTankTransport(id, "unit-vtol-heavy-lift")).toEqual({
        legal: true,
        airDropAllowed: false,
        hazardousDropPolicy: "NOT_APPLICABLE",
      });
    }
    const light = tankDeployment("unit-light-battle-tank", "drop-light-tank", "ALLIED", { q: 1, r: 0 });
    const clearHex = makeHex(1, 0);
    expect(validateHatClearAirDrop({
      flightPath: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      destination: clearHex,
      cargo: {
        id: "light-tank-cargo",
        kind: "VEHICLE",
        quantity: 1,
        tags: light.tags ?? [],
        unitId: light.id,
        transportMode: "EMBARKED",
      },
      currentOccupancy: 0,
    })).toEqual({ legal: true, hazardous: false, reasons: [] });
    expect(validateHatClearAirDrop({
      flightPath: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      destination: { ...clearHex, environment: ["HAZARDOUS"] },
      cargo: {
        id: "light-tank-cargo",
        kind: "VEHICLE",
        quantity: 1,
        tags: light.tags ?? [],
        unitId: light.id,
        transportMode: "EMBARKED",
      },
      currentOccupancy: 0,
    })).toMatchObject({ legal: false, hazardous: true });
  });

  it("uses the shared rear weak spot and resolves two server-owned Super Heavy shots", () => {
    const attacker = tankDeployment("unit-super-heavy-tank", "super-heavy", "ALLIED", { q: 0, r: 1 });
    const target = tankDeployment("unit-heavy-battle-tank", "heavy-target", "ENEMY", { q: 0, r: 0 });
    target.facing = 0;
    const rear = resolveAttackRoll(attacker, target, attacker.weapons[0]!, [makeHex(0, 0), makeHex(0, 1)], createSeededRandom("tank-rear"));
    expect(rear).toMatchObject({ rearAttack: true, targetArmor: 4, effectiveArmor: 0 });

    attacker.campaignId = "campaign-test";
    target.campaignId = "campaign-test";
    const order = attackOrder(attacker, target);
    const state = makeState([attacker, target], [makeHex(0, 0), makeHex(0, 1)], [order]);
    const standardAttack = structuredClone(order);
    standardAttack.actions[0]!.economy = "STANDARD";
    expect(validateOrder(standardAttack, attacker, makeRoundInput(state, [standardAttack]))).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining([expect.stringMatching(/economy or speed cost/i)]),
    });
    const output = resolveRound(makeRoundInput(state, [order], [], { seed: "super-heavy-two-shot" }));
    const rolls = output.events.filter((event) => event.type === "DICE_ROLLED" && event.actor === attacker.id);
    expect(rolls).toHaveLength(2);
    expect(rolls.map((event) => event.payload.weaponId)).toEqual([
      "weapon-super-heavy-dual-cannon-public-v1",
      "weapon-super-heavy-dual-cannon-public-v1",
    ]);
    expect(output.events.filter((event) => event.type === "UNIT_ATTACKED" && event.actor === attacker.id)).toHaveLength(2);
  });
});
