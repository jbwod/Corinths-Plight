import { describe, expect, it } from "vitest";
import {
  IRREGULAR_PROGRESSION_TRACKS,
  IRREGULAR_PUBLIC_V1,
  IRREGULAR_SMALL_ARMS,
  getIrregularPublicV1Class,
  irregularDamageOutput,
  irregularEquipmentAllowed,
  purchaseIrregular,
  recruitIrregularAtPopulationCenter,
  recruitIrregularForceStrength,
  upgradeIrregularUnit,
} from "../src/irregular-progression";
import { resolveAttackRoll } from "../src/mechanics";
import { resolveRound, validateOrder } from "../src/resolver";
import { getTacticalActionRule } from "../src/tactical-grammar";
import { fixedRandom, makeAction, makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

describe("source-exact Irregular rules", () => {
  it("reduces damage output to one quarter rounded up", () => {
    expect([0, 1, 2, 3, 4, 5, 8, 9].map(irregularDamageOutput))
      .toEqual([0, 1, 1, 1, 1, 2, 2, 3]);
  });

  it("rejects fractional, negative, and unsafe damage inputs", () => {
    expect(() => irregularDamageOutput(-1)).toThrow(/non-negative integer/i);
    expect(() => irregularDamageOutput(1.5)).toThrow(/non-negative integer/i);
    expect(() => irregularDamageOutput(Number.MAX_SAFE_INTEGER + 1)).toThrow(/non-negative integer/i);
  });

  it("adds three maximum FS for one legal Population Center Recruiter action", () => {
    expect(recruitIrregularForceStrength({
      currentMaximumForceStrength: 10,
      enteredPopulationCenter: true,
      recruiterActionDeclared: true,
      charismaticCommanderEquipped: true,
    })).toEqual({
      legal: true,
      maximumForceStrengthBefore: 10,
      maximumForceStrengthAfter: 13,
      maximumForceStrengthGained: 3,
    });
  });

  it("caps recruitment at fifteen and reports only the actual increase", () => {
    expect(recruitIrregularForceStrength({
      currentMaximumForceStrength: 14,
      enteredPopulationCenter: true,
      recruiterActionDeclared: true,
      charismaticCommanderEquipped: true,
    })).toEqual({
      legal: true,
      maximumForceStrengthBefore: 14,
      maximumForceStrengthAfter: 15,
      maximumForceStrengthGained: 1,
    });
  });

  it("fails closed without equipment, location entry, action, or room below the cap", () => {
    const base = {
      currentMaximumForceStrength: 10,
      enteredPopulationCenter: true,
      recruiterActionDeclared: true,
      charismaticCommanderEquipped: true,
    };
    expect(recruitIrregularForceStrength({ ...base, charismaticCommanderEquipped: false }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/Commander/i), maximumForceStrengthGained: 0 });
    expect(recruitIrregularForceStrength({ ...base, enteredPopulationCenter: false }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/Population Center/i), maximumForceStrengthGained: 0 });
    expect(recruitIrregularForceStrength({ ...base, recruiterActionDeclared: false }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/Recruiter action/i), maximumForceStrengthGained: 0 });
    expect(recruitIrregularForceStrength({ ...base, currentMaximumForceStrength: 15 }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/already 15/i), maximumForceStrengthGained: 0 });
  });

  it("does not normalize an invalid persisted maximum FS", () => {
    expect(recruitIrregularForceStrength({
      currentMaximumForceStrength: 16,
      enteredPopulationCenter: true,
      recruiterActionDeclared: true,
      charismaticCommanderEquipped: true,
    })).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/invalid/i),
      maximumForceStrengthAfter: 16,
      maximumForceStrengthGained: 0,
    });
  });
});

