import { describe, expect, it } from "vitest";
import {
  SAPPER_QUIET_RIFLE,
  SAPPER_STRUCTURE_POLICIES,
  applySapperWeaponEmplacement,
  getSapperPublicV1Class,
  parseSapperMinefield,
  performSapperBuildAction,
  performSapperConstruction,
  purchaseSappers,
  readSapperProject,
  reloadSapperBuildSupply,
  reloadSapperBuildSupplyFromDeployment,
  resolveSapperMineTrigger,
  sapperEquipmentAllowed,
  sensorTowerRevealHexes,
  SOURCE_SAPPER_BUILD_PROFILE,
} from "../src/sapper-construction";
import { resolveAttackRoll } from "../src/mechanics";
import { resolveRound, validateOrder } from "../src/resolver";
import { getTacticalActionRule } from "../src/tactical-grammar";
import { fixedRandom, makeAction, makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

describe("source-exact Sapper construction accounting", () => {
  it("publishes the companion row's six-point pool and three-for-three build action", () => {
    expect(SOURCE_SAPPER_BUILD_PROFILE).toEqual({
      capacity: 6,
      supplyPerAction: 3,
      progressPerAction: 3,
      reloadResource: "GENERAL_SUPPLY",
      reloadCost: 1,
    });
    expect(performSapperBuildAction({ buildSupply: 6, generalSupply: 0, projectProgress: 4 })).toEqual({
      legal: true,
      state: { buildSupply: 3, generalSupply: 0, projectProgress: 7 },
      supplySpent: 3,
      progressAdded: 3,
    });
    expect(performSapperBuildAction({ buildSupply: 3, generalSupply: 0, projectProgress: 7 })).toEqual({
      legal: true,
      state: { buildSupply: 0, generalSupply: 0, projectProgress: 10 },
      supplySpent: 3,
      progressAdded: 3,
    });
  });

  it("fails closed when fewer than three Build Supply remain", () => {
    const state = { buildSupply: 2, generalSupply: 1, projectProgress: 3 };
    expect(performSapperBuildAction(state)).toEqual({
      legal: false,
      reason: "Sapper construction requires 3 Build Supply.",
      state,
      supplySpent: 0,
      progressAdded: 0,
    });
  });

  it("reloads the complete Sapper pool for exactly one General Supply crate", () => {
    expect(reloadSapperBuildSupply({ buildSupply: 0, generalSupply: 2, projectProgress: 6 })).toEqual({
      legal: true,
      state: { buildSupply: 6, generalSupply: 1, projectProgress: 6 },
      supplySpent: 1,
      progressAdded: 0,
    });
  });

  it("rejects a full reload, missing General Supply, and malformed state without mutation", () => {
    expect(reloadSapperBuildSupply({ buildSupply: 6, generalSupply: 1, projectProgress: 0 }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/already full/i) });
    expect(reloadSapperBuildSupply({ buildSupply: 3, generalSupply: 0, projectProgress: 0 }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/General Supply/i) });
    expect(performSapperBuildAction({ buildSupply: 7, generalSupply: 1, projectProgress: 0 }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/state is invalid/i) });
  });

  it("rejects invalid profiles instead of inferring replacement values", () => {
    expect(performSapperBuildAction(
      { buildSupply: 6, generalSupply: 1, projectProgress: 0 },
      { ...SOURCE_SAPPER_BUILD_PROFILE, progressPerAction: 0 },
    )).toMatchObject({ legal: false, reason: expect.stringMatching(/profile is invalid/i) });
  });
});

function sapper(position = { q: 0, r: 0 }) {
  const profile = getSapperPublicV1Class(3);
  return makeDeployment("sapper", position, "ALLIED", {
    definitionId: profile.id,
    tags: profile.tags,
    stats: profile.stats,
    weapons: profile.weapons,
    supplies: { BUILD_SUPPLY: 6, GENERAL_SUPPLY: 1, SMALL_SUPPLY: 9 },
    allowedActions: profile.allowedActions as never,
    allowedOrders: profile.allowedOrders as never,
  });
}

