import { describe, expect, it } from "vitest";
import type { CampaignDeployment, RoundInput, StructuredAction, UnitOrder } from "../../domain/src";
import {
  createDemoCampaignState,
  createScenarioCampaignState,
  getActionDefinition,
  IRON_RAIN_SCENARIO_CONTENT_KEY,
  resolveRound,
  validateOrder,
} from "../src";

function action(id: string, type: StructuredAction["type"], fields: Partial<StructuredAction> = {}): StructuredAction {
  const rule = getActionDefinition(type);
  return { id, type, economy: rule.economy, speedCost: rule.speedCost, equipmentIds: [], ...fields };
}

function order(
  state: ReturnType<typeof createDemoCampaignState>,
  unit: CampaignDeployment,
  actions: StructuredAction[],
): UnitOrder {
  return {
    id: `order:${unit.id}:${actions.map((item) => item.type).join("-")}`,
    revision: 1,
    unitId: unit.id,
    campaignId: state.campaignId,
    round: state.round,
    orderType: "HOLD",
    lifecycle: "SUBMITTED",
    startHex: { ...unit.position },
    route: [{ ...unit.position }],
    endHex: { ...unit.position },
    facing: unit.facing,
    actions,
    targets: [],
    equipmentUsed: [],
    ammoUsed: {},
    incidentalActions: [],
    submittedBy: unit.ownerId,
    submittedAt: 1,
  };
}

function roundInput(
  state: ReturnType<typeof createDemoCampaignState>,
  playerOrders: UnitOrder[],
  enemyOrders: UnitOrder[],
): RoundInput {
  state.orders = [...playerOrders, ...enemyOrders];
  return {
    previousState: state,
    rulesetVersion: state.rulesetVersion,
    playerOrders,
    enemyOrders,
    seed: "fighter-completion",
    resolutionTime: 2_000,
  };
}

