import { describe, expect, it } from "vitest";
import type { BattalionPermission, StrategicOrderIntent } from "../packages/domain/src";
import { authorizeStrategicIntent, mayResolveStrategicRound } from "./strategic-policy";

const allPermissions = new Set<BattalionPermission>([
  "STRATEGIC_ORDER_CREATE",
  "STRATEGIC_ORDER_APPROVE",
  "SHIP_MOVE",
  "BATTLEGROUP_ASSIGN",
  "OPERATION_COMMAND",
  "SUPPLY_MANAGE",
]);

function decision(intent: StrategicOrderIntent, permissions = allPermissions) {
  return authorizeStrategicIntent(
    {
      userId: "user-havoc",
      battalionId: "battalion-33rd",
      permissions,
      formation: { kind: "BATTLEGROUP", id: "battlegroup-hammer" },
      formationBelongsToBattalion: true,
      isFormationCommander: true,
      ownsEveryFormationUnit: false,
      hasActiveDelegation: false,
    },
    intent,
  );
}

describe("strategic authority policy", () => {
  it("uses data-driven permissions rather than rank names", () => {
    expect(decision({ type: "MOVE_BATTLEGROUP" })).toEqual({ allowed: true });
    expect(decision({ type: "MOVE_BATTLEGROUP" }, new Set())).toMatchObject({
      allowed: false,
      code: "BATTALION_PERMISSION_REQUIRED",
    });
  });

  it("requires explicit Battlegroup command, ownership, or delegation", () => {
    expect(
      authorizeStrategicIntent(
        {
          userId: "user-havoc",
          battalionId: "battalion-33rd",
          permissions: allPermissions,
          formation: { kind: "BATTLEGROUP", id: "battlegroup-raven" },
          formationBelongsToBattalion: true,
          isFormationCommander: false,
          ownsEveryFormationUnit: false,
          hasActiveDelegation: false,
        },
        { type: "MOVE_BATTLEGROUP" },
      ),
    ).toMatchObject({ allowed: false, code: "FORMATION_DELEGATION_REQUIRED" });
  });

  it("requires ship movement permission for a Task Force order", () => {
    const permissions = new Set<BattalionPermission>(["STRATEGIC_ORDER_CREATE"]);
    expect(
      authorizeStrategicIntent(
        {
          userId: "user-havoc",
          battalionId: "battalion-33rd",
          permissions,
          formation: { kind: "TASK_FORCE", id: "task-force-resolute" },
          formationBelongsToBattalion: true,
          isFormationCommander: true,
          ownsEveryFormationUnit: false,
          hasActiveDelegation: false,
        },
        { type: "MOVE_TASK_FORCE" },
      ),
    ).toMatchObject({ allowed: false, code: "BATTALION_PERMISSION_REQUIRED" });
  });

  it("fails visibly for deferred orbital combat and tactical campaign transitions", () => {
    expect(decision({ type: "ORBITAL_COMBAT", opposingFormationId: "hostile" })).toMatchObject({
      allowed: false,
      code: "ORBITAL_COMBAT_DEFERRED",
    });
    expect(
      decision({ type: "WITHDRAW_FROM_CAMPAIGN", battlegroupId: "hammer", operationId: "iron-rain" }),
    ).toMatchObject({ allowed: false, code: "TACTICAL_WITHDRAWAL_REQUIRED" });
    expect(
      decision({
        type: "DEPLOY_TO_CAMPAIGN",
        battlegroupId: "hammer",
        operationId: "iron-rain",
        deploymentMethod: "STANDARD_LANDING",
      }),
    ).toMatchObject({ allowed: false, code: "TACTICAL_DEPLOYMENT_DEFERRED" });
  });

  it("requires explicit approval to resolve in every environment", () => {
    expect(mayResolveStrategicRound("development", allPermissions)).toBe(true);
    expect(mayResolveStrategicRound("preview", allPermissions)).toBe(true);
    expect(mayResolveStrategicRound("production", allPermissions)).toBe(true);
    expect(mayResolveStrategicRound("production", new Set())).toBe(false);
  });
});
