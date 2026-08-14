import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  getDeploymentAuthority: vi.fn(),
  getDeploymentFormation: vi.fn(),
  getDeploymentPlan: vi.fn(),
  getDeploymentReceipt: vi.fn(),
  listDeploymentPlanUnits: vi.fn(),
  listDeploymentTransports: vi.fn(),
  listInsertionZones: vi.fn(),
}));

const equipment = vi.hoisted(() => ({
  buildStoredEffectiveUnit: vi.fn(),
}));

vi.mock("../repositories/equipment", async (importOriginal) => ({
  ...await importOriginal<typeof import("../repositories/equipment")>(),
  ...repository,
}));

vi.mock("./equipment", async (importOriginal) => ({
  ...await importOriginal<typeof import("./equipment")>(),
  ...equipment,
}));

import type { EffectiveUnit } from "../../packages/domain/src";
import type { Env } from "../env";
import type { DeploymentAuthorityRow, DeploymentPlanRow } from "../repositories/equipment";
import { commitPlan } from "./deployment";

interface StoredReceipt {
  operation: string;
  request_hash: string;
  response_json: string;
}

class Statement {
  bindings: unknown[] = [];

  constructor(readonly query: string) {}

  bind(...bindings: unknown[]): this {
    this.bindings = bindings;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return { success: true, results: [], meta: {} } as unknown as D1Result<T>;
  }
}

function harness(pinAvailable = true): {
  env: Env;
  authority: DeploymentAuthorityRow;
  batches: Statement[][];
  coordinatorCalls: Request[];
} {
  const campaignId = "gm-campaign-1234567890abcdef1234567890abcdef";
  const mapRevisionId = "gm-map-1234567890abcdef1234567890abcdef@2";
  const authority: DeploymentAuthorityRow = {
    battalion_id: "battalion-1",
    command_role: "BATTALION_COMMAND",
    campaign_id: campaignId,
    campaign_status: "RECRUITING",
    campaign_ruleset_id: "ruleset-v5-core-curated-1",
    game_master_map_revision_id: mapRevisionId,
    game_master_scenario_available: pinAvailable ? 1 : 0,
    side: "ALLIED",
    campaign_role: "BATTALION_COMMAND",
    operation_id: null,
    operation_node_id: null,
    operation_status: null,
    campaign_node_id: null,
    force_policy_json: '{"reinforcementStatus":"OPEN"}',
    reinforcement_policy_json: null,
    current_round: 1,
  };
  const plan: DeploymentPlanRow = {
    id: "deployment-plan-custom-1",
    campaign_id: campaignId,
    battalion_id: authority.battalion_id,
    battlegroup_id: null,
    created_by: "player-1",
    ruleset_id: authority.campaign_ruleset_id,
    status: "VALID",
    deployment_method_id: "STANDARD_GROUND",
    insertion_zone_id: "gm-insertion-zone-1",
    route_json: "[]",
    validation_json: '{"valid":true}',
    revision: 1,
    committed_at: null,
    created_at: 1,
    updated_at: 1,
  };
  const effectiveUnit: EffectiveUnit = {
    rulesetVersion: "v5-core-curated-2",
    definitionId: "unit-infantry",
    persistentUnitId: "player-unit-1",
    stats: { healthModel: "FORCE_STRENGTH", maxHealth: 6, armor: 0, defense: 1, speed: 4, sensors: 3, capacity: 0 },
    tags: ["INFANTRY"],
    weapons: [],
    allowedActions: [],
    allowedOrders: ["HOLD"],
    abilities: [],
    deploymentMethods: ["STANDARD_GROUND"],
    equipmentInstanceIds: [],
    refitInstanceIds: [],
    ammunition: {},
    cooldowns: {},
    sourceHash: "unit-infantry@1",
  };
  let receipt: StoredReceipt | null = null;
  let deploymentInserted = false;
  let planCommitted = false;
  const batches: Statement[][] = [];
  const coordinatorCalls: Request[] = [];

  repository.getDeploymentPlan.mockResolvedValue(plan);
  repository.getDeploymentAuthority.mockImplementation(async () => authority);
  repository.getDeploymentFormation.mockResolvedValue(null);
  repository.getDeploymentReceipt.mockImplementation(async () => receipt);
  repository.listDeploymentPlanUnits.mockResolvedValue([{
    player_unit_id: "player-unit-1",
    owner_id: "player-1",
    loadout_id: "loadout-1",
    owner_approval: "APPROVED",
    command_approval: "APPROVED",
    expected_unit_version: 3,
    expected_loadout_revision: 2,
  }]);
  repository.listDeploymentTransports.mockResolvedValue([]);
  repository.listInsertionZones.mockResolvedValue([{
    id: "gm-insertion-zone-1",
    campaign_id: campaignId,
    hex_q: 0,
    hex_r: 0,
    allowed_methods_json: '["STANDARD_GROUND"]',
    status: "OPEN",
    environment_json: "[]",
  }]);
  equipment.buildStoredEffectiveUnit.mockResolvedValue({
    context: {
      unit_version: 3,
      loadout_revision: 2,
      definition_id: effectiveUnit.definitionId,
      current_health: effectiveUnit.stats.maxHealth,
      ruleset_id: authority.campaign_ruleset_id,
    },
    result: { valid: true, errors: [], warnings: [], unit: effectiveUnit },
    selected: [],
    inventoryRows: [],
    baseWeaponIds: [],
    supplies: {},
    slots: {},
    rulesAuthority: {},
    equipmentRulesAuthorities: [],
  });

  const database = {
    prepare: (query: string) => new Statement(query),
    batch: async (rawStatements: D1PreparedStatement[]) => {
      const statements = rawStatements as unknown as Statement[];
      batches.push(statements);
      for (const statement of statements) {
        if (statement.query.includes("INSERT INTO deployments")) deploymentInserted = true;
        if (statement.query.includes("UPDATE campaigns SET status='ACTIVE',strategic_status='ACTIVE'")) {
          if (
            deploymentInserted && pinAvailable &&
            statement.bindings[0] === campaignId && statement.bindings[1] === mapRevisionId &&
            ["RECRUITING", "ACTIVE"].includes(authority.campaign_status)
          ) {
            authority.campaign_status = "ACTIVE";
          }
        }
        if (statement.query.includes("UPDATE deployment_plans SET status = 'COMMITTED'")) {
          planCommitted = statement.bindings[1] === plan.id && statement.bindings[2] === plan.revision;
        }
        if (statement.query.includes("INSERT INTO deployment_mutation_receipts") && planCommitted) {
          receipt = {
            operation: "COMMIT_DEPLOYMENT_PLAN",
            request_hash: String(statement.bindings[2]),
            response_json: String(statement.bindings[3]),
          };
        }
      }
      return statements.map(() => ({ success: true, results: [], meta: {} })) as unknown as D1Result[];
    },
  } as unknown as D1Database;
  const env = {
    DB: database,
    ENVIRONMENT: "development",
    CAMPAIGN: {
      getByName: () => ({
        fetch: async (request: Request) => {
          coordinatorCalls.push(request);
          expect(authority.campaign_status).toBe("ACTIVE");
          return new Response(JSON.stringify({ synced: true }), {
            headers: { "content-type": "application/json" },
          });
        },
      }),
    } as unknown as DurableObjectNamespace,
  } as Env;
  return { env, authority, batches, coordinatorCalls };
}