describe("Aerospace Fighter completion mechanics", () => {
  it("persists landed state and restored one-shot ammunition after a governed rearm", () => {
    const fighterSource = createDemoCampaignState(1_000).deployments
      .find((deployment) => deployment.id === "dep-vulture-1")!;
    const state = createScenarioCampaignState({
      mapSourceKey: "fixture/operation-iron-rain",
      scenarioContentKey: IRON_RAIN_SCENARIO_CONTENT_KEY,
      campaignId: "fighter-rearm-persistence",
      campaignName: "Fighter Rearm Persistence",
      planetName: "Corinth",
      now: 1_000,
      durationMs: 300_000,
      alliedDeployments: [{
        ...structuredClone(fighterSource),
        id: "fighter-rearm",
        campaignId: "fighter-rearm-persistence",
        position: { q: 0, r: 0 },
        statuses: [],
        ammunition: { "weapon-fighter-snub-hmg": 0 },
      }],
    });
    const fighter = state.deployments.find((deployment) => deployment.id === "fighter-rearm")!;
    const rearm = order(state, fighter, [
      action("land", "LAND"),
      action("rearm", "REARM_AEROSPACE"),
    ]);
    const output = resolveRound(roundInput(state, [rearm], []));
    const resolved = output.state.deployments.find((deployment) => deployment.id === fighter.id)!;
    const persistent = output.persistentEffects.find((effect) =>
      effect.type === "UNIT_STATE_UPDATED" && effect.unitId === fighter.persistentUnitId
    );

    expect(resolved.statuses).toContain("LANDED");
    expect(resolved.ammunition).toEqual({ "weapon-fighter-snub-hmg": 1 });
    expect(persistent?.payload.ammunition).toEqual({ "weapon-fighter-snub-hmg": 1 });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "AEROSPACE_REARMED",
      actor: fighter.id,
      payload: expect.objectContaining({
        ammunitionBefore: { "weapon-fighter-snub-hmg": 0 },
        ammunitionAfter: { "weapon-fighter-snub-hmg": 1 },
        supplyCost: null,
        rulesDecisionId: "RC-V5-023",
      }),
    }));
  });

  it("forces an intercepted hostile Fighter to attack the legal Interceptor", () => {
    const state = createDemoCampaignState(1_000);
    const interceptor = state.deployments.find((deployment) => deployment.id === "dep-vulture-1")!;
    const hostileFighter = structuredClone(interceptor);
    const groundTarget = state.deployments.find((deployment) => deployment.id === "dep-rook-7")!;
    hostileFighter.id = "enemy-fighter";
    hostileFighter.ownerId = "enemy-doctrine";
    hostileFighter.side = "ENEMY";
    hostileFighter.position = { q: 1, r: 0 };
    hostileFighter.facing = 5;
    interceptor.position = { q: 0, r: 0 };
    interceptor.facing = 2;
    groundTarget.position = { q: 1, r: -1 };
    state.deployments = [interceptor, hostileFighter, groundTarget];

    const interceptOrder = order(state, interceptor, [action("intercept", "ATTACK", {
      targetDeploymentId: hostileFighter.id,
    })]);
    const hostileOrder = order(state, hostileFighter, [action("hostile-shot", "ATTACK", {
      targetDeploymentId: groundTarget.id,
    })]);
    const output = resolveRound(roundInput(state, [interceptOrder], [hostileOrder]));

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "AEROSPACE_INTERCEPTED",
      actor: hostileFighter.id,
      payload: expect.objectContaining({ interceptorId: interceptor.id, rulesDecisionId: "RC-V5-028" }),
    }));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "DICE_ROLLED",
      actor: hostileFighter.id,
      payload: expect.objectContaining({
        targetId: interceptor.id,
        ammunitionBefore: 1,
        ammunitionAfter: 0,
      }),
    }));
    expect(output.events).not.toContainEqual(expect.objectContaining({
      type: "DICE_ROLLED",
      actor: hostileFighter.id,
      payload: expect.objectContaining({ targetId: groundTarget.id }),
    }));
  });

  it("rejects a player attack that ignores a legal hostile Interceptor", () => {
    const state = createDemoCampaignState(1_000);
    const playerFighter = state.deployments.find((deployment) => deployment.id === "dep-vulture-1")!;
    const hostileInterceptor = structuredClone(playerFighter);
    const groundTarget = state.deployments.find((deployment) => deployment.id === "bug-drone-1")!;
    playerFighter.position = { q: 0, r: 0 };
    playerFighter.facing = 2;
    hostileInterceptor.id = "enemy-interceptor";
    hostileInterceptor.ownerId = "enemy-doctrine";
    hostileInterceptor.side = "ENEMY";
    hostileInterceptor.position = { q: 1, r: 0 };
    hostileInterceptor.facing = 5;
    groundTarget.position = { q: 1, r: -1 };
    state.deployments = [playerFighter, hostileInterceptor, groundTarget];

    const ignoredIntercept = order(state, playerFighter, [action("ignored-intercept", "ATTACK", {
      targetDeploymentId: groundTarget.id,
    })]);
    const hostileIntercept = order(state, hostileInterceptor, [action("hostile-intercept", "ATTACK", {
      targetDeploymentId: playerFighter.id,
    })]);
    const output = resolveRound(roundInput(state, [ignoredIntercept], [hostileIntercept]));

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: playerFighter.id,
      payload: expect.objectContaining({
        targetId: groundTarget.id,
        legalInterceptorIds: [hostileInterceptor.id],
        rulesDecisionId: "RC-V5-028",
        reasons: [expect.stringMatching(/only a legal Interceptor/i)],
      }),
    }));
    expect(output.state.deployments.find((deployment) => deployment.id === playerFighter.id)?.ammunition)
      .toEqual({ "weapon-fighter-snub-hmg": 1 });
  });

  it("fails closed on illegal fixed-wing state transitions and Primary rearm conflicts", () => {
    const state = createDemoCampaignState(1_000);
    const fighter = state.deployments.find((deployment) => deployment.id === "dep-vulture-1")!;
    fighter.position = { q: 0, r: 0 };

    const simultaneousTransition = order(state, fighter, [
      action("land", "LAND"),
      action("take-off", "TAKE_OFF"),
    ]);
    expect(validateOrder(simultaneousTransition, fighter, roundInput(state, [simultaneousTransition], [])))
      .toMatchObject({ legal: false, reasons: expect.arrayContaining([expect.stringMatching(/cannot land and take off/i)]) });

    fighter.statuses = ["LANDED"];
    const rearmAndAttack = order(state, fighter, [
      action("rearm", "REARM_AEROSPACE"),
      action("attack", "ATTACK", { targetDeploymentId: "bug-drone-1" }),
    ]);
    expect(validateOrder(rearmAndAttack, fighter, roundInput(state, [rearmAndAttack], [])))
      .toMatchObject({ legal: false, reasons: expect.arrayContaining([expect.stringMatching(/Primary Action replaces/i)]) });
  });
});
