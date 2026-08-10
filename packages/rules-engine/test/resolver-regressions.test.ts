import type { CampaignEvent, WeaponProfile } from "../../domain/src";
import { describe, expect, it } from "vitest";
import { resolveRound } from "../src/resolver";
import {
  baseWeapon,
  makeAction,
  makeDeployment,
  makeHex,
  makeOrder,
  makeRoundInput,
  makeState,
} from "./fixtures";

function storedEvent(round: number, sequence: number): CampaignEvent {
  return {
    eventId: `campaign-test:${round}:${String(sequence).padStart(4, "0")}:ROUND_STARTED`,
    campaignId: "campaign-test",
    round,
    sequence,
    type: "ROUND_STARTED",
    payload: { round },
    timestamp: sequence,
    visibility: "PUBLIC",
  };
}

describe("resolver review regressions", () => {
  it("applies Dig In while holding and clears it only after actual movement", () => {
    const unit = makeDeployment("infantry", { q: 0, r: 0 }, "ALLIED", {
      definitionId: "unit-infantry-squad",
      tags: ["GROUND", "PERSONNEL", "INFANTRY", "DIG_IN"],
      stats: { speed: 1 },
    });
    const digInRule = { economy: "STANDARD" as const, speedCost: 1 };
    const digInOrder = makeOrder(unit, {
      actions: [makeAction("dig-in", { type: "DIG_IN", ...digInRule })],
    });
    const first = resolveRound(makeRoundInput(
      makeState([unit], [makeHex(0, 0), makeHex(1, 0)], [digInOrder]),
      [digInOrder],
    ));
    expect(first.state.deployments[0]?.statuses).toContain("DUG_IN");
    expect(first.events).toContainEqual(expect.objectContaining({ type: "UNIT_DUG_IN", actor: unit.id }));

    const nextState = structuredClone(first.state);
    nextState.round = 2;
    nextState.phase = "LOCKED";
    nextState.orders = [];
    const movedUnit = nextState.deployments[0]!;
    const moveOrder = makeOrder(movedUnit, {
      id: "move-after-dig-in",
      round: 2,
      route: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      endHex: { q: 1, r: 0 },
      orderType: "ADVANCE",
    });
    nextState.orders = [moveOrder];
    const second = resolveRound(makeRoundInput(nextState, [moveOrder]));
    expect(second.state.deployments[0]?.statuses).not.toContain("DUG_IN");
    expect(second.events).toContainEqual(expect.objectContaining({ type: "UNIT_DUG_OUT", actor: unit.id }));
  });

  it("continues event IDs and sequences after the highest existing event in the same round", () => {
    const unit = makeDeployment("unit", { q: 0, r: 0 });
    const order = makeOrder(unit);
    const state = makeState(
      [unit],
      [makeHex(0, 0)],
      [order],
      [storedEvent(0, 99), storedEvent(1, 2), storedEvent(1, 7)],
    );

    const output = resolveRound(makeRoundInput(state, [order]));

    expect(output.events).toHaveLength(1);
    expect(output.events[0]).toMatchObject({
      eventId: "campaign-test:1:0008:ROUND_FINISHED",
      round: 1,
      sequence: 8,
      type: "ROUND_FINISHED",
    });
    expect(output.state.events.map((event) => event.eventId)).toEqual([
      "campaign-test:0:0099:ROUND_STARTED",
      "campaign-test:1:0002:ROUND_STARTED",
      "campaign-test:1:0007:ROUND_STARTED",
      "campaign-test:1:0008:ROUND_FINISHED",
    ]);
  });

  it("resolves only the accepted current order, not a future order for the same unit", () => {
    const unit = makeDeployment("unit", { q: 0, r: 0 });
    const currentOrder = makeOrder(unit, {
      id: "order-current",
      round: 1,
      lifecycle: "SUBMITTED",
    });
    const futureOrder = makeOrder(unit, {
      id: "order-future",
      round: 2,
      lifecycle: "SUBMITTED",
    });
    const state = makeState(
      [unit],
      [makeHex(0, 0)],
      [currentOrder, futureOrder],
    );

    const output = resolveRound(makeRoundInput(state, [currentOrder]));
    const lifecycleById = new Map(output.state.orders.map((order) => [order.id, order.lifecycle]));

    expect(lifecycleById.get(currentOrder.id)).toBe("RESOLVED");
    expect(lifecycleById.get(futureOrder.id)).toBe("SUBMITTED");
    expect(output.events.at(-1)?.payload).toMatchObject({
      ordersAccepted: 1,
      ordersRejected: 0,
    });
  });

  it("preserves a newly applied cooldown for the rest of its round and ticks it next round", () => {
    const cooldownWeapon: WeaponProfile = {
      ...baseWeapon,
      id: "weapon-cooldown",
      range: 1,
      cooldownRounds: 3,
    };
    const attacker = makeDeployment("attacker", { q: 0, r: 0 }, "ALLIED", {
      weapons: [cooldownWeapon],
    });
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY");
    const attackOrder = makeOrder(attacker, {
      actions: [
        makeAction("attack", {
          targetDeploymentId: target.id,
          weaponId: cooldownWeapon.id,
        }),
      ],
      targets: [target.id],
    });
    const state = makeState(
      [attacker, target],
      [makeHex(0, 0), makeHex(1, 0)],
      [attackOrder],
    );

    const firstOutput = resolveRound(
      makeRoundInput(state, [attackOrder], [], { seed: "cooldown-regression" }),
    );
    const afterAttack = firstOutput.state.deployments.find((unit) => unit.id === attacker.id)!;
    expect(afterAttack.cooldowns[cooldownWeapon.id]).toBe(3);

    const nextRoundState = structuredClone(firstOutput.state);
    nextRoundState.round = 2;
    nextRoundState.phase = "LOCKED";
    nextRoundState.orders = [];
    const secondOutput = resolveRound(
      makeRoundInput(nextRoundState, [], [], { seed: "cooldown-next-round" }),
    );
    const afterNextRound = secondOutput.state.deployments.find((unit) => unit.id === attacker.id)!;

    expect(afterNextRound.cooldowns[cooldownWeapon.id]).toBe(2);
  });

  it("applies a HOLD order's final facing even though the unit does not move", () => {
    const unit = makeDeployment("unit", { q: 0, r: 0 }, "ALLIED", { facing: 0 });
    const hold = makeOrder(unit, {
      orderType: "HOLD",
      route: [{ q: 0, r: 0 }],
      facing: 4,
    });
    const state = makeState([unit], [makeHex(0, 0)], [hold]);

    const output = resolveRound(makeRoundInput(state, [hold]));
    const resolvedUnit = output.state.deployments.find((deployment) => deployment.id === unit.id)!;

    expect(resolvedUnit.position).toEqual({ q: 0, r: 0 });
    expect(resolvedUnit.facing).toBe(4);
    expect(output.events.some((event) => event.type === "UNIT_MOVED")).toBe(false);
  });
});
