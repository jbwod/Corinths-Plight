import type { CampaignDeployment, StructuredAction, UnitOrder } from "../../domain/src";
import { describe, expect, it } from "vitest";
import {
  COMPANION_ARTILLERY_CREW_DEFINITION_ID,
  abandonCompanionArtillery,
  companionArtilleryReplacementCost,
  getPublicV1CompanionArtilleryProfile,
  replaceCompanionArtillery,
  resolveRound,
  selectCompanionArtilleryFire,
  validateCompanionArtilleryRange,
  validateCompanionArtilleryTransport,
  validateHatClearAirDrop,
} from "../src";
import { makeHex, makeRoundInput, makeState } from "./fixtures";

function deployment(
  definitionId: "unit-light-artillery" | "unit-heavy-artillery" | "unit-self-propelled-artillery",
): CampaignDeployment {
  const profile = getPublicV1CompanionArtilleryProfile(definitionId, 3);
  return {
    id: `deployment-${definitionId}`,
    campaignId: "campaign-companion-artillery",
    persistentUnitId: `persistent-${definitionId}`,
    ownerId: "owner",
    side: "ALLIED",
    definitionId,
    callsign: "GUNNER",
    tags: profile.tags,
    status: "ACTIVE",
    position: { q: 0, r: 0 },
    facing: 0,
    stats: profile.stats,
    currentHealth: profile.stats.maxHealth,
    weapons: structuredClone(profile.weapons),
    ammunition: Object.fromEntries(profile.weapons.filter((weapon) => weapon.ammoCapacity !== undefined).map((weapon) => [weapon.id, weapon.ammoCapacity!])),
    cooldowns: {},
    statuses: definitionId === "unit-self-propelled-artillery" ? [] : ["PACKED"],
    equipmentIds: ["equipment-test-upgrade"],
    artilleryDeployment: definitionId === "unit-self-propelled-artillery" ? undefined : "PACKED",
  };
}

function orderFor(deployment: CampaignDeployment, action: StructuredAction): UnitOrder {
  return {
    id: `order-${deployment.id}-${action.type}`,
    revision: 1,
    unitId: deployment.id,
    campaignId: "campaign-test",
    round: 1,
    orderType: "HOLD",
    lifecycle: "SUBMITTED",
    startHex: { ...deployment.position },
    route: [{ ...deployment.position }],
    endHex: { ...deployment.position },
    facing: deployment.facing,
    actions: [action],
    targets: [],
    equipmentUsed: [],
    ammoUsed: {},
    incidentalActions: [],
    submittedBy: deployment.ownerId,
    submittedAt: 1,
  };
}

function spotter(position: { q: number; r: number }): CampaignDeployment {
  const unit = deployment("unit-self-propelled-artillery");
  unit.id = "spotter";
  unit.definitionId = "unit-infantry-squad";
  unit.tags = ["GROUND", "INFANTRY"];
  unit.position = position;
  unit.stats.sensors = 4;
  unit.weapons = [];
  unit.ammunition = {};
  return unit;
}

function target(id: string, position: { q: number; r: number }): CampaignDeployment {
  const unit = spotter(position);
  unit.id = id;
  unit.side = "ENEMY";
  unit.ownerId = "enemy";
  unit.currentHealth = 2;
  unit.stats.maxHealth = 2;
  unit.stats.armor = 0;
  unit.stats.defense = 0;
  return unit;
}

describe("public-v1 companion artillery profiles", () => {
  it("projects approved fixed damage, multi-shot counts, and SPG ammunition", () => {
    const light = getPublicV1CompanionArtilleryProfile("unit-light-artillery", 2);
    const heavy = getPublicV1CompanionArtilleryProfile("unit-heavy-artillery", 3);
    const spg = getPublicV1CompanionArtilleryProfile("unit-self-propelled-artillery", 4);
    expect(light).toMatchObject({
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 2, speed: 1 },
      requisitionCost: 8,
      weapons: [{ damage: { count: 1, sides: 1, modifier: 1 }, range: 5 }],
    });
    expect(heavy).toMatchObject({
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 3, speed: 0 },
      requisitionCost: 12,
      weapons: [{ damage: { count: 1, sides: 1, modifier: 2 }, range: 8 }],
    });
    expect(spg).toMatchObject({
      stats: { healthModel: "HITS", maxHealth: 2, armor: 2, speed: 2 },
      requisitionCost: 10,
      weapons: [{ damage: { count: 1, sides: 6 }, range: 4, ammoCapacity: 5, tags: expect.arrayContaining(["MINIMUM_RANGE_2"]) }],
    });
  });

  it("fails closed without a scenario sensor range", () => {
    expect(() => getPublicV1CompanionArtilleryProfile("unit-light-artillery", -1)).toThrow(/sensor range/i);
  });
});

