import { describe, expect, it } from "vitest";
import type { CampaignEvent } from "../../packages/domain/src";
import { createDemoCampaignState, projectCampaignState } from "../../packages/rules-engine/src";
import { buildCampaignReplayFrames } from "./replay";

function event(sequence: number, type: CampaignEvent["type"], actor: string | undefined, payload: Record<string, unknown>): CampaignEvent {
  return {
    eventId: `replay-${sequence}`,
    campaignId: "outpost-k17",
    round: 18,
    sequence,
    type,
    actor,
    payload,
    timestamp: sequence,
    visibility: "ALLIED",
  };
}

describe("campaign report replay", () => {
  it("reconstructs movement, damage, healing, destruction, and objective control in event order", () => {
    const state = createDemoCampaignState(1);
    const view = projectCampaignState(state, {
      userId: "demo-user",
      side: "ALLIED",
      role: "ADMIN",
      battalionId: "battalion-33rd-expeditionary",
    }, 1);
    const actor = view.deployments.find((unit) => unit.side === "ALLIED")!;
    const target = view.deployments.find((unit) => unit.side === "ENEMY")!;
    actor.subsystems = [{ subsystemId: "MOBILITY", state: "OPERATIONAL" }];
    const objective = view.objectives[0]!;
    const destination = { q: actor.position.q + 1, r: actor.position.r };
    const frames = buildCampaignReplayFrames({
      round: view.round,
      map: view.map,
      deployments: view.deployments,
      objectives: view.objectives,
    }, [
      event(1, "UNIT_MOVED", actor.id, { from: actor.position, to: destination, route: [actor.position, destination] }),
      event(2, "DAMAGE_APPLIED", target.id, { before: target.currentHealth, after: 1, loss: target.currentHealth - 1 }),
      event(3, "UNIT_HEALED", actor.id, { targetId: target.id, before: 1, after: 2, amount: 1 }),
      event(4, "LIGHT_AT_EXPENDED", actor.id, { targetId: target.id, chargesSpent: 2, ammunitionAfter: 1 }),
      event(5, "OBJECTIVE_CAPTURED", undefined, { objectiveId: objective.id, owner: "ALLIED" }),
      event(6, "UNIT_DESTROYED", target.id, {}),
      event(7, "SUBSYSTEM_MALFUNCTIONED", target.id, {
        targetId: actor.id,
        affectedSubsystemIds: ["MOBILITY"],
      }),
      event(8, "UNIT_REPAIRED", actor.id, {
        targetId: actor.id,
        repairKind: "SUBSYSTEM",
        repairMethod: "CREW",
        subsystemId: "MOBILITY",
        before: actor.currentHealth,
        after: actor.currentHealth,
      }),
      event(9, "DICE_ROLLED", actor.id, {
        weaponId: "weapon-fighter-snub-hmg",
        ammunitionBefore: 1,
        ammunitionAfter: 0,
      }),
      event(10, "AEROSPACE_REARMED", actor.id, {
        ammunitionBefore: { "weapon-fighter-snub-hmg": 0 },
        ammunitionAfter: { "weapon-fighter-snub-hmg": 1 },
      }),
    ]);

    expect(frames).toHaveLength(11);
    expect(frames[0]!.deployments.find((unit) => unit.id === actor.id)?.position).toEqual(actor.position);
    expect(frames[1]!.deployments.find((unit) => unit.id === actor.id)?.position).toEqual(destination);
    expect(frames[2]!.deployments.find((unit) => unit.id === target.id)?.currentHealth).toBe(1);
    expect(frames[3]!.deployments.find((unit) => unit.id === target.id)?.currentHealth).toBe(2);
    expect(frames[4]!.deployments.find((unit) => unit.id === actor.id)?.ammunition["weapon-light-at"]).toBe(1);
    expect(frames[5]!.objectives.find((item) => item.id === objective.id)?.owner).toBe("ALLIED");
    expect(frames[6]!.deployments.find((unit) => unit.id === target.id)).toMatchObject({
      currentHealth: 0,
      status: "DESTROYED",
    });
    expect(frames[7]!.deployments.find((unit) => unit.id === actor.id)?.subsystems).toEqual([
      { subsystemId: "MOBILITY", state: "DISABLED" },
    ]);
    expect(frames[8]!.deployments.find((unit) => unit.id === actor.id)?.subsystems).toEqual([
      { subsystemId: "MOBILITY", state: "OPERATIONAL" },
    ]);
    expect(frames[9]!.deployments.find((unit) => unit.id === actor.id)?.ammunition["weapon-fighter-snub-hmg"]).toBe(0);
    expect(frames[10]!.deployments.find((unit) => unit.id === actor.id)?.ammunition["weapon-fighter-snub-hmg"]).toBe(1);
  });
});
