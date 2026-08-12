import type { CampaignDeployment, StructuredAction } from "../../domain/src";
import { describe, expect, it } from "vitest";

import {
  getTacticalActionRule,
  getTacticalUnitClass,
  resolveAttackRoll,
  resolveRound,
  tacticalRulesCatalogueRuntime,
  validateOrder,
} from "../src";
import { INFANTRY_COVER_ARMOR_1, INFANTRY_GARRISON_BUILDING } from "../src/cover";
import { fixedRandom, makeAction, makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

function infantry(
  id: string,
  position: CampaignDeployment["position"],
  side: CampaignDeployment["side"] = "ALLIED",
): CampaignDeployment {
  const definition = getTacticalUnitClass("unit-infantry-squad");
  return makeDeployment(id, position, side, {
    definitionId: definition.id,
    tags: [...definition.tags],
    stats: structuredClone(definition.stats),
    weapons: structuredClone(definition.weapons),
  });
}

function governedAction(
  id: string,
  type: StructuredAction["type"],
  overrides: Partial<StructuredAction> = {},
): StructuredAction {
  const rule = getTacticalActionRule(type);
  return makeAction(id, {
    type,
    economy: rule.economy,
    speedCost: rule.speedCost,
    ...overrides,
  });
}

describe("V5 Infantry Squad playable mechanics", () => {
  it("materializes the canonical force-strength, rifle, movement and field-position rules", () => {
    const definition = getTacticalUnitClass("unit-infantry-squad");

    expect(definition).toMatchObject({
      category: "INFANTRY",
      tags: expect.arrayContaining(["GROUND", "PERSONNEL", "INFANTRY", "DIG_IN"]),
      stats: {
        healthModel: "FORCE_STRENGTH",
        maxHealth: 6,
        armor: 0,
        defense: 0,
        speed: 1,
        sensors: 4,
        capacity: 1,
      },
      allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
      allowedActions: ["ATTACK", "DIG_IN", "TRENCH_UPGRADE", "LOAD", "UNLOAD"],
      weapons: [{
        id: "weapon-infantry-rifle",
        damage: { count: 1, sides: 6, modifier: 0 },
        range: 1,
        armorPiercing: 0,
      }],
    });
  });

  it("keeps Dig In protection against a rear attack while the squad is inside a structure", () => {
    const target = infantry("garrisoned-defender", { q: 0, r: 0 }, "ENEMY");
    target.facing = 0;
    target.statuses = ["GARRISONED", "DUG_IN"];
    const attacker = infantry("rear-attacker", { q: 0, r: 1 });
    const map = [
      makeHex(0, 0, { environment: [INFANTRY_GARRISON_BUILDING, INFANTRY_COVER_ARMOR_1] }),
      makeHex(0, 1),
    ];

    expect(resolveAttackRoll(attacker, target, attacker.weapons[0]!, map, fixedRandom(1))).toMatchObject({
      rearAttack: true,
      targetArmor: 0,
      coverArmor: 1,
      effectiveArmor: 1,
      digInDefense: 2,
      targetDefense: 2,
      threshold: 3,
    });
  });

  it("keeps Flak Vests and Light AT active with their governed conditional armour and finite-ammo effects", () => {
    for (const equipmentId of ["equipment-flak-vests", "equipment-light-at"] as const) {
      expect(tacticalRulesCatalogueRuntime.decide("EQUIPMENT", equipmentId, "PRODUCTION")).toMatchObject({
        availability: { allowed: true },
        executability: { allowed: true },
        purchasable: true,
      });
    }
    const effects = (equipmentId: string) => tacticalRulesCatalogueRuntime
      .relationsFrom({ definitionKind: "EQUIPMENT", definitionId: equipmentId })
      .filter((relation) => relation.kind === "EQUIPMENT_EFFECT")
      .map((relation) => (relation.parameters as { effect: unknown }).effect);

    expect(effects("equipment-flak-vests")).toEqual([
      { type: "STAT_SET_IF", stat: "armor", whenEquals: 0, value: 1 },
    ]);
    expect(effects("equipment-light-at")).toEqual([
      { type: "WEAPON_GRANT", weaponId: "weapon-light-at" },
      { type: "AMMO_GRANT", weaponId: "weapon-light-at", capacity: 3 },
    ]);
  });

  it("derives garrison occupancy for stationary squads and removes stale occupancy", () => {
    const building = makeHex(0, 0, {
      environment: [INFANTRY_GARRISON_BUILDING, INFANTRY_COVER_ARMOR_1],
    });
    const open = makeHex(1, 0);
    const inside = infantry("inside", building.coord);
    const outside = infantry("outside", open.coord);
    outside.statuses = ["GARRISONED"];
    const output = resolveRound(makeRoundInput(makeState([inside, outside], [building, open])));

    expect(output.state.deployments.find((unit) => unit.id === inside.id)?.statuses).toContain("GARRISONED");
    expect(output.state.deployments.find((unit) => unit.id === outside.id)?.statuses).not.toContain("GARRISONED");
    expect(output.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "UNIT_GARRISONED",
        actor: inside.id,
        payload: expect.objectContaining({ reason: "DERIVED_OCCUPANCY", conflictId: "RC-COVER-001" }),
      }),
      expect.objectContaining({
        type: "UNIT_LEFT_GARRISON",
        actor: outside.id,
        payload: expect.objectContaining({ reason: "STALE_OCCUPANCY" }),
      }),
    ]));
  });

  it("voids a stationary trench defender's Dig In when a hostile passage crosses its hex", () => {
    const defender = infantry("trench-defender", { q: 0, r: 0 }, "ENEMY");
    defender.statuses = ["DUG_IN"];
    const mechDefinition = getTacticalUnitClass("unit-light-mech");
    const mech = makeDeployment("hostile-mech", { q: -1, r: 0 }, "ALLIED", {
      definitionId: mechDefinition.id,
      tags: [...mechDefinition.tags],
      stats: structuredClone(mechDefinition.stats),
      weapons: structuredClone(mechDefinition.weapons),
    });
    const route = [mech.position, defender.position, { q: 1, r: 0 }];
    const order = makeOrder(mech, { route, endHex: route[2], orderType: "ADVANCE" });
    const output = resolveRound(makeRoundInput(
      makeState(
        [defender, mech],
        [makeHex(-1, 0), makeHex(0, 0, { structureIds: ["structure-trench:occupied"] }), makeHex(1, 0)],
        [order],
      ),
      [order],
    ));

    expect(output.state.deployments.find((unit) => unit.id === defender.id)?.statuses).not.toContain("DUG_IN");
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_DUG_OUT",
      actor: defender.id,
      payload: expect.objectContaining({
        reason: "HOSTILE_ENTERED_TRENCH",
        hostileUnitIds: [mech.id],
        conflictId: "RC-V5-019",
      }),
    }));
  });

  it("reserves Dig In and free Trench Upgrade for their governed classes", () => {
    const vehicle = makeDeployment("crafted-vehicle", { q: 0, r: 0 }, "ALLIED", {
      definitionId: "unit-main-battle-tank",
      tags: ["GROUND", "VEHICLE", "ARMOURED", "INFANTRY"],
    });
    const sandbags = makeHex(0, 0, { structureIds: ["structure-sandbag-line:existing"] });
    const digIn = makeOrder(vehicle, { actions: [governedAction("illegal-dig-in", "DIG_IN")] });
    const trench = makeOrder(vehicle, {
      actions: [governedAction("illegal-trench", "TRENCH_UPGRADE", { targetHex: vehicle.position })],
    });
    const state = makeState([vehicle], [sandbags]);

    expect(validateOrder(digIn, vehicle, makeRoundInput(state, [digIn])).reasons).toContain(
      "This unit class cannot Dig In.",
    );
    expect(validateOrder(trench, vehicle, makeRoundInput(state, [trench])).reasons).toContain(
      "Trench Upgrade requires an Infantry Squad.",
    );
  });

  it("fails closed when a crafted generic reload tries to replenish finite Light AT charges", () => {
    const squad = infantry("light-at-squad", { q: 0, r: 0 });
    squad.weapons.push({
      id: "weapon-light-at",
      name: "Lightweight Anti-armour Weapon",
      damage: { count: 1, sides: 6 },
      range: 1,
      armorPiercing: 1,
      ammoCapacity: 3,
      tags: ["ANTI_ARMOUR", "EQUIPMENT", "FS_CAPPED"],
    });
    squad.ammunition["weapon-light-at"] = 1;
    squad.supplies = { SMALL_SUPPLY: 1 };
    const reload = makeOrder(squad, {
      actions: [governedAction("reload-light-at", "RELOAD", { weaponId: "weapon-light-at" })],
    });
    const state = makeState([squad], [makeHex(0, 0)], [reload]);

    expect(validateOrder(reload, squad, makeRoundInput(state, [reload])).reasons).toContain(
      "Light AT charges have no active field reload rule.",
    );
    const output = resolveRound(makeRoundInput(state, [reload]));
    expect(output.state.deployments[0]?.ammunition["weapon-light-at"]).toBe(1);
    expect(output.state.deployments[0]?.supplies).toEqual({ SMALL_SUPPLY: 1 });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: squad.id,
      payload: expect.objectContaining({ reasons: expect.arrayContaining(["Light AT charges have no active field reload rule."]) }),
    }));
  });

  it("validates facing and persists the squad's board, equipment and field-position state", () => {
    const squad = infantry("persistent-squad", { q: 0, r: 0 });
    squad.equipmentIds = ["owned-flak-vests", "owned-light-at"];
    const digIn = makeOrder(squad, {
      facing: 3,
      actions: [governedAction("dig-in", "DIG_IN")],
    });
    const state = makeState([squad], [makeHex(0, 0)], [digIn]);
    const invalidFacing = makeOrder(squad, { facing: 6 as never });

    expect(validateOrder(invalidFacing, squad, makeRoundInput(state, [invalidFacing])).reasons).toContain(
      "Facing must be an integer from 0 through 5.",
    );
    const output = resolveRound(makeRoundInput(state, [digIn]));
    const resolved = output.state.deployments.find((unit) => unit.id === squad.id)!;
    const persisted = output.persistentEffects.find((effect) =>
      effect.type === "UNIT_STATE_UPDATED" && effect.unitId === squad.persistentUnitId
    );

    expect(resolved).toMatchObject({ facing: 3, position: { q: 0, r: 0 }, statuses: ["DUG_IN"] });
    expect(persisted?.payload).toMatchObject({
      position: { q: 0, r: 0 },
      facing: 3,
      statuses: ["DUG_IN"],
      equipmentIds: ["owned-flak-vests", "owned-light-at"],
    });
  });
});
