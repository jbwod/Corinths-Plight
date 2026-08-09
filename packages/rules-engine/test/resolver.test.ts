import type { CampaignDeployment, RoundInput, UnitOrder, WeaponProfile } from "../../domain/src";
import { RULESET_VERSION } from "../../domain/src";
import { describe, expect, it } from "vitest";
import { resolveRound, validateOrder } from "../src/resolver";
import {
  baseWeapon,
  makeAction,
  makeDeployment,
  makeHex,
  makeOrder,
  makeRoundInput,
  makeState,
} from "./fixtures";

function attackOrder(
  attacker: CampaignDeployment,
  target: CampaignDeployment,
  overrides: Partial<UnitOrder> = {},
): UnitOrder {
  const weapon = attacker.weapons[0];
  return makeOrder(attacker, {
    actions: [
      makeAction(`action-${attacker.id}`, {
        targetDeploymentId: target.id,
        weaponId: weapon.id,
      }),
    ],
    targets: [target.id],
    ...overrides,
  });
}

function basicAttackInput(seed = "resolver-replay-seed"): RoundInput {
  const attacker = makeDeployment("allied-attacker", { q: 0, r: 0 });
  const target = makeDeployment("enemy-target", { q: 1, r: 0 }, "ENEMY");
  const order = attackOrder(attacker, target);
  const state = makeState(
    [attacker, target],
    [makeHex(0, 0), makeHex(1, 0)],
    [order],
  );
  return makeRoundInput(state, [order], [], { seed, resolutionTime: 123_456 });
}

describe("order validation", () => {
  it("validates authoritative start, route continuity, speed, Rush, and Primary restrictions", () => {
    const deployment = makeDeployment("unit", { q: 0, r: 0 }, "ALLIED", {
      stats: { speed: 1 },
    });
    const map = [makeHex(0, 0), makeHex(1, 0)];
    const state = makeState([deployment], map);

    const valid = makeOrder(deployment, {
      route: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      orderType: "ADVANCE",
    });
    expect(validateOrder(valid, deployment, makeRoundInput(state, [valid]))).toEqual({
      legal: true,
      reasons: [],
      movementCost: 1,
    });

    const invalid = makeOrder(deployment, {
      startHex: { q: -1, r: 0 },
      route: [{ q: -1, r: 0 }, { q: 1, r: 0 }],
      endHex: { q: 1, r: 0 },
      orderType: "RUSH",
      actions: [
        makeAction("primary", { economy: "PRIMARY", type: "DIG_IN" }),
        makeAction("attack", { type: "ATTACK" }),
      ],
    });
    const result = validateOrder(invalid, deployment, makeRoundInput(state, [invalid]));

    expect(result.legal).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "Order start does not match authoritative unit position.",
        "Route step 1 is not adjacent.",
        "RUSH units cannot attack.",
        "A Primary Action replaces the unit's attack.",
      ]),
    );
  });

  it("rejects a ruleset mismatch before resolution", () => {
    const input = basicAttackInput();

    expect(() => resolveRound({ ...input, rulesetVersion: "another-ruleset" })).toThrow(
      /does not match the campaign-bound ruleset/i,
    );
  });
});

describe("seeded round reproducibility and replay", () => {
  it("returns identical output for the same immutable snapshot, seed, and logical time", () => {
    const input = basicAttackInput();
    const before = structuredClone(input);

    const first = resolveRound(input);
    const second = resolveRound(structuredClone(input));

    expect(second).toEqual(first);
    expect(second.digest).toBe(first.digest);
    expect(input).toEqual(before);
  });

  it("is invariant to player-order collection permutation", () => {
    const firstAttacker = makeDeployment("attacker-b", { q: 0, r: 0 });
    const secondAttacker = makeDeployment("attacker-a", { q: 0, r: 1 });
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY");
    const firstOrder = attackOrder(firstAttacker, target);
    const secondOrder = attackOrder(secondAttacker, target);
    const map = [makeHex(0, 0), makeHex(0, 1), makeHex(1, 0)];
    const state = makeState(
      [firstAttacker, secondAttacker, target],
      map,
      [firstOrder, secondOrder],
    );
    const first = resolveRound(
      makeRoundInput(state, [firstOrder, secondOrder], [], { seed: "permutation" }),
    );
    const second = resolveRound(
      makeRoundInput(state, [secondOrder, firstOrder], [], { seed: "permutation" }),
    );

    expect(second.events).toEqual(first.events);
    expect(second.state).toEqual(first.state);
    expect(second.digest).toBe(first.digest);
  });

  it("allows different private seeds to produce different results without publishing them", () => {
    const outputs = Array.from({ length: 16 }, (_, index) =>
      resolveRound(basicAttackInput(`private-seed-${index}`)),
    );

    expect(new Set(outputs.map((output) => output.digest)).size).toBeGreaterThan(1);
    for (const [index, output] of outputs.entries()) {
      expect(JSON.stringify(output.events)).not.toContain(`private-seed-${index}`);
    }
  });

  it("records meaningful raw, modified, and FS-capped dice evidence", () => {
    const output = resolveRound(basicAttackInput());
    const diceEvent = output.events.find((event) => event.type === "DICE_ROLLED");

    expect(diceEvent).toBeDefined();
    expect(diceEvent?.payload).toEqual(
      expect.objectContaining({
        weaponId: baseWeapon.id,
        targetId: "enemy-target",
        dice: baseWeapon.damage,
        raw: expect.any(Number),
        modified: expect.any(Number),
        capped: expect.any(Number),
      }),
    );
  });

  it("emits stable, unique persistent-effect idempotency keys on replay", () => {
    const input = basicAttackInput("persistent-effect-seed");
    const first = resolveRound(input);
    const second = resolveRound(structuredClone(input));
    const firstKeys = first.persistentEffects.map((effect) => effect.idempotencyKey);

    expect(second.persistentEffects).toEqual(first.persistentEffects);
    expect(second.persistentEffects.map((effect) => effect.idempotencyKey)).toEqual(firstKeys);
    expect(new Set(firstKeys).size).toBe(firstKeys.length);
  });

  it("treats a second resolution attempt on an already-resolved state as a semantic no-op", () => {
    const input = basicAttackInput("duplicate-resolution");
    const first = resolveRound(input);
    const replay = resolveRound({ ...input, previousState: first.state });

    expect(replay.digest).toBe(first.digest);
    expect(replay.events).toEqual([]);
    expect(replay.persistentEffects).toEqual([]);
    expect(replay.state.version).toBe(first.state.version);
  });
});