describe("companion artillery attack selection", () => {
  it("requires deploy for Light/Heavy and expands one hex into server-owned two/three shots", () => {
    const light = deployment("unit-light-artillery");
    expect(selectCompanionArtilleryFire({ deployment: light, targetHex: { q: 2, r: 0 } })).toMatchObject({
      legal: false,
      reasons: [expect.stringMatching(/deployed/i)],
    });
    light.artilleryDeployment = "DEPLOYED";
    light.statuses = ["DEPLOYED"];
    expect(selectCompanionArtilleryFire({ deployment: light, targetHex: { q: 2, r: 0 } })).toMatchObject({
      legal: true,
      shots: [
        { index: 1, targetHex: { q: 2, r: 0 } },
        { index: 2, targetHex: { q: 2, r: 0 } },
      ],
    });
    const heavy = deployment("unit-heavy-artillery");
    heavy.artilleryDeployment = "DEPLOYED";
    heavy.statuses = ["DEPLOYED"];
    expect(selectCompanionArtilleryFire({
      deployment: heavy,
      payloadTargetHexes: [{ q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }],
    })).toMatchObject({
      legal: true,
      shots: [
        { index: 1, targetHex: { q: 2, r: 0 } },
        { index: 2, targetHex: { q: 3, r: 0 } },
        { index: 3, targetHex: { q: 4, r: 0 } },
      ],
    });
  });

  it("spends all five SPG rounds one per activation and enforces minimum Range 2", () => {
    const spg = deployment("unit-self-propelled-artillery");
    for (let remaining = 5; remaining > 0; remaining -= 1) {
      spg.ammunition[spg.weapons[0]!.id] = remaining;
      expect(selectCompanionArtilleryFire({ deployment: spg, targetHex: { q: 2, r: 0 } })).toMatchObject({
        legal: true,
        ammunitionBefore: remaining,
        ammunitionAfter: remaining - 1,
        shots: [{ index: 1, targetHex: { q: 2, r: 0 } }],
      });
    }
    spg.ammunition[spg.weapons[0]!.id] = 0;
    expect(selectCompanionArtilleryFire({ deployment: spg, targetHex: { q: 2, r: 0 } })).toMatchObject({
      legal: false,
      reasons: [expect.stringMatching(/insufficient ammunition/i)],
    });
    expect(validateCompanionArtilleryRange("unit-self-propelled-artillery", { q: 0, r: 0 }, { q: 1, r: 0 }, 1)).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/Range 2-4/i),
    });
    expect(validateCompanionArtilleryRange("unit-self-propelled-artillery", { q: 0, r: 0 }, { q: 2, r: 0 }, 2)).toEqual({ legal: true });
  });
});

