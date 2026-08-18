import type { CampaignDeployment, WeaponProfile } from "../packages/domain/src";
import { resolveRound, validateOrder } from "../packages/rules-engine/src";
import {
  makeAxialMap,
  makeDeployment,
  makeRoundInput,
  makeState,
} from "../packages/rules-engine/test/fixtures";
import { describe, expect, it } from "vitest";
import { generateEnemyOrders } from "./enemy-ai";

const claws: WeaponProfile = {
  id: "weapon-bug-claws",
  name: "Rending Claws",
  damage: { count: 1, sides: 6 },
  range: 1,
  armorPiercing: 0,
  tags: ["MELEE", "FS_CAPPED"],
};
const spines: WeaponProfile = {
  id: "weapon-bug-spines",
  name: "Heavy Spine Volley",
  damage: { count: 1, sides: 6 },
  range: 4,
  armorPiercing: 2,
  tags: ["ANTI_ARMOUR"],
};

function bug(
  id: string,
  definitionId: "enemy-bug-drone" | "enemy-bug-warrior" | "enemy-bug-heavy",
  position = { q: 0, r: 0 },
): CampaignDeployment {
  const heavy = definitionId === "enemy-bug-heavy";
  return makeDeployment(id, position, "ENEMY", {
    definitionId,
    persistentUnitId: undefined,
    weapons: [heavy ? spines : claws],
    stats: { speed: heavy ? 1 : 2, sensors: 6 },
    allowedActions: ["ATTACK"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
  });
}

function vehicle(id: string, position: { q: number; r: number }): CampaignDeployment {
  return makeDeployment(id, position, "ALLIED", {
    tags: ["GROUND", "VEHICLE"],
    stats: { healthModel: "HITS" },
  });
}

describe("data-driven enemy intentions", () => {
  it("spreads anti-armour fire across priority vehicles with permutation-stable output", () => {
    const enemies = [bug("heavy-a", "enemy-bug-heavy"), bug("heavy-b", "enemy-bug-heavy")];
    const allied = [vehicle("tank-a", { q: 1, r: 0 }), vehicle("tank-b", { q: 2, r: 0 })];
    const state = makeState([...enemies, ...allied], makeAxialMap(3));

    const first = generateEnemyOrders(state, 12_345);
    const permuted = generateEnemyOrders({ ...state, deployments: [...state.deployments].reverse() }, 12_345);

    expect(first.map((order) => order.targets[0])).toEqual(["tank-a", "tank-b"]);
    expect(first.map((order) => order.enemyIntent?.targetPreference)).toEqual(["VEHICLE", "VEHICLE"]);
    expect(permuted).toEqual(first);
  });

  it("follows the Warrior's authored personnel priority over a nearer vehicle", () => {
    const enemy = bug("warrior", "enemy-bug-warrior");
    enemy.weapons = [{ ...claws, range: 4 }];
    const state = makeState([
      enemy,
      vehicle("near-tank", { q: 1, r: 0 }),
      makeDeployment("far-infantry", { q: 2, r: 0 }, "ALLIED", { tags: ["GROUND", "PERSONNEL"] }),
    ], makeAxialMap(3));

    const [order] = generateEnemyOrders(state, 12_345);

    expect(order?.targets).toEqual(["far-infantry"]);
    expect(order?.enemyIntent?.targetPreference).toBe("PERSONNEL");
  });

  it("uses the scenario's primary objective when no Allied formation is visible", () => {
    const enemy = bug("drone", "enemy-bug-drone", { q: 2, r: 0 });
    enemy.stats.sensors = 0;
    const state = makeState([enemy], makeAxialMap(3));
    state.objectives = [{
      id: "objective-authored-relay",
      name: "Authored Relay",
      coord: { q: 0, r: 0 },
      owner: "ALLIED",
      status: "ACTIVE",
      description: "Scenario-authored objective.",
    }];
    state.scenarioPolicy = {
      policyId: "HOLD_PRIMARY_OBJECTIVE",
      version: 1,
      startRound: 1,
      maxRounds: 4,
      primaryObjectiveId: "objective-authored-relay",
      capturableObjectiveIds: ["objective-authored-relay"],
    };

    const [order] = generateEnemyOrders(state, 12_345);

    expect(order?.enemyIntent?.objectiveId).toBe("objective-authored-relay");
    expect(order?.targets).toEqual([]);
    expect(order?.endHex).toEqual({ q: 0, r: 0 });
  });

  it("generates orders accepted by the tactical grammar and emits visible intention evidence", () => {
    const enemy = bug("heavy", "enemy-bug-heavy");
    const target = vehicle("tank", { q: 2, r: 0 });
    const state = makeState([enemy, target], makeAxialMap(3));
    const [order] = generateEnemyOrders(state, 12_345);
    if (!order) throw new Error("Expected one enemy order.");

    expect(validateOrder(order, enemy, makeRoundInput(state, [], [order]))).toMatchObject({ legal: true });
    const output = resolveRound(makeRoundInput(state, [], [order]));
    expect(output.events.find((event) => event.type === "ENEMY_INTENTION_DECLARED")).toMatchObject({
      actor: "heavy",
      payload: {
        doctrineDefinitionId: "enemy-bug-heavy",
        factionId: "bug-swarm",
        targetPreference: "VEHICLE",
        allocation: "SPREAD_BY_PRIORITY",
        targetId: "tank",
      },
    });
  });
});