describe("Irregular public-v1 playable profile and progression", () => {
  it("publishes Req4 FS10 base identity and quarters its D6 before the FS cap", () => {
    const profile = getIrregularPublicV1Class(4);
    expect(profile).toMatchObject({
      id: "unit-irregular",
      requisitionCost: 4,
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 10, armor: 0, speed: 1, sensors: 4 },
      slots: { high_risk_arms: 2, low_tech_melee: 1 },
      allowedActions: ["ATTACK", "RECRUIT_IRREGULAR"],
    });
    expect(purchaseIrregular(4)).toMatchObject({ legal: true, requisitionAfter: 0, requisitionSpent: 4 });
    const attacker = makeDeployment("irregular", { q: 0, r: 0 }, "ALLIED", {
      definitionId: profile.id, tags: profile.tags, stats: profile.stats, weapons: profile.weapons,
    });
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY", { currentHealth: 20, stats: { maxHealth: 20 } });
    expect(resolveAttackRoll(attacker, target, IRREGULAR_SMALL_ARMS, [makeHex(0, 0), makeHex(1, 0)], fixedRandom(6)))
      .toMatchObject({ roll: { raw: 6, modified: 6, capped: 2 }, damageResult: 2, healthLoss: 2 });
  });

  it("uses only exact Irregular and All Infantry Store access", () => {
    expect(irregularEquipmentAllowed("equipment-charismatic-commander")).toBe(true);
    expect(irregularEquipmentAllowed("equipment-good-ammunition")).toBe(true);
    expect(irregularEquipmentAllowed("equipment-flak-vests")).toBe(true);
    expect(irregularEquipmentAllowed("equipment-mortar-squad")).toBe(false);
    expect(irregularEquipmentAllowed("equipment-orbital-drop-training")).toBe(false);
  });

  it("recruits once per Allied Population Center per campaign without healing", () => {
    const profile = getIrregularPublicV1Class(2);
    const actor = makeDeployment("irregular", { q: 0, r: 0 }, "ALLIED", {
      definitionId: profile.id,
      tags: profile.tags,
      stats: profile.stats,
      currentHealth: 4,
      equipmentIds: [IRREGULAR_PUBLIC_V1.recruitmentEquipmentId],
    });
    const map = [makeHex(0, 0), makeHex(1, 0, { control: "ALLIED", environment: ["POPULATION_CENTER"] })];
    const result = recruitIrregularAtPopulationCenter({ deployment: actor, route: [{ q: 0, r: 0 }, { q: 1, r: 0 }], map, campaignDeployments: [actor], round: 2 });
    expect(result).toMatchObject({ legal: true, maximumForceStrengthBefore: 10, maximumForceStrengthAfter: 13, maximumForceStrengthGained: 3, centerKey: "population-center:1,0" });
    expect(actor.currentHealth).toBe(4);
    const recruited = { ...actor, stats: { ...actor.stats, maxHealth: 13 }, statusEffects: result.statusEffects };
    expect(recruitIrregularAtPopulationCenter({ deployment: actor, route: [{ q: 0, r: 0 }, { q: 1, r: 0 }], map, campaignDeployments: [recruited], round: 3 }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/already recruited/i) });
    expect(recruitIrregularAtPopulationCenter({ deployment: actor, route: [{ q: 1, r: 0 }], map, campaignDeployments: [actor], round: 2 }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/entry/i) });
    const enemyCenter = [makeHex(0, 0), makeHex(1, 0, { control: "ENEMY", environment: ["POPULATION_CENTER"] })];
    expect(recruitIrregularAtPopulationCenter({ deployment: actor, route: [{ q: 0, r: 0 }, { q: 1, r: 0 }], map: enemyCenter, campaignDeployments: [actor], round: 2 }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/entry/i) });
  });

  it("publishes three irreversible HQ tracks with delta Req and retained identity/history", () => {
    expect(IRREGULAR_PROGRESSION_TRACKS).toMatchObject({
      MILITIA_VETERAN: { requisitionValue: 4, maxHealth: 12, armor: 0, speed: 1, damageDivisor: 2 },
      RAIDER: { requisitionValue: 6, maxHealth: 10, armor: 0, speed: 2, damageDivisor: 2 },
      REVOLUTIONARY_GUARD: { requisitionValue: 8, maxHealth: 10, armor: 1, speed: 1, damageDivisor: 1 },
    });
    const profile = getIrregularPublicV1Class(2);
    const actor = makeDeployment("irregular", { q: 0, r: 0 }, "ALLIED", {
      definitionId: profile.id,
      persistentUnitId: "persistent-irregular-7",
      callsign: "FREE-7",
      tags: profile.tags,
      stats: { ...profile.stats, maxHealth: 15 },
      currentHealth: 14,
      equipmentIds: ["equipment-good-ammunition", "equipment-mortar-squad"],
    });
    for (const [track, expected] of [
      ["MILITIA_VETERAN", { spent: 0, maxHealth: 12, armor: 0, speed: 1, tag: "IRREGULAR_DAMAGE_HALF" }],
      ["RAIDER", { spent: 2, maxHealth: 10, armor: 0, speed: 2, tag: "IRREGULAR_DAMAGE_HALF" }],
      ["REVOLUTIONARY_GUARD", { spent: 4, maxHealth: 10, armor: 1, speed: 1, tag: "IRREGULAR_DAMAGE_FULL" }],
    ] as const) {
      const upgraded = upgradeIrregularUnit({ deployment: actor, track, completedMissions: 2, experience: 12, availableRequisition: 4, atFriendlyHeadquarters: true, history: ["MISSION:K17"] });
      expect(upgraded).toMatchObject({ legal: true, requisitionSpent: expected.spent, requisitionAfter: 4 - expected.spent, track });
      expect(upgraded.deployment).toMatchObject({ id: actor.id, persistentUnitId: actor.persistentUnitId, callsign: actor.callsign, currentHealth: expected.maxHealth, stats: { maxHealth: expected.maxHealth, armor: expected.armor, speed: expected.speed } });
      expect(upgraded.deployment.tags).toContain(expected.tag);
      expect(upgraded.deployment.equipmentIds).toEqual(["equipment-good-ammunition"]);
      expect(upgraded.history).toEqual(["MISSION:K17", `IRREGULAR_PROGRESSION:${track}`]);
      expect(upgradeIrregularUnit({ deployment: upgraded.deployment, track: "RAIDER", completedMissions: 9, experience: 99, availableRequisition: 99, atFriendlyHeadquarters: true, history: upgraded.history }))
        .toMatchObject({ legal: false, reason: expect.stringMatching(/irreversible/i) });
    }
  });

  it("applies the Militia/Raider half-output and Guard full-output profiles", () => {
    const profile = getIrregularPublicV1Class(2);
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY", { currentHealth: 20, stats: { maxHealth: 20 } });
    for (const [track, capped] of [["MILITIA_VETERAN", 3], ["RAIDER", 3], ["REVOLUTIONARY_GUARD", 6]] as const) {
      const actor = makeDeployment(`irregular-${track}`, { q: 0, r: 0 }, "ALLIED", { definitionId: profile.id, tags: profile.tags, stats: profile.stats, weapons: profile.weapons });
      const upgraded = upgradeIrregularUnit({ deployment: actor, track, completedMissions: 2, experience: 12, availableRequisition: 4, atFriendlyHeadquarters: true, history: [] });
      expect(resolveAttackRoll(upgraded.deployment, target, IRREGULAR_SMALL_ARMS, [makeHex(0, 0), makeHex(1, 0)], fixedRandom(6)))
        .toMatchObject({ roll: { raw: 6, capped }, damageResult: capped });
    }
  });

  it("fails progression closed away from HQ or before both service thresholds", () => {
    const profile = getIrregularPublicV1Class(2);
    const actor = makeDeployment("irregular", { q: 0, r: 0 }, "ALLIED", { definitionId: profile.id, tags: profile.tags, stats: profile.stats });
    const base = { deployment: actor, track: "RAIDER" as const, completedMissions: 2, experience: 12, availableRequisition: 2, atFriendlyHeadquarters: true, history: [] };
    expect(upgradeIrregularUnit({ ...base, atFriendlyHeadquarters: false })).toMatchObject({ legal: false, reason: expect.stringMatching(/Headquarters/i) });
    expect(upgradeIrregularUnit({ ...base, completedMissions: 1 })).toMatchObject({ legal: false, reason: expect.stringMatching(/two completed missions/i) });
    expect(upgradeIrregularUnit({ ...base, experience: 11 })).toMatchObject({ legal: false, reason: expect.stringMatching(/12 XP/i) });
    expect(upgradeIrregularUnit({ ...base, availableRequisition: 1 })).toMatchObject({ legal: false, reason: expect.stringMatching(/Insufficient/i) });
  });

  it("executes the Primary Recruit action from actual Population Center entry and persists max FS/history", () => {
    const profile = getIrregularPublicV1Class(2);
    const actor = makeDeployment("irregular", { q: 0, r: 0 }, "ALLIED", {
      definitionId: profile.id,
      tags: profile.tags,
      stats: profile.stats,
      currentHealth: 4,
      equipmentIds: [IRREGULAR_PUBLIC_V1.recruitmentEquipmentId],
      allowedActions: profile.allowedActions as never,
      allowedOrders: profile.allowedOrders as never,
    });
    const rule = getTacticalActionRule("RECRUIT_IRREGULAR");
    const action = makeAction("recruit", { type: "RECRUIT_IRREGULAR", economy: rule.economy, speedCost: rule.speedCost });
    const order = makeOrder(actor, { route: [{ q: 0, r: 0 }, { q: 1, r: 0 }], endHex: { q: 1, r: 0 }, actions: [action] });
    const input = makeRoundInput(makeState([actor], [makeHex(0, 0), makeHex(1, 0, { control: "ALLIED", environment: ["POPULATION_CENTER"] })]), [order]);
    expect(validateOrder(order, actor, input)).toMatchObject({ legal: true });
    const output = resolveRound(input);
    const recruited = output.state.deployments[0]!;
    expect(recruited.stats.maxHealth).toBe(13);
    expect(recruited.currentHealth).toBe(4);
    expect(recruited.statusEffects).toEqual([expect.objectContaining({ definitionId: IRREGULAR_PUBLIC_V1.recruitmentHistoryStatusEffectId, status: "ACTIVE" })]);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "IRREGULAR_RECRUITED",
      actor: actor.id,
      payload: expect.objectContaining({ maximumForceStrengthBefore: 10, maximumForceStrengthAfter: 13, currentHealthBefore: 4, currentHealthAfter: 4, healed: false, permanent: true }),
    }));
    expect(output.persistentEffects.find((effect) => effect.type === "UNIT_STATE_UPDATED" && effect.unitId === actor.persistentUnitId)?.payload)
      .toMatchObject({ maximumHealth: 13, currentHealth: 4, statusEffects: [expect.objectContaining({ status: "ACTIVE" })] });
  });
});
