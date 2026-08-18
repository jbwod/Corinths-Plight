import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import {
  listLiveMapCampaigns,
  listStrategicPlanets,
  listStrategicShipPresence,
} from "./strategic";

class CapturingStatement {
  bindings: unknown[] = [];

  constructor(readonly database: CapturingDatabase, readonly query: string) {}

  bind(...bindings: unknown[]): this {
    this.bindings = bindings;
    return this;
  }

  async all<T>(): Promise<D1Result<T>> {
    this.database.executed.push(this);
    return { success: true, results: this.database.results as T[], meta: {} } as D1Result<T>;
  }
}

class CapturingDatabase {
  readonly executed: CapturingStatement[] = [];
  results: Record<string, unknown>[] = [];

  prepare(query: string): D1PreparedStatement {
    return new CapturingStatement(this, query) as unknown as D1PreparedStatement;
  }
}

describe("Galactic Operations strategic repositories", () => {
  it("projects only joined non-terminal campaigns on their authoritative map anchor", async () => {
    const database = new CapturingDatabase();
    database.results = [{
      campaign_id: "campaign-1",
      campaign_name: "Operation Test",
      campaign_status: "RECRUITING",
      strategic_status: "MUSTERING",
      planet_id: "planet-1",
      planet_name: "Corinth",
      planet_location_id: "location-planet-1",
      strategic_node_id: "node-objective-1",
      operation_id: "operation-1",
      member_count: 3,
      viewer_deployment_count: 1,
      viewer_side: "ALLIED",
      viewer_role: "PLAYER",
      viewer_battalion_id: "battalion-1",
    }];

    const rows = await listLiveMapCampaigns(
      database as unknown as Env["DB"],
      "user-1",
      "battalion-1",
      "map-1",
    );

    expect(rows).toHaveLength(1);
    expect(database.executed[0]?.bindings).toEqual(["user-1", "battalion-1", "map-1"]);
    expect(database.executed[0]?.query).toContain("campaigns.status IN ('RECRUITING','ACTIVE','PAUSED')");
    expect(database.executed[0]?.query).toContain("campaigns.strategic_status IN ('MUSTERING','ACTIVE')");
    expect(database.executed[0]?.query).toContain("memberships.user_id=?1");
    expect(database.executed[0]?.query).toContain("nodes.id=campaigns.strategic_node_id AND nodes.map_id=?3");
    expect(database.executed[0]?.query).not.toContain("nodes.node_type='CAMPAIGN'");
  });

  it("limits exact ship identity and class presence to the viewer's active Battalion", async () => {
    const database = new CapturingDatabase();
    await listStrategicShipPresence(
      database as unknown as Env["DB"],
      "user-1",
      "battalion-1",
      "map-1",
    );

    expect(database.executed[0]?.bindings).toEqual(["user-1", "battalion-1", "map-1"]);
    expect(database.executed[0]?.query).toContain("forces.battalion_id=?2");
    expect(database.executed[0]?.query).toContain("viewer.status='ACTIVE'");
    expect(database.executed[0]?.query).toContain("ship_class_definitions");
  });

  it("discovers map-root planets even before an explicit PLANET node is seeded", async () => {
    const database = new CapturingDatabase();
    database.results = [{
      planet_id: "planet-legacy",
      planet_name: "Legacy Corinth",
      location_id: "location-legacy-corinth",
      node_id: null,
      position_json: null,
      control_status: null,
      node_status: null,
      environment_json: "{}",
      war_state_json: '{"control":"CONTESTED"}',
    }];
    const rows = await listStrategicPlanets(database as unknown as Env["DB"], "map-1");

    expect(database.executed[0]?.bindings).toEqual(["map-1"]);
    expect(rows[0]?.node_id).toBeNull();
    expect(database.executed[0]?.query).toContain("WITH RECURSIVE map_locations");
    expect(database.executed[0]?.query).toContain("LEFT JOIN strategic_nodes AS nodes");
    expect(database.executed[0]?.query).toContain("nodes.node_type='PLANET'");
    expect(database.executed[0]?.query).toContain("nodes.location_id=planets.strategic_location_id");
  });
});