describe("companion artillery abandon and replacement", () => {
  it("turns operational Light/Heavy into same-hex unarmed 1FS CREW and restores once", () => {
    const original = deployment("unit-heavy-artillery");
    original.position = { q: 3, r: -1 };
    original.artilleryDeployment = "DEPLOYED";
    original.statuses = ["DEPLOYED"];
    const abandoned = abandonCompanionArtillery(original);
    expect(abandoned).toMatchObject({
      legal: true,
      deployment: {
        definitionId: COMPANION_ARTILLERY_CREW_DEFINITION_ID,
        position: { q: 3, r: -1 },
        stats: { healthModel: "FORCE_STRENGTH", maxHealth: 1, speed: 1 },
        currentHealth: 1,
        weapons: [],
        equipmentIds: [],
        allowedActions: ["REPLACE_GUNS"],
        statuses: expect.arrayContaining(["ARTILLERY_CREW"]),
      },
    });
    expect(companionArtilleryReplacementCost("unit-light-artillery")).toBe(4);
    expect(companionArtilleryReplacementCost("unit-heavy-artillery")).toBe(6);
    expect(replaceCompanionArtillery({
      deployment: abandoned.deployment,
      snapshot: abandoned.snapshot,
      atFriendlySupplyPoint: false,
      availableRequisition: 20,
    })).toMatchObject({ legal: false, requisitionSpent: 0, reason: expect.stringMatching(/friendly Supply Point/i) });
    const replaced = replaceCompanionArtillery({
      deployment: abandoned.deployment,
      snapshot: abandoned.snapshot,
      atFriendlySupplyPoint: true,
      availableRequisition: 6,
    });
    expect(replaced).toMatchObject({
      legal: true,
      requisitionSpent: 6,
      deployment: {
        definitionId: "unit-heavy-artillery",
        position: { q: 3, r: -1 },
        weapons: original.weapons,
        equipmentIds: original.equipmentIds,
        allowedActions: expect.arrayContaining(["ABANDON_GUNS", "ATTACK", "DEPLOY", "PACK_UP"]),
        artilleryDeployment: "PACKED",
        statuses: expect.arrayContaining(["ARTILLERY_REPLACEMENT_USED"]),
      },
      snapshot: { replacementUsed: true },
    });
    expect(replaceCompanionArtillery({
      deployment: abandoned.deployment,
      snapshot: replaced.snapshot,
      atFriendlySupplyPoint: true,
      availableRequisition: 20,
    })).toMatchObject({ legal: false, reason: expect.stringMatching(/already used/i) });
    const restoredThenAbandoned = abandonCompanionArtillery({
      ...replaced.deployment,
      companionArtilleryAbandonment: replaced.snapshot,
    });
    expect(restoredThenAbandoned.snapshot).toMatchObject({ replacementUsed: true });
    expect(replaceCompanionArtillery({
      deployment: restoredThenAbandoned.deployment,
      snapshot: restoredThenAbandoned.snapshot,
      atFriendlySupplyPoint: true,
      availableRequisition: 20,
    })).toMatchObject({ legal: false, reason: expect.stringMatching(/already used/i) });
  });

  it("does not let SPG abandon guns and enforces HAT/Heavy Pod restrictions", () => {
    expect(abandonCompanionArtillery(deployment("unit-self-propelled-artillery"))).toMatchObject({ legal: false });
    expect(validateCompanionArtilleryTransport("unit-light-artillery", "unit-heavy-air-transport")).toEqual({ legal: true, airDrop: true });
    expect(validateCompanionArtilleryTransport("unit-light-artillery", "HEAVY_DROP_POD")).toEqual({ legal: true, airDrop: true });
    expect(validateCompanionArtilleryTransport("unit-heavy-artillery", "unit-heavy-air-transport")).toEqual({ legal: true, airDrop: false });
    expect(validateCompanionArtilleryTransport("unit-heavy-artillery", "HEAVY_DROP_POD")).toMatchObject({ legal: false });
    expect(validateCompanionArtilleryTransport("unit-self-propelled-artillery", "unit-heavy-air-transport")).toMatchObject({ legal: false });
    const light = deployment("unit-light-artillery");
    expect(validateHatClearAirDrop({
      flightPath: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      destination: makeHex(1, 0),
      cargo: { id: "light-guns", kind: "VEHICLE", quantity: 1, tags: light.tags ?? [], transportMode: "EMBARKED", unitId: light.id },
      currentOccupancy: 0,
    })).toEqual({ legal: true, hazardous: false, reasons: [] });
    const heavy = deployment("unit-heavy-artillery");
    expect(validateHatClearAirDrop({
      flightPath: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      destination: makeHex(1, 0),
      cargo: { id: "heavy-guns", kind: "VEHICLE", quantity: 1, tags: heavy.tags ?? [], transportMode: "EMBARKED", unitId: heavy.id },
      currentOccupancy: 0,
    })).toMatchObject({ legal: false });
  });
});

