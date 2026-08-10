import type {
  CampaignEvent,
  ResolutionRecord,
  ViewerContext,
} from "../../domain/src";
import { describe, expect, it } from "vitest";
import { projectCampaignState, projectEvents } from "../src/visibility";
import { makeDeployment, makeHex, makeOrder, makeState } from "./fixtures";

const alliedViewer: ViewerContext = {
  userId: "allied-player",
  side: "ALLIED",
  role: "PLAYER",
};

const enemyViewer: ViewerContext = {
  userId: "enemy-player",
  side: "ENEMY",
  role: "PLAYER",
};

const adminViewer: ViewerContext = {
  userId: "admin",
  side: "NEUTRAL",
  role: "ADMIN",
};

function event(
  sequence: number,
  visibility: CampaignEvent["visibility"],
  overrides: Partial<CampaignEvent> = {},
): CampaignEvent {
  return {
    eventId: `event-${sequence}-${visibility}`,
    campaignId: "campaign-test",
    round: 1,
    sequence,
    type: "UNIT_MOVED",
    actor: "actor",
    payload: { sequence },
    timestamp: 1_000 + sequence,
    visibility,
    ...overrides,
  };
}

function visibilityFixture() {
  const allied = makeDeployment("allied-observer", { q: 0, r: 0 }, "ALLIED", {
    stats: { sensors: 1 },
  });
  const visibleEnemy = makeDeployment("visible-enemy", { q: 1, r: 0 }, "ENEMY", {
    stats: { sensors: 1 },
  });
  const hiddenEnemy = makeDeployment("hidden-enemy", { q: 3, r: 0 }, "ENEMY", {
    stats: { sensors: 1 },
  });
  const map = [
    makeHex(0, 0, { visibility: "OBSERVED" }),
    makeHex(1, 0, { visibility: "OBSERVED" }),
    makeHex(2, 0, { visibility: "UNKNOWN" }),
    makeHex(3, 0, {
      visibility: "UNKNOWN",
      control: "ENEMY",
      objectiveId: "secret-objective",
      structureIds: ["secret-structure"],
      environment: ["secret-hazard"],
    }),
  ];
  const alliedOrder = makeOrder(allied);
  const visibleEnemyOrder = makeOrder(visibleEnemy);
  const hiddenEnemyOrder = makeOrder(hiddenEnemy);
  const events = [
    event(1, "PUBLIC"),
    event(2, "ALLIED"),
    event(3, "ENEMY"),
    event(4, "ADMIN"),
  ];
  const state = makeState(
    [allied, visibleEnemy, hiddenEnemy],
    map,
    [alliedOrder, visibleEnemyOrder, hiddenEnemyOrder],
    events,
  );
  const resolution: ResolutionRecord = {
    key: "secret-resolution",
    campaignId: state.campaignId,
    round: state.round,
    seed: "server-secret-seed",
    startedAt: 1,
    committedAt: 2,
    eventIds: events.map((item) => item.eventId),
    stateDigest: "secret-digest",
  };
  state.resolutions[resolution.key] = resolution;
  state.pendingPersistentEffects.push({
    idempotencyKey: "secret-effect",
    type: "UNIT_DAMAGED",
    unitId: allied.persistentUnitId,
    payload: { hidden: true },
    status: "PENDING",
  });
  return { state, allied, visibleEnemy, hiddenEnemy };
}

describe("event visibility projection", () => {
  const events = [
    event(1, "PUBLIC"),
    event(2, "ALLIED"),
    event(3, "ENEMY"),
    event(4, "ADMIN"),
  ];

  it("shows normal viewers only public and same-side events", () => {
    expect(projectEvents(events, alliedViewer).map((item) => item.visibility)).toEqual([
      "PUBLIC",
      "ALLIED",
    ]);
    expect(projectEvents(events, enemyViewer).map((item) => item.visibility)).toEqual([
      "PUBLIC",
      "ENEMY",
    ]);
  });

  it("shows an administrator all visibility classes without mutating the source", () => {
    const before = structuredClone(events);

    expect(projectEvents(events, adminViewer)).toEqual(events);
    expect(events).toEqual(before);
  });
});