describe("Sappers public-v1 playable profile", () => {
  it("publishes the Req 6 FS profile and current-FS-capped D4 attack", () => {
    const profile = getSapperPublicV1Class(4);
    expect(profile).toMatchObject({
      id: "unit-sappers",
      requisitionCost: 6,
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 2, armor: 0, speed: 1, sensors: 4 },
      slots: { primary: 1, secondary: 1 },
      allowedOrders: ["HOLD", "ADVANCE", "RUSH", "STEALTH"],
      allowedActions: ["ATTACK", "SAPPER_CONSTRUCT", "RELOAD_BUILD_SUPPLY"],
    });
    expect(SAPPER_QUIET_RIFLE).toMatchObject({ damage: { count: 1, sides: 4 }, range: 1, armorPiercing: 0 });
    expect(purchaseSappers(6)).toMatchObject({ legal: true, requisitionAfter: 0, requisitionSpent: 6 });
    expect(purchaseSappers(5)).toMatchObject({ legal: false, requisitionAfter: 5, requisitionSpent: 0 });
    const attacker = sapper();
    attacker.currentHealth = 1;
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY", { currentHealth: 10, stats: { maxHealth: 10 } });
    expect(resolveAttackRoll(attacker, target, SAPPER_QUIET_RIFLE, [makeHex(0, 0), makeHex(1, 0)], fixedRandom(4)))
      .toMatchObject({ roll: { raw: 4, capped: 1 }, damageResult: 1, healthLoss: 1 });
  });

  it("keeps Store access exact and does not inherit Engineers-only items", () => {
    expect(sapperEquipmentAllowed("equipment-mines")).toBe(true);
    expect(sapperEquipmentAllowed("equipment-at-mines")).toBe(true);
    expect(sapperEquipmentAllowed("equipment-automated-turrets")).toBe(true);
    expect(sapperEquipmentAllowed("equipment-road-building")).toBe(true);
    expect(sapperEquipmentAllowed("equipment-flak-vests")).toBe(true);
    expect(sapperEquipmentAllowed("equipment-weapon-emplacement-equipment")).toBe(false);
    expect(sapperEquipmentAllowed("equipment-heavy-fortification-equipment")).toBe(false);
    expect(sapperEquipmentAllowed("equipment-flamethrower-team")).toBe(false);
  });

  it("uses a separate 6/6 Build Supply pool and never aliases Small Supply", () => {
    const actor = sapper();
    const map = [makeHex(0, 0), makeHex(1, 0)];
    const result = performSapperConstruction(actor, "structure-trench", { q: 1, r: 0 }, map, 1);
    expect(result).toMatchObject({ legal: true, buildSupplyBefore: 6, buildSupplyAfter: 3, progressAfter: 3, completed: true });
    expect(actor.supplies).toMatchObject({ BUILD_SUPPLY: 6, GENERAL_SUPPLY: 1, SMALL_SUPPLY: 9 });
    actor.supplies = { ...actor.supplies, BUILD_SUPPLY: 0 };
    const reload = reloadSapperBuildSupplyFromDeployment(actor);
    expect(reload).toMatchObject({ legal: true, supplies: { BUILD_SUPPLY: 6, GENERAL_SUPPLY: 0, SMALL_SUPPLY: 9 } });
  });

  it("persists multi-action progress and enforces the bounded recipe prerequisites", () => {
    const actor = sapper();
    const map = [makeHex(0, 0), makeHex(1, 0), makeHex(2, 0)];
    const sensor1 = performSapperConstruction(actor, "structure-sensor-tower", { q: 1, r: 0 }, map, 1);
    expect(sensor1).toMatchObject({ legal: true, progressAfter: 3, completed: false, buildSupplyAfter: 3 });
    actor.statusEffects = sensor1.statusEffects;
    actor.supplies = { ...actor.supplies, BUILD_SUPPLY: sensor1.buildSupplyAfter };
    const sensor2 = performSapperConstruction(actor, "structure-sensor-tower", { q: 1, r: 0 }, map, 2);
    expect(sensor2).toMatchObject({ legal: true, progressBefore: 3, progressAfter: 6, completed: false });
    actor.statusEffects = sensor2.statusEffects;
    actor.supplies = { ...actor.supplies, BUILD_SUPPLY: 3 };
    const sensor3 = performSapperConstruction(actor, "structure-sensor-tower", { q: 1, r: 0 }, map, 3);
    expect(sensor3).toMatchObject({ legal: true, progressBefore: 6, progressAfter: 9, completed: true, structureInstanceId: expect.stringContaining("structure-sensor-tower") });
    expect(SAPPER_STRUCTURE_POLICIES["structure-sensor-tower"].requiredProgress).toBe(7);
    expect(readSapperProject({ ...actor, statusEffects: sensor2.statusEffects })).toMatchObject({ progress: 6, requiredProgress: 7 });
    expect(performSapperConstruction(sapper(), "structure-road", { q: 1, r: 0 }, map, 1))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/Road Building Equipment/i) });
    expect(performSapperConstruction(sapper(), "structure-sapper-at-minefield", { q: 1, r: 0 }, map, 1))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/Anti-tank Mines/i) });
    expect(performSapperConstruction(sapper(), "structure-supply-depot", { q: 1, r: 0 }, map, 1))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/outside/i) });
  });

  it("reveals exactly the Sensor Tower hex and its one-hex ring", () => {
    const map = [makeHex(0, 0), makeHex(1, 0), makeHex(2, 0), makeHex(1, 1), makeHex(0, 1)];
    expect(sensorTowerRevealHexes({ q: 1, r: 0 }, map)).toEqual([
      { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 1, r: 1 }, { q: 0, r: 1 },
    ]);
  });

  it("makes road edges and the anti-armour emplacement tactically useful under public-v1", () => {
    const actor = sapper();
    actor.equipmentIds = ["equipment-road-building"];
    const map = [makeHex(0, 0), makeHex(1, 0)];
    expect(performSapperConstruction(actor, "structure-road", { q: 0, r: 0 }, map, 1))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/adjacent/i) });
    expect(performSapperConstruction(actor, "structure-road", { q: 1, r: 0 }, map, 1))
      .toMatchObject({ legal: true, completed: true });
    const emplacementMap = [makeHex(0, 0, { structureIds: ["structure-sapper-weapon-emplacement:ALLIED:1:sapper:0,0"] })];
    expect(applySapperWeaponEmplacement(actor, SAPPER_QUIET_RIFLE, emplacementMap)).toMatchObject({
      applied: true,
      weapon: { damage: { count: 1, sides: 4, modifier: 1 }, range: 2, armorPiercing: 2 },
    });
  });

  it("arms mines next round, consumes them on first eligible hostile entry, and uses published damage", () => {
    const ordinary = parseSapperMinefield("structure-sapper-minefield:ALLIED:1:sapper:0,0")!;
    const at = parseSapperMinefield("structure-sapper-at-minefield:ALLIED:1:sapper:0,0")!;
    const infantry = makeDeployment("infantry", { q: 0, r: 0 }, "ENEMY", { stats: { maxHealth: 6, armor: 1 }, currentHealth: 6, tags: ["INFANTRY"] });
    const vehicle = makeDeployment("vehicle", { q: 0, r: 0 }, "ENEMY", { stats: { healthModel: "HITS", maxHealth: 4, armor: 3 }, currentHealth: 4, tags: ["VEHICLE"] });
    expect(resolveSapperMineTrigger(ordinary, infantry, 1)).toMatchObject({ triggered: false });
    expect(resolveSapperMineTrigger(ordinary, infantry, 2)).toEqual({ triggered: true, healthLoss: 2, armorPiercing: 0 });
    expect(resolveSapperMineTrigger(at, infantry, 2)).toMatchObject({ triggered: false, armorPiercing: 2 });
    expect(resolveSapperMineTrigger(at, vehicle, 2)).toEqual({ triggered: true, healthLoss: 1, armorPiercing: 2 });
  });

  it("resolves quiet construction, progress persistence, reload, sensor reveal, and mine triggers end to end", () => {
    const actor = sapper();
    actor.statuses = ["STEALTHED"];
    const map = [makeHex(0, 0), makeHex(1, 0)];
    const buildRule = getTacticalActionRule("SAPPER_CONSTRUCT");
    const build = makeAction("build", { type: "SAPPER_CONSTRUCT", economy: buildRule.economy, speedCost: buildRule.speedCost, targetHex: { q: 1, r: 0 }, structureDefinitionId: "structure-sensor-tower" });
    const buildOrder = makeOrder(actor, { actions: [build] });
    const input = makeRoundInput(makeState([actor], map), [buildOrder]);
    expect(validateOrder(buildOrder, actor, input)).toMatchObject({ legal: true });
    const output = resolveRound(input);
    const resolved = output.state.deployments[0]!;
    expect(resolved.supplies).toMatchObject({ BUILD_SUPPLY: 3, GENERAL_SUPPLY: 1, SMALL_SUPPLY: 9 });
    expect(resolved.statuses).toContain("STEALTHED");
    expect(readSapperProject(resolved)).toMatchObject({ progress: 3, requiredProgress: 7 });
    expect(output.events).toContainEqual(expect.objectContaining({ type: "SAPPER_BUILD_PROGRESS", payload: expect.objectContaining({ completed: false }) }));

    const reloadActor = sapper();
    reloadActor.supplies = { BUILD_SUPPLY: 0, GENERAL_SUPPLY: 1, SMALL_SUPPLY: 9 };
    const reloadRule = getTacticalActionRule("RELOAD_BUILD_SUPPLY");
    const reloadAction = makeAction("reload", { type: "RELOAD_BUILD_SUPPLY", economy: reloadRule.economy, speedCost: reloadRule.speedCost });
    const reloadOrder = makeOrder(reloadActor, { actions: [reloadAction] });
    const reloaded = resolveRound(makeRoundInput(makeState([reloadActor], [makeHex(0, 0)]), [reloadOrder]));
    expect(reloaded.state.deployments[0]?.supplies).toMatchObject({ BUILD_SUPPLY: 6, GENERAL_SUPPLY: 0, SMALL_SUPPLY: 9 });
    expect(reloaded.events).toContainEqual(expect.objectContaining({ type: "SAPPER_BUILD_SUPPLY_RELOADED" }));

    const mineHex = makeHex(1, 0, { structureIds: ["structure-sapper-minefield:ALLIED:0:sapper:1,0"] });
    const hostile = makeDeployment("hostile", { q: 2, r: 0 }, "ENEMY", { currentHealth: 6, stats: { maxHealth: 6, armor: 0 } });
    const move = makeOrder(hostile, { route: [{ q: 2, r: 0 }, { q: 1, r: 0 }], endHex: { q: 1, r: 0 } });
    const mined = resolveRound(makeRoundInput(makeState([hostile], [makeHex(2, 0), mineHex]), [], [move]));
    expect(mined.state.map.find((hex) => hex.coord.q === 1)?.structureIds).toEqual([]);
    expect(mined.state.deployments[0]?.currentHealth).toBe(3);
    expect(mined.events).toContainEqual(expect.objectContaining({ type: "SAPPER_MINE_TRIGGERED", payload: expect.objectContaining({ healthLoss: 3, consumed: true }) }));

    const roadBuilder = sapper();
    roadBuilder.equipmentIds = ["equipment-road-building"];
    const roadAction = makeAction("road", { type: "SAPPER_CONSTRUCT", economy: buildRule.economy, speedCost: buildRule.speedCost, targetHex: { q: 1, r: 0 }, structureDefinitionId: "structure-road" });
    const roadOrder = makeOrder(roadBuilder, { actions: [roadAction] });
    const road = resolveRound(makeRoundInput(makeState([roadBuilder], [makeHex(0, 0), makeHex(1, 0)]), [roadOrder]));
    expect(road.state.map[0]?.edges.roads).toContain(2);
    expect(road.state.map[1]?.edges.roads).toContain(5);
  });
});
