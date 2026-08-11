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
      event(4, "OBJECTIVE_CAPTURED", undefined, { objectiveId: objective.id, owner: "ALLIED" }),
      event(5, "UNIT_DESTROYED", target.id, {}),
    ]);

    expect(frames).toHaveLength(6);
    expect(frames[0]!.deployments.find((unit) => unit.id === actor.id)?.position).toEqual(actor.position);
    expect(frames[1]!.deployments.find((unit) => unit.id === actor.id)?.position).toEqual(destination);
    expect(frames[2]!.deployments.find((unit) => unit.id === target.id)?.currentHealth).toBe(1);
    expect(frames[3]!.deployments.find((unit) => unit.id === target.id)?.currentHealth).toBe(2);
    expect(frames[4]!.objectives.find((item) => item.id === objective.id)?.owner).toBe("ALLIED");
    expect(frames[5]!.deployments.find((unit) => unit.id === target.id)).toMatchObject({
      currentHealth: 0,
      status: "DESTROYED",
    });
  });
});