describe("campaign-state redaction", () => {
  it("keeps own units, adds only observed enemies, and withholds enemy orders", () => {
    const { state, allied, visibleEnemy, hiddenEnemy } = visibilityFixture();
    const view = projectCampaignState(state, alliedViewer, 9_999);

    expect(view.deployments.map((deployment) => deployment.id).sort()).toEqual(
      [allied.id, visibleEnemy.id].sort(),
    );
    expect(view.deployments.map((deployment) => deployment.id)).not.toContain(hiddenEnemy.id);
    expect(view.orders.map((order) => order.unitId)).toEqual([allied.id]);
    expect(view.viewer).toEqual(alliedViewer);
    expect(view.serverTime).toBe(9_999);
  });

  it("removes resolution seeds/journals and pending persistent effects from every campaign view", () => {
    const { state } = visibilityFixture();
    const view = projectCampaignState(state, alliedViewer, 9_999);

    expect("resolutions" in view).toBe(false);
    expect("pendingPersistentEffects" in view).toBe(false);
    expect("reinforcementWaves" in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain("server-secret-seed");
    expect(JSON.stringify(view)).not.toContain("secret-effect");
  });

  it("keeps reserve deployments and authored wave timing out of the player projection", () => {
    const { state, hiddenEnemy } = visibilityFixture();
    hiddenEnemy.status = "READY";
    hiddenEnemy.locationState = "RESERVE";
    state.reinforcementWaves = [{
      id: "hidden-wave",
      arrivesAfterRound: 1,
      deploymentIds: [hiddenEnemy.id],
      status: "PENDING",
    }];

    const view = projectCampaignState(state, alliedViewer, 9_999);

    expect(view.deployments.map((deployment) => deployment.id)).not.toContain(hiddenEnemy.id);
    expect("reinforcementWaves" in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain("hidden-wave");
  });

  it("marks LOS-visible map hexes visible and preserves non-visible memory state", () => {
    const { state } = visibilityFixture();
    const view = projectCampaignState(state, alliedViewer, 9_999);
    const byCoordinate = new Map(view.map.map((hex) => [`${hex.coord.q},${hex.coord.r}`, hex]));

    expect(byCoordinate.get("0,0")?.visibility).toBe("VISIBLE");
    expect(byCoordinate.get("1,0")?.visibility).toBe("VISIBLE");
    expect(byCoordinate.get("2,0")?.visibility).toBe("UNKNOWN");
    expect(byCoordinate.get("3,0")?.visibility).toBe("UNKNOWN");
  });

  it("gives administrators all deployments, orders, events, and visible map hexes", () => {
    const { state } = visibilityFixture();
    const view = projectCampaignState(state, adminViewer, 9_999);

    expect(view.deployments).toHaveLength(state.deployments.length);
    expect(view.orders).toHaveLength(state.orders.length);
    expect(view.events).toHaveLength(state.events.length);
    expect(view.map.every((hex) => hex.visibility === "VISIBLE")).toBe(true);
  });

  it("redacts dynamic control, objective, structure, and hazard data from UNKNOWN hexes", () => {
    const { state } = visibilityFixture();
    const view = projectCampaignState(state, alliedViewer, 9_999);
    const hiddenHex = view.map.find((hex) => hex.coord.q === 3 && hex.coord.r === 0)!;

    expect(hiddenHex.visibility).toBe("UNKNOWN");
    expect(hiddenHex.control).toBe("NEUTRAL");
    expect(hiddenHex.objectiveId).toBeUndefined();
    expect(hiddenHex.structureIds).toEqual([]);
    expect(hiddenHex.environment).toEqual([]);
  });

  it("does not leak an unseen enemy route through a nominally public event payload", () => {
    const { state, hiddenEnemy } = visibilityFixture();
    state.events.push(
      event(5, "PUBLIC", {
        actor: hiddenEnemy.id,
        payload: {
          from: { q: 3, r: 0 },
          to: { q: 2, r: 0 },
          route: [
            { q: 3, r: 0 },
            { q: 2, r: 0 },
          ],
        },
      }),
    );

    const view = projectCampaignState(state, alliedViewer, 9_999);

    expect(view.events.find((item) => item.eventId === "event-5-PUBLIC")).toBeUndefined();
    expect(JSON.stringify(view.events)).not.toContain(hiddenEnemy.id);
    expect(JSON.stringify(view.events)).not.toContain('"q":3');
  });
});