describe("custom campaign deployment activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("activates the exact custom campaign before synchronizing its first committed deployment", async () => {
    const test = harness();
    const response = await commitPlan(test.env, "player-1", "deployment-plan-custom-1", {
      commandId: "commit-custom-deployment-0001",
      expectedRevision: 1,
    });

    expect(test.authority.campaign_status).toBe("ACTIVE");
    expect(response).toMatchObject({
      campaignId: test.authority.campaign_id,
      status: "COMMITTED",
      reinforcementSync: { status: "APPLIED", synced: true },
    });
    expect(test.coordinatorCalls).toHaveLength(1);
    const commitStatements = test.batches[0]!.map((statement) => statement.query);
    expect(commitStatements.some((query) =>
      query.includes("UPDATE campaigns SET status='ACTIVE',strategic_status='ACTIVE'") &&
      query.includes("game_master_campaign_scenarios") &&
      query.includes("maps.status='PUBLISHED'") &&
      query.includes("EXISTS (SELECT 1 FROM deployments"))).toBe(true);
  });

  it("fails before mutating a custom campaign whose exact published pin is unavailable", async () => {
    const test = harness(false);
    const operation = commitPlan(test.env, "player-1", "deployment-plan-custom-1", {
      commandId: "commit-custom-deployment-invalid-pin",
      expectedRevision: 1,
    });

    await expect(operation).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_MAP_PIN_INVALID" });
    expect(test.authority.campaign_status).toBe("RECRUITING");
    expect(test.batches).toHaveLength(0);
    expect(test.coordinatorCalls).toHaveLength(0);
  });
});