describe("simultaneous combat and capacity resolution", () => {
  it("lets mutually lethal attackers both fire before aggregate casualties apply", () => {
    const guaranteedWeapon: WeaponProfile = {
      ...baseWeapon,
      id: "weapon-guaranteed",
      damage: { count: 1, sides: 2, modifier: 10 },
      range: 1,
    };
    const allied = makeDeployment("allied", { q: 0, r: 0 }, "ALLIED", {
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 1 },
      currentHealth: 1,
      weapons: [structuredClone(guaranteedWeapon)],
    });
    const enemy = makeDeployment("enemy", { q: 1, r: 0 }, "ENEMY", {
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 1 },
      currentHealth: 1,
      weapons: [structuredClone(guaranteedWeapon)],
    });
    const alliedOrder = attackOrder(allied, enemy);
    const enemyOrder = attackOrder(enemy, allied);
    const state = makeState(
      [allied, enemy],
      [makeHex(0, 0), makeHex(1, 0)],
      [alliedOrder, enemyOrder],
    );

    const output = resolveRound(
      makeRoundInput(state, [alliedOrder], [enemyOrder], { seed: "mutual-destruction" }),
    );

    expect(output.events.filter((event) => event.type === "DICE_ROLLED")).toHaveLength(2);
    expect(output.events.filter((event) => event.type === "DAMAGE_APPLIED")).toHaveLength(2);
    expect(output.events.filter((event) => event.type === "UNIT_DESTROYED")).toHaveLength(2);
    expect(output.state.deployments.every((deployment) => deployment.status === "DESTROYED")).toBe(true);
  });

  it("blocks movement into an already full destination hex", () => {
    const mover = makeDeployment("mover", { q: -1, r: 0 });
    const occupant = makeDeployment("occupant", { q: 0, r: 0 });
    const destination = makeHex(0, 0, { capacity: 1 });
    const start = makeHex(-1, 0);
    const order = makeOrder(mover, {
      orderType: "ADVANCE",
      route: [start.coord, destination.coord],
    });
    const state = makeState([mover, occupant], [start, destination], [order]);

    const output = resolveRound(makeRoundInput(state, [order]));

    expect(output.state.deployments.find((unit) => unit.id === mover.id)?.position).toEqual(start.coord);
    expect(output.events).toContainEqual(
      expect.objectContaining({
        type: "UNIT_BLOCKED",
        actor: mover.id,
        payload: expect.objectContaining({ reason: "HEX_CAPACITY" }),
      }),
    );
  });

  it("stops both hostile movers before a capacity-one hex they contest simultaneously", () => {
    const alpha = makeDeployment("alpha", { q: -1, r: 0 }, "ALLIED");
    const bravo = makeDeployment("bravo", { q: 0, r: -1 }, "ENEMY");
    const destination = makeHex(0, 0, { capacity: 1 });
    const map = [makeHex(-1, 0), makeHex(0, -1), destination];
    const alphaOrder = makeOrder(alpha, {
      orderType: "ADVANCE",
      route: [alpha.position, destination.coord],
    });
    const bravoOrder = makeOrder(bravo, {
      orderType: "ADVANCE",
      route: [bravo.position, destination.coord],
    });
    const state = makeState([alpha, bravo], map, [alphaOrder, bravoOrder]);

    const output = resolveRound(makeRoundInput(state, [alphaOrder], [bravoOrder]));

    expect(output.state.deployments.find((unit) => unit.id === alpha.id)?.position).toEqual({ q: -1, r: 0 });
    expect(output.state.deployments.find((unit) => unit.id === bravo.id)?.position).toEqual({ q: 0, r: -1 });
  });

  it("rejects a duplicate ATTACK activation instead of resolving either action", () => {
    const attacker = makeDeployment("attacker", { q: 0, r: 0 });
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY");
    const order = attackOrder(attacker, target);
    order.actions.push(
      makeAction("second-attack", {
        targetDeploymentId: target.id,
        weaponId: attacker.weapons[0].id,
      }),
    );
    const state = makeState(
      [attacker, target],
      [makeHex(0, 0), makeHex(1, 0)],
      [order],
    );

    const output = resolveRound(makeRoundInput(state, [order], [], { seed: "one-activation" }));

    expect(output.events.filter((event) => event.type === "DICE_ROLLED")).toHaveLength(0);
    expect(output.events).toContainEqual(
      expect.objectContaining({
        type: "ORDER_REJECTED",
        payload: expect.objectContaining({
          reasons: expect.arrayContaining(["A unit receives one attack activation per round."]),
        }),
      }),
    );
  });
});

describe("version pin", () => {
  it("uses the canonical ruleset version in fixtures", () => {
    expect(basicAttackInput().rulesetVersion).toBe(RULESET_VERSION);
  });
});