describe("companion artillery round resolution", () => {
  it("resolves two server-owned Light Artillery area shots against every hostile in the hex", () => {
    const gun = deployment("unit-light-artillery");
    gun.id = "light-gun";
    gun.campaignId = "campaign-test";
    gun.artilleryDeployment = "DEPLOYED";
    gun.statuses = ["DEPLOYED"];
    const observer = spotter({ q: 1, r: 0 });
    observer.campaignId = "campaign-test";
    const first = target("target-a", { q: 2, r: 0 });
    const second = target("target-b", { q: 2, r: 0 });
    first.campaignId = second.campaignId = "campaign-test";
    const attack = orderFor(gun, {
      id: "light-area-attack",
      type: "ATTACK",
      economy: "STANDARD",
      speedCost: 0,
      targetHex: { q: 2, r: 0 },
      equipmentIds: [],
    });
    const state = makeState([gun, observer, first, second], [makeHex(0, 0), makeHex(1, 0), { ...makeHex(2, 0), capacity: 3 }], [attack]);
    const output = resolveRound(makeRoundInput(state, [attack], [], { seed: "companion-light-area" }));
    expect(output.events.filter((event) => event.type === "ARTILLERY_BOMBARDED")).toHaveLength(2);
    expect(output.events.filter((event) => event.type === "UNIT_ATTACKED")).toHaveLength(4);
    expect(output.state.deployments.filter((candidate) => candidate.id === first.id || candidate.id === second.id))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: first.id, status: "DESTROYED" }),
        expect.objectContaining({ id: second.id, status: "DESTROYED" }),
      ]));
  });

  it("uses split Heavy Artillery declarations and spends one SPG round per activation", () => {
    const heavy = deployment("unit-heavy-artillery");
    heavy.id = "heavy-gun";
    heavy.campaignId = "campaign-test";
    heavy.artilleryDeployment = "DEPLOYED";
    heavy.statuses = ["DEPLOYED"];
    const observer = spotter({ q: 1, r: 0 });
    observer.campaignId = "campaign-test";
    const heavyAttack = orderFor(heavy, {
      id: "heavy-split",
      type: "ATTACK",
      economy: "STANDARD",
      speedCost: 0,
      payload: { targetHexes: [{ q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }] },
      equipmentIds: [],
    });
    const map = [0, 1, 2, 3, 4].map((q) => makeHex(q, 0));
    const heavyOutput = resolveRound(makeRoundInput(makeState([heavy, observer], map, [heavyAttack]), [heavyAttack], [], { seed: "heavy-split" }));
    expect(heavyOutput.events.filter((event) => event.type === "ARTILLERY_BOMBARDED").map((event) => event.payload.targetHex))
      .toEqual([{ q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }]);

    const spg = deployment("unit-self-propelled-artillery");
    spg.id = "spg";
    spg.campaignId = "campaign-test";
    const spgObserver = spotter({ q: 1, r: 0 });
    spgObserver.campaignId = "campaign-test";
    const spgAttack = orderFor(spg, {
      id: "spg-shot",
      type: "ATTACK",
      economy: "STANDARD",
      speedCost: 0,
      targetHex: { q: 2, r: 0 },
      equipmentIds: [],
    });
    const spgOutput = resolveRound(makeRoundInput(makeState([spg, spgObserver], map, [spgAttack]), [spgAttack], [], { seed: "spg-shot" }));
    expect(spgOutput.state.deployments.find((candidate) => candidate.id === spg.id)?.ammunition[spg.weapons[0]!.id]).toBe(4);
  });

  it("persists abandonment and emits an authoritative Req debit when replacing at Supply", () => {
    const gun = deployment("unit-heavy-artillery");
    gun.id = "persistent-heavy-gun";
    gun.campaignId = "campaign-test";
    gun.artilleryDeployment = "DEPLOYED";
    gun.statuses = ["DEPLOYED"];
    const abandon = orderFor(gun, {
      id: "abandon",
      type: "ABANDON_GUNS",
      economy: "PRIMARY",
      speedCost: 0,
      equipmentIds: [],
    });
    const abandonedOutput = resolveRound(makeRoundInput(makeState([gun], [makeHex(0, 0)], [abandon]), [abandon], [], { seed: "abandon" }));
    const crew = abandonedOutput.state.deployments[0]!;
    expect(crew).toMatchObject({
      definitionId: COMPANION_ARTILLERY_CREW_DEFINITION_ID,
      weapons: [],
      companionArtilleryAbandonment: { originalDefinitionId: "unit-heavy-artillery", replacementUsed: false },
    });
    expect(abandonedOutput.persistentEffects.find((effect) => effect.type === "UNIT_STATE_UPDATED")?.payload)
      .toMatchObject({ definitionId: COMPANION_ARTILLERY_CREW_DEFINITION_ID });

    crew.campaignId = "campaign-test";
    const replace = orderFor(crew, {
      id: "replace",
      type: "REPLACE_GUNS",
      economy: "PRIMARY",
      speedCost: 0,
      equipmentIds: [],
    });
    const supplyHex = { ...makeHex(0, 0), control: "ALLIED" as const, environment: ["SUPPLY_POINT"] };
    const replacedOutput = resolveRound(makeRoundInput(makeState([crew], [supplyHex], [replace]), [replace], [], { seed: "replace" }));
    expect(replacedOutput.state.deployments[0]).toMatchObject({
      definitionId: "unit-heavy-artillery",
      artilleryDeployment: "PACKED",
      companionArtilleryAbandonment: { replacementUsed: true },
    });
    expect(replacedOutput.persistentEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "REQUISITION_SPENT", payload: expect.objectContaining({ amount: 6, reasonCode: "ARTILLERY_REPLACEMENT" }) }),
    ]));
  });
});
