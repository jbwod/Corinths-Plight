import { describe, expect, it } from "vitest";

import { INFANTRY_COVER_ARMOR_1, INFANTRY_GARRISON_BUILDING } from "../src/cover";
import { resolveRound, validateOrder } from "../src/resolver";
import { makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

describe("infantry building garrisons", () => {
  it("enters an authored building for 0.25 Speed and persists derived occupancy", () => {
    const start = makeHex(0, 0);
    const building = makeHex(1, 0, {
      movementCost: 3,
      environment: [INFANTRY_COVER_ARMOR_1, INFANTRY_GARRISON_BUILDING],
    });
    const infantry = makeDeployment("garrison-squad", start.coord, "ALLIED", {
      definitionId: "unit-infantry-squad",
      tags: ["GROUND", "PERSONNEL", "INFANTRY"],
      stats: { speed: 0.25 },
    });
    const order = makeOrder(infantry, { route: [start.coord, building.coord] });
    const state = makeState([infantry], [start, building], [order]);
    const input = makeRoundInput(state, [order]);

    expect(validateOrder(order, infantry, input)).toMatchObject({ legal: true, movementCost: 0.25 });
    const output = resolveRound(input);
    const resolved = output.state.deployments.find((unit) => unit.id === infantry.id)!;

    expect(resolved.position).toEqual(building.coord);
    expect(resolved.statuses).toContain("GARRISONED");
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_GARRISONED",
      actor: infantry.id,
      payload: expect.objectContaining({ movementCost: 0.25, coverArmor: 1, conflictId: "RC-COVER-001" }),
    }));
  });

  it("removes garrison occupancy when infantry leaves the building", () => {
    const building = makeHex(0, 0, {
      environment: [INFANTRY_COVER_ARMOR_1, INFANTRY_GARRISON_BUILDING],
    });
    const open = makeHex(1, 0);
    const infantry = makeDeployment("departing-squad", building.coord, "ALLIED", {
      definitionId: "unit-infantry-squad",
      tags: ["GROUND", "PERSONNEL", "INFANTRY"],
      statuses: ["GARRISONED"],
    });
    const order = makeOrder(infantry, { route: [building.coord, open.coord] });
    const output = resolveRound(makeRoundInput(makeState([infantry], [building, open], [order]), [order]));
    const resolved = output.state.deployments.find((unit) => unit.id === infantry.id)!;

    expect(resolved.position).toEqual(open.coord);
    expect(resolved.statuses).not.toContain("GARRISONED");
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_LEFT_GARRISON",
      actor: infantry.id,
    }));
  });

  it("does not give a vehicle garrison occupancy", () => {
    const start = makeHex(0, 0);
    const building = makeHex(1, 0, { environment: [INFANTRY_GARRISON_BUILDING] });
    const vehicle = makeDeployment("vehicle", start.coord, "ALLIED", {
      tags: ["GROUND", "VEHICLE", "INFANTRY"],
    });
    const order = makeOrder(vehicle, { route: [start.coord, building.coord] });
    const output = resolveRound(makeRoundInput(makeState([vehicle], [start, building], [order]), [order]));

    expect(output.state.deployments.find((unit) => unit.id === vehicle.id)?.statuses).not.toContain("GARRISONED");
    expect(output.events.some((event) => event.type === "UNIT_GARRISONED")).toBe(false);
  });
});
