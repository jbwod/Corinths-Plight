import { DurableObject } from "cloudflare:workers";
import type {
  CampaignDeployment,
  CampaignEvent,
  CampaignRuntimeState,
  ResolutionRecord,
  StructuredAction,
  UnitOrder,
  ViewerContext,
} from "../packages/domain/src";
import {
  createDemoCampaignState,
  canTarget,
  createScenarioCampaignState,
  getTacticalActionRule,
  getTacticalOrderRule,
  hexDistance,
  projectCampaignState,
  resolveRound,
  validateArtilleryFire,
  validateOrder,
} from "../packages/rules-engine/src";
import {
  CLOCK_PRESETS,
  isCurrentRoundOrderWindowOpen,
  makeRoundClock,
  nextScheduledTime,
  pauseClock,
  removeScheduledEvent,
  resumeClock,
} from "./campaign-clock";
import {
  CampaignRequestContractError,
  assertCampaignMutationBodyEmpty,
  campaignCommandHash,
  encodeCampaignStoredState,
  parseCampaignClockIntent,
  parseCampaignOrderIntent,
  parseCampaignStoredState,
  type CampaignActionIntent,
} from "./campaign-contracts";
import { viewerFromInternalRequest } from "./auth";
import { generateEnemyOrders } from "./enemy-ai";
import { configuredCampaignStrategicConsequences } from "./campaign-strategic-effects";
import { campaignRealtimeProjection, parseCampaignRealtimeCursor } from "./campaign-realtime";
import type { Env } from "./env";
import { errorResponse, json, readJson } from "./http";
import { validateIncidentalActions } from "./order-validation";
import { LEGACY_RULESET_ID, resolveUnitExecutionAdapter } from "./services/rules-hydration";

const STATE_KEY = "state/current";
const FOUNDATION_CAMPAIGN_ID = "outpost-k17";
const MAX_ROUTE_LENGTH = 128;
const EFFECT_RETRY_DELAY_MS = 5_000;
const allowedActionTypes = new Set([
  "ATTACK",
  "ASSAULT",
  "DIG_IN",
  "BREAK_OUT",
  "DEPLOY",
  "PACK_UP",
  "REPAIR",
  "CONSTRUCT",
  "GARRISON",
  "LOAD",
  "UNLOAD",
  "RESUPPLY",
  "RELOAD",
  "SCAN",
  "DEPLOY_DRONE",
  "HEAL",
  "ORBITAL_DROP",
  "BOMBARDMENT",
  "AIR_SUPPORT",
]);

interface WebSocketAttachment {
  userId: string;
  side: string;
  role: string;
}

type CampaignCommandOperation = "ORDER_UPSERT" | "CLOCK_UPDATE";

interface CampaignCommandReceipt<TResponse extends object> {
  schemaVersion: 1;
  operation: CampaignCommandOperation;
  actorUserId: string;
  commandId: string;
  requestHash: string;
  status: 200 | 201;
  response: TResponse;
  createdAt: number;
}

interface OrderCommandResponse {
  order: UnitOrder;
  campaignVersion: number;
}

interface ClockCommandResponse {
  clock: CampaignRuntimeState["clock"];
  preset: string;
  campaignVersion: number;
}

function commandReceipt<TResponse extends object>(
  value: unknown,
  operation: CampaignCommandOperation,
): CampaignCommandReceipt<TResponse> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CAMPAIGN_COMMAND_RECEIPT_INVALID");
  const receipt = value as Partial<CampaignCommandReceipt<TResponse>>;
  if (
    receipt.schemaVersion !== 1 ||
    receipt.operation !== operation ||
    typeof receipt.actorUserId !== "string" ||
    typeof receipt.commandId !== "string" ||
    !/^[a-f0-9]{64}$/.test(receipt.requestHash ?? "") ||
    (receipt.status !== 200 && receipt.status !== 201) ||
    !receipt.response ||
    typeof receipt.response !== "object" ||
    !Number.isSafeInteger(receipt.createdAt)
  ) {
    throw new Error("CAMPAIGN_COMMAND_RECEIPT_INVALID");
  }
  return receipt as CampaignCommandReceipt<TResponse>;
}

function eventSequence(state: CampaignRuntimeState, round = state.round): number {
  return (
    Math.max(
      0,
      ...state.events.filter((event) => event.round === round).map((event) => event.sequence),
    ) + 1
  );
}

export class CampaignDurableObject extends DurableObject<Env> {
  private campaignId(): string {
    return this.ctx.id.name ?? this.ctx.id.toString();
  }

  private configuredDuration(): number {
    const parsed = Number(this.env.DEFAULT_ROUND_DURATION_MS);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : CLOCK_PRESETS["5m"];
  }

  private configuredLockLead(): number {
    const parsed = Number(this.env.ORDER_LOCK_LEAD_MS);
    return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : 30_000;
  }

  private assertAlliedExecutionSupport(state: CampaignRuntimeState): void {
    for (const deployment of state.deployments) {
      if (deployment.side !== "ALLIED") continue;
      const execution = resolveUnitExecutionAdapter(
        LEGACY_RULESET_ID,
        deployment.definitionId,
        this.env.ENVIRONMENT,
      );
      if (!execution.ok) {
        throw new Error(
          `CAMPAIGN_UNIT_DEFINITION_NOT_EXECUTABLE:${deployment.definitionId}:${execution.code}`,
        );
      }
    }
  }

  private async getState(): Promise<CampaignRuntimeState> {
    const stored = await this.ctx.storage.get<unknown>(STATE_KEY);
    if (stored !== undefined) {
      const parsed = parseCampaignStoredState(stored, this.campaignId());
      this.assertAlliedExecutionSupport(parsed.state);
      if (parsed.legacy) await this.ctx.storage.put(STATE_KEY, encodeCampaignStoredState(parsed.state));
      return parsed.state;
    }
    const created = this.campaignId() === FOUNDATION_CAMPAIGN_ID && this.env.ENVIRONMENT === "development"
      ? createDemoCampaignState(Date.now(), this.configuredDuration(), this.campaignId())
      : await this.createPersistentCampaignState();
    created.clock = makeRoundClock(
      created.campaignId,
      created.round,
      created.clock.roundStartedAt,
      this.configuredDuration(),
      this.configuredLockLead(),
    );
    this.assertAlliedExecutionSupport(created);
    await this.ctx.storage.put(STATE_KEY, encodeCampaignStoredState(created));
    await this.scheduleNextAlarm(created);
    return created;
  }

  private storedState(value: unknown, fallback: CampaignRuntimeState): CampaignRuntimeState {
    return value === undefined ? fallback : parseCampaignStoredState(value, this.campaignId()).state;
  }

  private orderReceiptKey(userId: string, commandId: string): string {
    return `command/order/${encodeURIComponent(userId)}/${encodeURIComponent(commandId)}`;
  }

  private clockReceiptKey(userId: string, commandId: string): string {
    return `command/clock/${encodeURIComponent(userId)}/${encodeURIComponent(commandId)}`;
  }

  private async createPersistentCampaignState(): Promise<CampaignRuntimeState> {
    const campaign = await this.env.DB.prepare(`SELECT campaigns.id, campaigns.status,
        campaigns.name, campaigns.map_source_key, campaigns.round_duration_ms,
        planets.name AS planet_name
      FROM campaigns
      JOIN planets ON planets.id = campaigns.planet_id
      WHERE campaigns.id = ?1 AND campaigns.status IN ('ACTIVE','DRAFT','RECRUITING') LIMIT 1`)
      .bind(this.campaignId()).first<{
        id: string; status: string; name: string; map_source_key: string;
        round_duration_ms: number; planet_name: string;
      }>();
    if (!campaign) throw new Error("CAMPAIGN_NOT_INITIALISED");
    const rows = await this.env.DB.prepare(`SELECT deployments.id, deployments.owner_id,
        deployments.side, deployments.status, deployments.snapshot_json,
        units.id AS persistent_unit_id, units.ruleset_id, units.definition_id, units.callsign
      FROM deployments JOIN player_units AS units ON units.id = deployments.player_unit_id
      WHERE deployments.campaign_id = ?1 AND deployments.status IN ('READY','ACTIVE','IMMOBILISED')
      ORDER BY deployments.id`).bind(campaign.id).all<{
        id: string; owner_id: string; side: CampaignDeployment["side"];
        status: CampaignDeployment["status"]; snapshot_json: string;
        persistent_unit_id: string; ruleset_id: string; definition_id: string; callsign: string;
      }>();
    if (rows.results.length === 0) throw new Error("CAMPAIGN_NOT_INITIALISED");
    const alliedDeployments = rows.results.map((row): CampaignDeployment => {
      const snapshot = JSON.parse(row.snapshot_json) as Record<string, unknown>;
      const execution = resolveUnitExecutionAdapter(row.ruleset_id, row.definition_id, this.env.ENVIRONMENT);
      if (!execution.ok) throw new Error(`CAMPAIGN_UNIT_DEFINITION_NOT_EXECUTABLE:${row.definition_id}:${execution.code}`);
      const position = snapshot.position as { q?: unknown; r?: unknown } | undefined;
      const stats = snapshot.stats as CampaignDeployment["stats"] | undefined;
      const snapshotActions = Array.isArray(snapshot.allowedActions)
        ? snapshot.allowedActions.filter((action): action is string => typeof action === "string")
        : execution.allowedActionTypes;
      const snapshotOrders = Array.isArray(snapshot.allowedOrders)
        ? snapshot.allowedOrders.filter((order): order is string => typeof order === "string")
        : execution.allowedOrderTypes;
      return {
        id: row.id,
        campaignId: campaign.id,
        persistentUnitId: row.persistent_unit_id,
        ownerId: row.owner_id,
        side: row.side,
        definitionId: row.definition_id,
        callsign: row.callsign,
        tags: Array.isArray(snapshot.tags)
          ? snapshot.tags.filter((tag): tag is string => typeof tag === "string")
          : [...execution.legacyDefinition.tags],
        status: row.status,
        position: position && Number.isInteger(position.q) && Number.isInteger(position.r)
          ? { q: position.q as number, r: position.r as number }
          : { q: -4, r: 1 },
        facing: 2,
        stats: stats ?? execution.legacyDefinition.stats,
        currentHealth: typeof snapshot.currentHealth === "number"
          ? snapshot.currentHealth
          : stats?.maxHealth ?? execution.legacyDefinition.stats.maxHealth,
        weapons: Array.isArray(snapshot.weapons) ? snapshot.weapons as CampaignDeployment["weapons"] : [],
        ammunition: snapshot.ammunition && typeof snapshot.ammunition === "object" ? snapshot.ammunition as Record<string, number> : {},
        cooldowns: snapshot.cooldowns && typeof snapshot.cooldowns === "object" ? snapshot.cooldowns as Record<string, number> : {},
        statuses: Array.isArray(snapshot.statuses)
          ? snapshot.statuses.filter((status): status is string => typeof status === "string")
          : row.definition_id === "unit-artillery" ? ["PACKED"] : [],
        artilleryDeployment: snapshot.artilleryDeployment === "DEPLOYED" || snapshot.artilleryDeployment === "PACKED"
          ? snapshot.artilleryDeployment
          : row.definition_id === "unit-artillery" ? "PACKED" : undefined,
        bombardmentSuppression: snapshot.bombardmentSuppression && typeof snapshot.bombardmentSuppression === "object"
          ? snapshot.bombardmentSuppression as CampaignDeployment["bombardmentSuppression"]
          : undefined,
        equipmentIds: Array.isArray(snapshot.equipmentInstanceIds) ? snapshot.equipmentInstanceIds.filter((id): id is string => typeof id === "string") : [],
        allowedActions: snapshotActions.filter((action) => execution.allowedActionTypes.includes(action)) as CampaignDeployment["allowedActions"],
        allowedOrders: snapshotOrders.filter((order) => execution.allowedOrderTypes.includes(order)) as CampaignDeployment["allowedOrders"],
        abilities: Array.isArray(snapshot.abilities) ? snapshot.abilities as CampaignDeployment["abilities"] : [],
        subsystems: Array.isArray(snapshot.subsystems)
          ? snapshot.subsystems as CampaignDeployment["subsystems"]
          : [],
        supplies: snapshot.supplies && typeof snapshot.supplies === "object"
          ? snapshot.supplies as CampaignDeployment["supplies"]
          : {},
        cargo: [],
        cargoProfile: snapshot.cargoProfile && typeof snapshot.cargoProfile === "object"
          ? snapshot.cargoProfile as CampaignDeployment["cargoProfile"]
          : undefined,
        locationState: typeof snapshot.carrierUnitId === "string" ? "EMBARKED" : "ON_MAP",
      };
    });
    for (const row of rows.results) {
      const snapshot = JSON.parse(row.snapshot_json) as Record<string, unknown>;
      if (typeof snapshot.carrierUnitId !== "string") continue;
      const carrier = alliedDeployments.find((deployment) => deployment.persistentUnitId === snapshot.carrierUnitId);
      const cargo = alliedDeployments.find((deployment) => deployment.persistentUnitId === row.persistent_unit_id);
      if (!carrier || !cargo) continue;
      cargo.position = { ...carrier.position };
      carrier.cargo = [...(carrier.cargo ?? []), {
        id: `campaign-cargo:${campaign.id}:${cargo.id}`,
        kind: cargo.stats.healthModel === "FORCE_STRENGTH" ? "PERSONNEL" : "VEHICLE",
        quantity: 1,
        tags: cargo.stats.healthModel === "FORCE_STRENGTH" ? ["INFANTRY"] : ["VEHICLE"],
        transportMode: "EMBARKED",
        unitId: cargo.id,
      }];
    }
    return createScenarioCampaignState({
      mapSourceKey: campaign.map_source_key,
      campaignId: campaign.id,
      campaignName: campaign.name,
      planetName: campaign.planet_name,
      now: Date.now(),
      durationMs: campaign.round_duration_ms,
      round: 1,
      alliedDeployments,
    });
  }

  private async scheduleNextAlarm(state: CampaignRuntimeState): Promise<void> {
    if (state.phase === "EFFECTS_PENDING") {
      const retryAt = Date.now() + EFFECT_RETRY_DELAY_MS;
      const current = await this.ctx.storage.getAlarm();
      if (current === null || current < Date.now() || current > retryAt) await this.ctx.storage.setAlarm(retryAt);
      return;
    }
    const next = nextScheduledTime(state);
    if (next === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current !== next) await this.ctx.storage.setAlarm(next);
  }

  private effectRound(effect: { payload: Record<string, unknown> }): number | undefined {
    const round = Number(effect.payload.round);
    return Number.isInteger(round) && round > 0 ? round : undefined;
  }

  private async applyPendingPersistentEffects(targetRound: number): Promise<number> {
    const pending = await this.ctx.storage.list<{
      idempotencyKey: string;
      type: string;
      unitId?: string;
      payload: Record<string, unknown>;
    }>({ prefix: "pending-effect/" });
    let appliedCount = 0;
    const orderedPending = [...pending.entries()].sort(([leftKey, left], [rightKey, right]) => {
      if (left.type === "CAMPAIGN_RESULT" && right.type !== "CAMPAIGN_RESULT") return 1;
      if (right.type === "CAMPAIGN_RESULT" && left.type !== "CAMPAIGN_RESULT") return -1;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    for (const [storageKey, effect] of orderedPending) {
      if (this.effectRound(effect) !== targetRound) continue;
      const prior = await this.env.DB.prepare(`SELECT 1 FROM campaign_effect_receipts
        WHERE idempotency_key = ?1 LIMIT 1`).bind(effect.idempotencyKey).first();
      if (prior) {
        await this.ctx.storage.delete(storageKey);
        appliedCount += 1;
        continue;
      }
      const campaignId = typeof effect.payload.campaignId === "string" ? effect.payload.campaignId : this.campaignId();
      const round = Number(effect.payload.round);
      if (!Number.isInteger(round) || round < 1) throw new Error("PERSISTENT_EFFECT_INVALID");
      if (effect.type === "CAMPAIGN_RESULT") {
        const scenarioId = effect.payload.scenarioId;
        const scenarioVersion = Number(effect.payload.scenarioVersion);
        const resolutionKey = effect.payload.resolutionKey;
        const result = effect.payload.result;
        const reason = effect.payload.reason;
        const objectives = effect.payload.objectives;
        const rewards = effect.payload.rewards;
        if (
          typeof scenarioId !== "string" || scenarioId.length === 0 ||
          !Number.isInteger(scenarioVersion) || scenarioVersion < 1 ||
          typeof resolutionKey !== "string" || resolutionKey.length === 0 ||
          (result !== "VICTORY" && result !== "DEFEAT") ||
          typeof reason !== "string" || !Array.isArray(objectives) ||
          !rewards || typeof rewards !== "object" || Array.isArray(rewards)
        ) {
          throw new Error("CAMPAIGN_RESULT_EFFECT_INVALID");
        }
        const campaignStatus = result === "VICTORY" ? "COMPLETE" : "FAILED";
        const strategicStatus = result === "VICTORY" ? "RESOLVED" : "FAILED";
        const linkedOperation = await this.env.DB.prepare(`SELECT operations.id,operations.map_id,operations.node_id,
            operations.effect_rules_json,maps.current_round,
            (SELECT memberships.battalion_id FROM campaign_memberships AS memberships
              WHERE memberships.campaign_id=?1 AND memberships.side='ALLIED'
                AND memberships.battalion_id IS NOT NULL
              ORDER BY memberships.joined_at,memberships.user_id LIMIT 1) AS battalion_id
          FROM strategic_operations AS operations
          JOIN strategic_maps AS maps ON maps.id=operations.map_id
          WHERE operations.campaign_id=?1 LIMIT 1`)
          .bind(campaignId).first<{
            id: string;
            map_id: string;
            effect_rules_json: string;
            current_round: number;
            battalion_id: string | null;
            node_id: string;
          }>();
        const consequences = linkedOperation
          ? configuredCampaignStrategicConsequences(
              linkedOperation.effect_rules_json,
              result,
              objectives,
            )
          : [];
        for (const consequence of consequences) {
          const targetId = consequence.type === "STRATEGIC_NODE_CAPTURED"
            ? consequence.nodeId
            : consequence.type === "ROUTE_UNLOCKED"
              ? consequence.routeId
              : consequence.operationId;
          const table = consequence.type === "STRATEGIC_NODE_CAPTURED"
            ? "strategic_nodes"
            : consequence.type === "ROUTE_UNLOCKED"
              ? "strategic_routes"
              : "strategic_operations";
          const campaignRequirement = consequence.type === "OPERATION_ACTIVATED" ? " AND campaign_id IS NOT NULL" : "";
          const exists = await this.env.DB.prepare(`SELECT 1 FROM ${table} WHERE id=?1 AND map_id=?2${campaignRequirement} LIMIT 1`)
            .bind(targetId, linkedOperation!.map_id).first();
          if (!exists) throw new Error(`CAMPAIGN_STRATEGIC_EFFECT_TARGET_MISSING:${targetId}`);
        }
        const strategicStatements: D1PreparedStatement[] = [];
        for (const [index, consequence] of consequences.entries()) {
          const targetId = consequence.type === "STRATEGIC_NODE_CAPTURED"
            ? consequence.nodeId
            : consequence.type === "ROUTE_UNLOCKED"
              ? consequence.routeId
              : consequence.operationId;
          const targetType = consequence.type === "STRATEGIC_NODE_CAPTURED"
            ? "STRATEGIC_NODE"
            : consequence.type === "ROUTE_UNLOCKED"
              ? "STRATEGIC_ROUTE"
              : "STRATEGIC_OPERATION";
          const strategicEffectKey = `${effect.idempotencyKey}:strategic:${index}`;
          const strategicPayload = { campaignId, round, result, operationId: linkedOperation!.id, consequence };
          const payloadHash = await campaignCommandHash(strategicPayload);
          const summary = consequence.type === "STRATEGIC_NODE_CAPTURED"
            ? `${campaignId} secured ${consequence.nodeId}; control is now ${consequence.control}.`
            : consequence.type === "ROUTE_UNLOCKED"
              ? `${campaignId} unlocked strategic route ${consequence.routeId}.`
              : `${campaignId} opened ${consequence.operationId} for Battalion deployment.`;
          if (consequence.type === "STRATEGIC_NODE_CAPTURED") {
            strategicStatements.push(this.env.DB.prepare(`UPDATE strategic_nodes SET control_status=?1,
              revision=revision+CASE WHEN control_status<>?1 THEN 1 ELSE 0 END,
              updated_at=CASE WHEN control_status<>?1 THEN unixepoch() ELSE updated_at END
              WHERE id=?2 AND map_id=?3`)
              .bind(consequence.control, consequence.nodeId, linkedOperation!.map_id));
          } else if (consequence.type === "ROUTE_UNLOCKED") {
            strategicStatements.push(this.env.DB.prepare(`UPDATE strategic_routes SET status='OPEN',
              revision=revision+CASE WHEN status<>'OPEN' THEN 1 ELSE 0 END,
              updated_at=CASE WHEN status<>'OPEN' THEN unixepoch() ELSE updated_at END
              WHERE id=?1 AND map_id=?2`)
              .bind(consequence.routeId, linkedOperation!.map_id));
          } else {
            strategicStatements.push(
              this.env.DB.prepare(`UPDATE strategic_operations SET status='MUSTERING',
                revision=revision+CASE WHEN status='ANNOUNCED' THEN 1 ELSE 0 END,
                updated_at=CASE WHEN status='ANNOUNCED' THEN unixepoch() ELSE updated_at END
                WHERE id=?1 AND map_id=?2 AND status IN ('ANNOUNCED','MUSTERING')`)
                .bind(consequence.operationId, linkedOperation!.map_id),
              this.env.DB.prepare(`UPDATE campaigns SET status='RECRUITING',strategic_status='MUSTERING',
                strategic_revision=strategic_revision+CASE WHEN status='DRAFT' OR strategic_status='ANNOUNCED' THEN 1 ELSE 0 END
                WHERE id=(SELECT campaign_id FROM strategic_operations WHERE id=?1 AND map_id=?2)
                  AND status IN ('DRAFT','RECRUITING')`)
                .bind(consequence.operationId, linkedOperation!.map_id),
            );
          }
          strategicStatements.push(
            this.env.DB.prepare(`INSERT INTO strategic_effect_receipts (
              idempotency_key,map_id,source_kind,source_id,source_version,effect_type,
              target_type,target_id,payload_hash,payload_json,status,attempt_count,result_json,applied_at
            ) VALUES (?1,?2,'CAMPAIGN_RESULT',?3,?4,?5,?6,?7,?8,?9,'APPLIED',1,?10,unixepoch())`)
              .bind(strategicEffectKey, linkedOperation!.map_id, campaignId, round,
                consequence.type, targetType, targetId, payloadHash,
                JSON.stringify(strategicPayload), JSON.stringify({ applied: true })),
            this.env.DB.prepare(`INSERT INTO strategic_events (
              event_id,map_id,round_number,sequence,event_type,battalion_id,actor_user_id,
              audience,subject_type,subject_id,summary,payload_json,event_hash,idempotency_key
            ) VALUES (?1,?2,?3,
              COALESCE((SELECT MAX(sequence)+1 FROM strategic_events WHERE map_id=?2 AND round_number=?3),0),
              ?4,?5,NULL,'BATTALION',?6,?7,?8,?9,?10,?11)`)
              .bind(`${strategicEffectKey}:event`, linkedOperation!.map_id, linkedOperation!.current_round,
                consequence.type === "STRATEGIC_NODE_CAPTURED"
                  ? "STRATEGIC_NODE_CONTROL_CHANGED"
                  : consequence.type === "ROUTE_UNLOCKED"
                    ? "STRATEGIC_ROUTE_STATUS_CHANGED"
                    : "STRATEGIC_OPERATION_STATUS_CHANGED",
                linkedOperation!.battalion_id, targetType, targetId, summary,
                JSON.stringify(strategicPayload), payloadHash, `${strategicEffectKey}:event`),
          );
        }
        if (consequences.length > 0) {
          strategicStatements.push(this.env.DB.prepare(`UPDATE strategic_maps SET revision=revision+1,
            updated_at=unixepoch() WHERE id=?1`).bind(linkedOperation!.map_id));
        }
        const recoveryStatements: D1PreparedStatement[] = [
          this.env.DB.prepare(`UPDATE deployments SET status='DESTROYED',withdrawn_at=COALESCE(withdrawn_at,unixepoch())
            WHERE campaign_id=?1 AND status IN ('READY','ACTIVE','IMMOBILISED')
              AND EXISTS (SELECT 1 FROM player_units AS units
                WHERE units.id=deployments.player_unit_id AND units.status='DESTROYED')`).bind(campaignId),
          this.env.DB.prepare(`UPDATE deployments SET status='WITHDRAWN',withdrawn_at=COALESCE(withdrawn_at,unixepoch())
            WHERE campaign_id=?1 AND status IN ('READY','ACTIVE','IMMOBILISED')
              AND EXISTS (SELECT 1 FROM player_units AS units
                WHERE units.id=deployments.player_unit_id AND units.status<>'DESTROYED')`).bind(campaignId),
          this.env.DB.prepare(`UPDATE player_units SET
              status=CASE WHEN current_health < COALESCE((SELECT definitions.max_health
                FROM unit_class_definitions AS definitions
                WHERE definitions.id=player_units.definition_id AND definitions.ruleset_id=player_units.ruleset_id),current_health)
                THEN 'DAMAGED' ELSE 'ACTIVE' END,
              location_kind='RESERVE',location_state='RESERVE',location_id=?2,
              version=version+1,updated_at=unixepoch()
            WHERE status<>'DESTROYED' AND EXISTS (SELECT 1 FROM deployments
              WHERE deployments.campaign_id=?1 AND deployments.player_unit_id=player_units.id)`)
            .bind(campaignId, linkedOperation?.node_id ?? null),
          this.env.DB.prepare(`UPDATE player_unit_loadouts SET locked_at=NULL,revision=revision+1,updated_at=unixepoch()
            WHERE locked_at IS NOT NULL AND EXISTS (SELECT 1 FROM campaign_loadout_snapshots AS snapshots
              WHERE snapshots.campaign_id=?1 AND snapshots.player_unit_id=player_unit_loadouts.player_unit_id)`)
            .bind(campaignId),
        ];
        if (linkedOperation) {
          recoveryStatements.push(
            this.env.DB.prepare(`UPDATE task_force_battlegroups SET status='CANCELLED',
                revision=revision+1,updated_at=unixepoch()
              WHERE status='EMBARKING' AND battlegroup_id IN (
                SELECT DISTINCT links.battlegroup_id FROM battlegroup_units AS links
                JOIN deployments ON deployments.player_unit_id=links.player_unit_id
                WHERE deployments.campaign_id=?1)`)
              .bind(campaignId),
            this.env.DB.prepare(`UPDATE task_force_battlegroups SET status='DISEMBARKED',
                disembarked_at=COALESCE(disembarked_at,unixepoch()),revision=revision+1,updated_at=unixepoch()
              WHERE status IN ('EMBARKED','DISEMBARKING') AND embarked_at IS NOT NULL
                AND battlegroup_id IN (
                SELECT DISTINCT links.battlegroup_id FROM battlegroup_units AS links
                JOIN deployments ON deployments.player_unit_id=links.player_unit_id
                WHERE deployments.campaign_id=?1)`)
              .bind(campaignId),
            this.env.DB.prepare(`UPDATE battlegroups SET status='RECOVERING',current_node_id=?2,
                current_operation_id=NULL,current_carrier_task_force_id=NULL,
                revision=revision+1,updated_at=unixepoch()
              WHERE EXISTS (SELECT 1 FROM battlegroup_units AS links
                JOIN deployments ON deployments.player_unit_id=links.player_unit_id
                WHERE links.battlegroup_id=battlegroups.id AND deployments.campaign_id=?1)`)
              .bind(campaignId, linkedOperation.node_id),
          );
        }
        await this.env.DB.batch([
          this.env.DB.prepare(`INSERT INTO campaign_results (
            campaign_id,round_number,scenario_id,scenario_version,result,reason,
            objectives_json,rewards_json,resolution_key,effect_idempotency_key
          ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
            .bind(campaignId, round, scenarioId, scenarioVersion, result, reason,
              JSON.stringify(objectives), JSON.stringify(rewards), resolutionKey, effect.idempotencyKey),
          this.env.DB.prepare(`UPDATE campaigns SET status=?1,strategic_status=?2,
            completed_at=COALESCE(completed_at,unixepoch()),strategic_revision=strategic_revision+1
            WHERE id=?3`).bind(campaignStatus, strategicStatus, campaignId),
          this.env.DB.prepare(`UPDATE strategic_operations SET status=?1,outcome_json=?2,
            ends_at=COALESCE(ends_at,unixepoch()),revision=revision+1,updated_at=unixepoch()
            WHERE campaign_id=?3 AND status NOT IN ('RESOLVED','FAILED')`)
            .bind(strategicStatus, JSON.stringify(effect.payload), campaignId),
          this.env.DB.prepare(`INSERT INTO campaign_effect_receipts (
            idempotency_key,campaign_id,round_number,effect_type,player_unit_id,payload_json
          ) VALUES (?1,?2,?3,?4,NULL,?5)`)
            .bind(effect.idempotencyKey, campaignId, round, effect.type, JSON.stringify(effect.payload)),
          ...recoveryStatements,
          ...strategicStatements,
        ]);
        const applied = await this.env.DB.prepare(`SELECT 1 FROM campaign_results
          WHERE campaign_id=?1 AND effect_idempotency_key=?2 LIMIT 1`)
          .bind(campaignId, effect.idempotencyKey).first();
        if (!applied) throw new Error("CAMPAIGN_RESULT_NOT_APPLIED");
        await this.ctx.storage.delete(storageKey);
        appliedCount += 1;
        continue;
      }
      if (!effect.unitId) throw new Error("PERSISTENT_EFFECT_INVALID");
      const statements: D1PreparedStatement[] = [];
      if (effect.type === "UNIT_DESTROYED") {
        statements.push(this.env.DB.prepare(`UPDATE player_units SET status = 'DESTROYED',
          location_kind = 'DESTROYED', location_state = 'DESTROYED', location_id = NULL,
          current_health = 0, destroyed_at = unixepoch(), destroyed_campaign_id = ?1,
          destroyed_round = ?2, version = version + 1, updated_at = unixepoch()
          WHERE id = ?3 AND status <> 'DESTROYED'`).bind(campaignId, round, effect.unitId));
        statements.push(this.env.DB.prepare(`UPDATE deployments SET status='DESTROYED',
          withdrawn_at=COALESCE(withdrawn_at,unixepoch())
          WHERE campaign_id=?1 AND player_unit_id=?2 AND status<>'DESTROYED'`)
          .bind(campaignId, effect.unitId));
      } else if (effect.type === "UNIT_DAMAGED") {
        const health = Number(effect.payload.currentHealth);
        statements.push(this.env.DB.prepare(`UPDATE player_units SET current_health = ?1,
          status = CASE WHEN ?1 <= 0 THEN 'DESTROYED' ELSE 'DAMAGED' END,
          version = version + 1, updated_at = unixepoch() WHERE id = ?2`)
          .bind(health, effect.unitId));
      } else if (effect.type === "UNIT_STATE_UPDATED") {
        const currentHealth = Number(effect.payload.currentHealth);
        const ammunition = effect.payload.ammunition && typeof effect.payload.ammunition === "object"
          ? effect.payload.ammunition as Record<string, number> : {};
        const cooldowns = effect.payload.cooldowns && typeof effect.payload.cooldowns === "object"
          ? effect.payload.cooldowns as Record<string, number> : {};
        const supplies = effect.payload.supplies && typeof effect.payload.supplies === "object"
          ? effect.payload.supplies as Record<string, number> : {};
        const locationState = typeof effect.payload.locationState === "string" ? effect.payload.locationState : "ON_MAP";
        statements.push(this.env.DB.prepare(`UPDATE player_units SET ammunition_json = ?1,
          location_state = ?2,
          current_health = CASE WHEN status = 'DESTROYED' OR ?3 < 0 THEN current_health ELSE ?3 END,
          version = version + 1, updated_at = unixepoch() WHERE id = ?4`)
          .bind(JSON.stringify(ammunition), locationState,
            Number.isFinite(currentHealth) ? currentHealth : -1, effect.unitId));
        for (const [weaponId, amount] of Object.entries(ammunition)) {
          statements.push(this.env.DB.prepare(`UPDATE player_unit_weapon_mounts SET current_ammo = ?1,
            cooldown_remaining = ?2, updated_at = unixepoch()
            WHERE player_unit_id = ?3 AND weapon_definition_id = ?4`)
            .bind(amount, cooldowns[weaponId] ?? 0, effect.unitId, weaponId));
        }
        for (const [resourceType, amount] of Object.entries(supplies)) {
          statements.push(this.env.DB.prepare(`UPDATE player_unit_supplies SET
            current_quantity = MIN(maximum_quantity, ?1), revision = revision + 1,
            updated_at = unixepoch() WHERE player_unit_id = ?2 AND resource_type = ?3`)
            .bind(amount, effect.unitId, resourceType));
        }
        const subsystems = Array.isArray(effect.payload.subsystems)
          ? effect.payload.subsystems as Array<Record<string, unknown>>
          : [];
        for (const subsystem of subsystems) {
          if (
            typeof subsystem.subsystemId !== "string" ||
            !["OPERATIONAL", "DAMAGED", "DISABLED"].includes(String(subsystem.state))
          ) continue;
          statements.push(this.env.DB.prepare(`UPDATE player_unit_subsystems SET
            state=?1,damaged_campaign_id=CASE WHEN ?1='OPERATIONAL' THEN NULL ELSE ?2 END,
            damaged_round=CASE WHEN ?1='OPERATIONAL' THEN NULL ELSE ?3 END,
            repaired_at=CASE WHEN ?1='OPERATIONAL' THEN unixepoch() ELSE repaired_at END,
            revision=revision+1,updated_at=unixepoch()
            WHERE player_unit_id=?4 AND subsystem_type=?5 AND state<>?1`)
            .bind(subsystem.state, campaignId, round, effect.unitId, subsystem.subsystemId));
        }
        const cargo = Array.isArray(effect.payload.cargo) ? effect.payload.cargo as Array<Record<string, unknown>> : [];
        statements.push(this.env.DB.prepare(`DELETE FROM unit_cargo_items
          WHERE carrier_unit_id = ?1 AND state = 'LOADED'`).bind(effect.unitId));
        for (const item of cargo) {
          if (typeof item.id !== "string" || typeof item.kind !== "string" || typeof item.quantity !== "number") continue;
          statements.push(this.env.DB.prepare(`INSERT INTO unit_cargo_items (
            id,carrier_unit_id,item_kind,carried_unit_id,reference_id,resource_type,
            quantity,transport_mode,cargo_slots_quarters,state,state_json
          ) SELECT ?1,?2,?3,?4,NULL,?5,?6,?7,?8,'LOADED','{}'
            WHERE EXISTS (SELECT 1 FROM unit_cargo_manifests WHERE carrier_unit_id = ?2)`)
            .bind(item.id, effect.unitId, item.kind === "SUPPLY" ? "SUPPLY" : "UNIT",
              typeof item.unitId === "string" ? item.unitId : null,
              typeof item.supplyType === "string" ? item.supplyType : null,
              item.quantity, typeof item.transportMode === "string" ? item.transportMode : "EMBARKED",
              typeof item.slotsQuarters === "number" ? item.slotsQuarters : 1));
        }
      } else if (effect.type === "CAMPAIGN_HISTORY") {
        const campaignCompleted = effect.payload.campaignCompleted === true ? 1 : 0;
        statements.push(
          this.env.DB.prepare(`INSERT INTO unit_service_summaries (
            player_unit_id,campaigns_completed,rounds_served,last_campaign_id,last_round,revision,updated_at
          ) SELECT id,?1,1,?2,?3,1,unixepoch() FROM player_units WHERE id = ?4
          ON CONFLICT(player_unit_id) DO UPDATE SET
            campaigns_completed = campaigns_completed + excluded.campaigns_completed,
            rounds_served = rounds_served + 1,
            last_campaign_id = excluded.last_campaign_id,
            last_round = excluded.last_round,
            revision = revision + 1,
            updated_at = unixepoch()`).bind(campaignCompleted, campaignId, round, effect.unitId),
          this.env.DB.prepare(`UPDATE player_units SET
            service_campaigns = service_campaigns + ?1,
            service_rounds = service_rounds + 1,
            version = version + 1,
            updated_at = unixepoch()
            WHERE id = ?2`).bind(campaignCompleted, effect.unitId),
        );
      }
      const historySummary = effect.type === "CAMPAIGN_HISTORY"
        ? effect.payload.campaignCompleted === true
          ? `${String(effect.payload.campaignName ?? "Campaign")} completed: ${String(effect.payload.result ?? "COMPLETE")}.`
          : `${String(effect.payload.campaignName ?? "Campaign")} round ${round} served.`
        : `Campaign round ${round} persistent state applied.`;
      statements.push(
        this.env.DB.prepare(`INSERT INTO unit_history (
          id,player_unit_id,event_type,campaign_id,round_number,payload_json,
          occurred_at,idempotency_key,summary,visibility
        ) SELECT ?1,id,?2,?3,?4,?5,unixepoch(),?1,?6,'OWNER'
          FROM player_units WHERE id = ?7`)
          .bind(`effect:${effect.idempotencyKey}`, effect.type, campaignId, round,
            JSON.stringify(effect.payload), historySummary, effect.unitId),
        this.env.DB.prepare(`INSERT INTO campaign_effect_receipts (
          idempotency_key,campaign_id,round_number,effect_type,player_unit_id,payload_json
        ) SELECT ?1,?2,?3,?4,?5,?6 FROM player_units WHERE id = ?5`)
          .bind(effect.idempotencyKey, campaignId, round, effect.type, effect.unitId, JSON.stringify(effect.payload)),
      );
      await this.env.DB.batch(statements);
      const applied = await this.env.DB.prepare(`SELECT 1 FROM campaign_effect_receipts
        WHERE idempotency_key = ?1 LIMIT 1`).bind(effect.idempotencyKey).first();
      if (!applied) throw new Error("PERSISTENT_EFFECT_NOT_APPLIED");
      await this.ctx.storage.delete(storageKey);
      appliedCount += 1;
    }
    return appliedCount;
  }

  private viewer(request: Request): ViewerContext {
    return viewerFromInternalRequest(request);
  }

  private isOperator(viewer: ViewerContext): boolean {
    return viewer.role === "ADMIN" || this.env.ENVIRONMENT !== "production";
  }

  private log(operation: string, data: Record<string, unknown> = {}): void {
    console.log(
      JSON.stringify({
        level: "info",
        operation,
        campaignId: this.campaignId(),
        ...data,
      }),
    );
  }

  private broadcast(type: string, state: CampaignRuntimeState): void {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const attachment = socket.deserializeAttachment() as WebSocketAttachment | null;
        if (!attachment) continue;
        const projected = campaignRealtimeProjection(state, {
          userId: attachment.userId,
          side: attachment.side as ViewerContext["side"],
          role: attachment.role as ViewerContext["role"],
        });
        socket.send(JSON.stringify({
          type,
          campaignId: state.campaignId,
          round: state.round,
          phase: state.phase,
          deadline: state.clock.resolvesAt,
          version: state.version,
          cursor: projected.cursor,
        }));
      } catch {
        // The hibernation API will deliver a close/error callback for dead peers.
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/state" && request.method === "GET") return await this.handleState(request);
      if (url.pathname === "/orders" && request.method === "POST") return await this.handleOrder(request);
      if (url.pathname.startsWith("/orders/") && request.method === "DELETE") {
        return await this.handleCancelOrder(request, decodeURIComponent(url.pathname.slice("/orders/".length)));
      }
      if (url.pathname === "/resolve" && request.method === "POST") return await this.handleManualResolve(request);
      if (url.pathname === "/clock" && request.method === "PATCH") return await this.handleClock(request);
      if (url.pathname === "/pause" && request.method === "POST") return await this.handlePause(request);
      if (url.pathname === "/resume" && request.method === "POST") return await this.handleResume(request);
      if (url.pathname === "/ws" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return await this.handleWebSocket(request);
      }
      if (url.pathname.startsWith("/reports/") && request.method === "GET") {
        return await this.handleReport(request, Number(url.pathname.slice("/reports/".length)));
      }
      return errorResponse(404, "NOT_FOUND", "Campaign endpoint not found.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown campaign error.";
      this.log("campaign.request.failed", { path: url.pathname, message });
      if (message === "REQUEST_TOO_LARGE") return errorResponse(413, message, "Request body is too large.");
      if (error instanceof SyntaxError) return errorResponse(400, "INVALID_JSON", "Request body is not valid JSON.");
      if (error instanceof CampaignRequestContractError) {
        return errorResponse(400, error.code, error.message, { path: error.path });
      }
      return errorResponse(
        500,
        "CAMPAIGN_ERROR",
        "Campaign request failed.",
        this.env.ENVIRONMENT === "production" ? undefined : { message },
      );
    }
  }

  private async handleState(request: Request): Promise<Response> {
    const state = await this.getState();
    const view = projectCampaignState(state, this.viewer(request), Date.now());
    return json(view);
  }

  private sanitiseActions(
    input: CampaignActionIntent[] | undefined,
    unitId: string,
    deploymentWeaponIds: Set<string>,
    equipmentIds: Set<string>,
    allowedActions: Set<string>,
    allowsMedicalReload: boolean,
  ): StructuredAction[] {
    if (!input) return [];
    return input.slice(0, 16).map((candidate, index) => {
      if (!candidate.type || !allowedActionTypes.has(candidate.type)) throw new Error("Unknown action type.");
      if (!allowedActions.has(candidate.type)) throw new Error("Unit class is not eligible for this action.");
      const definition = getTacticalActionRule(candidate.type);
      if (!definition.executable) throw new Error("Action is catalogued but not executable in this engine version.");
      if (candidate.type === "RELOAD" && !candidate.weaponId && !allowsMedicalReload) {
        throw new Error("Weapon reload requires a fitted weapon.");
      }
      if (candidate.weaponId && !deploymentWeaponIds.has(candidate.weaponId)) {
        throw new Error("Action references a weapon not fitted to the unit.");
      }
      if (candidate.equipmentIds?.some((id) => !equipmentIds.has(id))) {
        throw new Error("Action references equipment not fitted to the unit.");
      }
      return {
        id: `action:${unitId}:${index + 1}`,
        type: candidate.type,
        economy: definition.economy,
        speedCost: definition.speedCost,
        targetDeploymentId: candidate.targetDeploymentId,
        targetHex: candidate.targetHex,
        // ATTACK participation is always derived from the fitted weapons. A
        // legacy client may still send weaponId, but it cannot narrow or forge
        // the authoritative activation.
        weaponId: candidate.type === "ATTACK" ? undefined : candidate.weaponId,
        equipmentIds: candidate.equipmentIds ?? [],
        payload: candidate.payload ? { ...candidate.payload } : undefined,
      };
    });
  }

  private async handleOrder(request: Request): Promise<Response> {
    const viewer = this.viewer(request);
    const intent = parseCampaignOrderIntent(await readJson<unknown>(request));
    const requestHash = await campaignCommandHash(intent);
    const receiptKey = this.orderReceiptKey(viewer.userId, intent.commandId);
    const storedReceipt = await this.ctx.storage.get<unknown>(receiptKey);
    if (storedReceipt !== undefined) {
      const prior = commandReceipt<OrderCommandResponse>(storedReceipt, "ORDER_UPSERT");
      if (prior.actorUserId !== viewer.userId || prior.commandId !== intent.commandId || prior.requestHash !== requestHash) {
        return errorResponse(409, "COMMAND_REUSED", "commandId was already used with a different campaign order.");
      }
      return json(prior.response, { status: prior.status });
    }
    const baseState = await this.getState();
    if (intent.expectedCampaignVersion !== baseState.version) {
      return errorResponse(409, "CAMPAIGN_VERSION_CHANGED", "Campaign state changed before this order was accepted.", {
        expected: intent.expectedCampaignVersion,
        actual: baseState.version,
      });
    }
    const state = structuredClone(baseState);
    const round = intent.round ?? state.round;
    if (round !== state.round) {
      return errorResponse(422, "FUTURE_ORDER_UNSUPPORTED", "Orders may target only the current round in this runtime version.");
    }
    if (round === state.round && !isCurrentRoundOrderWindowOpen(state, Date.now())) {
      return errorResponse(409, "ROUND_LOCKED", "Orders for this round are locked.");
    }
    const deployment = state.deployments.find((candidate) => candidate.id === intent.unitId);
    if (!deployment) return errorResponse(404, "UNIT_NOT_DEPLOYED", "Campaign deployment was not found.");
    if (deployment.ownerId !== viewer.userId) {
      return errorResponse(403, "UNIT_FORBIDDEN", "You may only order units you own in this milestone.");
    }
    if (deployment.status === "DESTROYED") {
      return errorResponse(409, "UNIT_DESTROYED", "Destroyed units cannot receive orders.");
    }
    const execution = resolveUnitExecutionAdapter(LEGACY_RULESET_ID, deployment.definitionId, this.env.ENVIRONMENT);
    if (!execution.ok) {
      return errorResponse(422, "UNIT_DEFINITION_NOT_EXECUTABLE", execution.message);
    }
    const governedOrders = (deployment.allowedOrders ?? execution.allowedOrderTypes)
      .filter((order) => execution.allowedOrderTypes.includes(order));
    if (!governedOrders.includes(intent.orderType as UnitOrder["orderType"])) {
      return errorResponse(422, "ORDER_INELIGIBLE", "This unit class cannot use that order type.");
    }
    if (!getTacticalOrderRule(intent.orderType as UnitOrder["orderType"]).executable) {
      return errorResponse(422, "ORDER_NOT_EXECUTABLE", "This order is catalogued but not executable in the current engine version.");
    }
    const route = intent.route?.slice(0, MAX_ROUTE_LENGTH) ?? [deployment.position];
    if (route.length === 0) route.push(deployment.position);
    if (route[0]!.q !== deployment.position.q || route[0]!.r !== deployment.position.r) {
      if (route.length === MAX_ROUTE_LENGTH) {
        return errorResponse(400, "ROUTE_TOO_LONG", "Route must leave room for the authoritative starting hex.");
      }
      route.unshift(deployment.position);
    }
    if (
      route.length > 1 &&
      deployment.subsystems?.some((subsystem) => subsystem.subsystemId.toUpperCase() === "MOBILITY" && subsystem.state === "DISABLED")
    ) {
      return errorResponse(422, "MOBILITY_SUBSYSTEM_DISABLED", "This unit cannot move until its mobility subsystem is repaired.");
    }
    const weaponIds = new Set(deployment.weapons.map((weapon) => weapon.id));
    const equipmentIds = new Set(deployment.equipmentIds);
    const allowedActions = new Set(
      (deployment.allowedActions ?? execution.allowedActionTypes)
        .filter((action) => execution.allowedActionTypes.includes(action)),
    );
    const allowsMedicalReload = execution.legacyDefinition.tags.includes("MEDICAL");
    let actions: StructuredAction[];
    let incidentalActions: StructuredAction[];
    try {
      actions = this.sanitiseActions(intent.actions, deployment.id, weaponIds, equipmentIds, allowedActions, allowsMedicalReload);
      incidentalActions = this.sanitiseActions(
        intent.incidentalActions,
        deployment.id,
        weaponIds,
        equipmentIds,
        allowedActions,
        allowsMedicalReload,
      );
    } catch (error) {
      return errorResponse(
        422,
        "ACTION_INELIGIBLE",
        error instanceof Error ? error.message : "Action failed rules validation.",
      );
    }
    const incidentalValidation = validateIncidentalActions(incidentalActions);
    if (!incidentalValidation.legal) {
      return errorResponse(422, "ACTION_INELIGIBLE", incidentalValidation.reason);
    }
    if ([...actions, ...incidentalActions].filter((action) => action.type === "ATTACK").length > 1) {
      return errorResponse(422, "ATTACK_LIMIT", "A unit receives one attack activation per round.");
    }
    const artillery = execution.legacyDefinition.tags.includes("ARTILLERY");
    const artilleryDeployed = deployment.artilleryDeployment === "DEPLOYED" || deployment.statuses.includes("DEPLOYED");
    const platformActions = actions.filter((action) => action.type === "DEPLOY" || action.type === "PACK_UP");
    const digInActions = actions.filter((action) => action.type === "DIG_IN");
    if (digInActions.length > 1) {
      return errorResponse(422, "DIG_IN_LIMIT", "A unit may Dig In once per round.");
    }
    if (digInActions.length > 0 && route.length > 1) {
      return errorResponse(422, "DIG_IN_REQUIRES_HOLD", "Dig In consumes all movement and requires the unit to hold position.");
    }
    if (digInActions.length > 0 && deployment.statuses.includes("DUG_IN")) {
      return errorResponse(409, "ALREADY_DUG_IN", "This unit is already dug in.");
    }
    if (platformActions.length > 1) {
      return errorResponse(422, "ARTILLERY_STATE_CONFLICT", "Artillery may change platform state once per round.");
    }
    if (platformActions.length > 0 && !artillery) {
      return errorResponse(422, "ARTILLERY_ACTION_INELIGIBLE", "Deploy and Pack Up require an Artillery unit.");
    }
    if (platformActions[0]?.type === "DEPLOY" && artilleryDeployed) {
      return errorResponse(422, "ARTILLERY_ALREADY_DEPLOYED", "Artillery is already deployed.");
    }
    if (platformActions[0]?.type === "PACK_UP" && !artilleryDeployed) {
      return errorResponse(422, "ARTILLERY_ALREADY_PACKED", "Artillery is already packed.");
    }
    if (artillery && artilleryDeployed && route.length > 1) {
      return errorResponse(422, "ARTILLERY_DEPLOYED", "Deployed artillery must pack up before it can move in a later round.");
    }
    if (
      artillery &&
      actions.some((action) => action.type === "ATTACK") &&
      !artilleryDeployed &&
      platformActions[0]?.type !== "DEPLOY"
    ) {
      return errorResponse(422, "ARTILLERY_PACKED", "Artillery must deploy before firing.");
    }
    const projectedState = projectCampaignState(state, viewer, Date.now());
    const visibleDeploymentIds = new Set(projectedState.deployments.map((candidate) => candidate.id));
    if (
      [...actions, ...incidentalActions].some(
        (action) => action.targetDeploymentId && !visibleDeploymentIds.has(action.targetDeploymentId),
      )
    ) {
      return errorResponse(422, "TARGET_NOT_VISIBLE", "The target is not present in the unit's current battlefield intelligence.");
    }
    for (const action of actions) {
      if (action.type !== "BOMBARDMENT") continue;
      const targetHex = action.targetHex;
      const visibleHex = targetHex && projectedState.map.find((hex) =>
        hex.coord.q === targetHex.q && hex.coord.r === targetHex.r && hex.visibility !== "UNKNOWN"
      );
      const weapon = deployment.weapons.find((candidate) => candidate.indirect) ?? deployment.weapons[0];
      if (!artillery || !targetHex || !visibleHex || !weapon) {
        return errorResponse(422, "BOMBARDMENT_TARGET_INVALID", "Bombardment requires an Artillery unit and a known battlefield hex.");
      }
      if (hexDistance(route.at(-1)!, targetHex) < 1) {
        return errorResponse(422, "BOMBARDMENT_RANGE_INVALID", "Bombardment target must be at least one hex away.");
      }
      const spotters = state.deployments
        .filter((candidate) =>
          candidate.side === deployment.side &&
          candidate.status !== "DESTROYED" &&
          candidate.status !== "WITHDRAWN" &&
          (candidate.locationState ?? "ON_MAP") === "ON_MAP"
        )
        .map((candidate) => {
          const candidateRules = resolveUnitExecutionAdapter(LEGACY_RULESET_ID, candidate.definitionId, this.env.ENVIRONMENT);
          return {
            id: candidate.id,
            side: candidate.side,
            status: candidate.status,
            position: candidate.position,
            sensorRange: candidate.stats.sensors,
            tags: candidateRules.ok ? candidateRules.legacyDefinition.tags : [],
            profile: {
              id: "v5-ground-spotter",
              canSpotDomains: ["GROUND" as const],
              allowsFiringUnit: false,
              prohibitedTags: ["CANNOT_SPOT_GROUND"],
            },
          };
        });
      const validation = validateArtilleryFire({
        profile: {
          id: "v5-artillery",
          deploySpeedCostQuarters: 2,
          packSpeedCostQuarters: 2,
          mustBeDeployedForIndirectFire: true,
          indirectRequiresSpotter: true,
          fireSupplyType: "SMALL_SUPPLY",
          fireSupplyCost: 1,
        },
        deploymentState: platformActions[0]?.type === "DEPLOY" ? "DEPLOYED" : artilleryDeployed ? "DEPLOYED" : "PACKED",
        firingUnitId: deployment.id,
        firingSide: deployment.side,
        firingPosition: route.at(-1)!,
        weapon,
        target: {
          id: `hex:${targetHex.q},${targetHex.r}`,
          side: deployment.side === "ALLIED" ? "ENEMY" : "ALLIED",
          status: "ACTIVE",
          position: targetHex,
          domain: "GROUND",
        },
        map: state.map,
        spotters,
        supplyAvailable: deployment.supplies?.SMALL_SUPPLY ?? 0,
      });
      if (!validation.legal) {
        return errorResponse(422, "BOMBARDMENT_ILLEGAL", validation.reason ?? "Bombardment is not legal.");
      }
    }
    for (const action of [...actions, ...incidentalActions]) {
      if (action.type !== "REPAIR") continue;
      const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
      const repairKind = action.payload?.repairKind;
      const subsystemId = action.payload?.subsystemId;
      if (!execution.legacyDefinition.tags.includes("ENGINEER")) {
        return errorResponse(422, "REPAIR_INELIGIBLE", "Engineer Repair requires an Engineer unit.");
      }
      if (!target || target.side !== deployment.side || target.status === "DESTROYED" || target.stats.healthModel !== "HITS") {
        return errorResponse(422, "REPAIR_TARGET_INVALID", "Engineer Repair requires a friendly operational vehicle.");
      }
      if ((deployment.supplies?.SMALL_SUPPLY ?? 0) < 1) {
        return errorResponse(422, "REPAIR_SUPPLY_REQUIRED", "Engineer Repair requires one Small Supply.");
      }
      if (repairKind === "HIT" && target.currentHealth >= target.stats.maxHealth) {
        return errorResponse(422, "REPAIR_NOT_REQUIRED", "The target has no lost Hit to repair.");
      }
      if (
        repairKind === "SUBSYSTEM" &&
        !target.subsystems?.some((subsystem) => subsystem.subsystemId === subsystemId && subsystem.state !== "OPERATIONAL")
      ) {
        return errorResponse(422, "REPAIR_SUBSYSTEM_INVALID", "The selected subsystem is not damaged.");
      }
    }
    for (const action of actions) {
      if (action.type !== "ATTACK" || !action.targetDeploymentId) continue;
      const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
      if (!target) continue;
      const intendedAttacker = { ...deployment, position: { ...route.at(-1)! } };
      const checks = [...deployment.weapons]
        .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
        .map((weapon) => {
          const targeting = canTarget(intendedAttacker, target, weapon, state.map, state.deployments);
          const ammoAvailable = weapon.ammoCapacity === undefined || (deployment.ammunition[weapon.id] ?? 0) > 0;
          // Resolution ticks existing cooldowns once before the attack phase.
          const cooldownReady = (deployment.cooldowns[weapon.id] ?? 0) <= 1;
          return {
            weapon,
            legal: targeting.legal && ammoAvailable && cooldownReady,
            reason: targeting.reason ?? (!ammoAvailable ? "Weapon has no ammunition." : !cooldownReady ? "Weapon is cooling down." : undefined),
          };
        });
      const participating = checks.filter((check) => check.legal).map((check) => check.weapon);
      if (participating.length === 0) {
        return errorResponse(
          422,
          "TARGET_ILLEGAL",
          checks.map((check) => `${check.weapon.name}: ${check.reason ?? "not eligible"}`).join(" ") || "No fitted weapon can engage that target.",
        );
      }
      action.targetHex = { ...target.position };
      action.weaponIds = participating.map((weapon) => weapon.id);
    }
    const existingIndex = state.orders.findIndex(
      (candidate) => candidate.unitId === deployment.id && candidate.round === round,
    );
    const existing = existingIndex >= 0 ? state.orders[existingIndex] : undefined;
    const currentRevision = existing?.revision ?? 0;
    if (intent.expectedOrderRevision !== currentRevision) {
      return errorResponse(409, "ORDER_REVISION_CHANGED", "Order revision changed before this command was accepted.", {
        expected: intent.expectedOrderRevision,
        actual: currentRevision,
      });
    }
    if (existing && ["LOCKED", "RESOLVING", "RESOLVED"].includes(existing.lifecycle)) {
      return errorResponse(409, "ORDER_LOCKED", "The existing order can no longer be replaced.");
    }
    const order: UnitOrder = {
      id: `order:${state.campaignId}:${round}:${deployment.id}`,
      revision: (existing?.revision ?? 0) + 1,
      unitId: deployment.id,
      campaignId: state.campaignId,
      round,
      orderType: intent.orderType as UnitOrder["orderType"],
      lifecycle: intent.lifecycle === "DRAFT" ? "DRAFT" : "SUBMITTED",
      startHex: deployment.position,
      route,
      endHex: route.at(-1)!,
      facing: intent.facing,
      actions,
      targets: actions.flatMap((action) => (action.targetDeploymentId ? [action.targetDeploymentId] : [])),
      equipmentUsed: [...new Set(actions.flatMap((action) => action.equipmentIds))],
      ammoUsed: Object.fromEntries(
        actions.flatMap((action) => action.type === "ATTACK"
          ? (action.weaponIds ?? []).flatMap((weaponId) =>
              deployment.weapons.find((weapon) => weapon.id === weaponId)?.ammoCapacity === undefined
                ? []
                : [[weaponId, 1] as const]
            )
          : []),
      ),
      incidentalActions,
      optionalRoleplayText: intent.optionalRoleplayText,
      submittedBy: viewer.userId,
      submittedAt: Date.now(),
    };

    if (round === state.round && order.lifecycle === "SUBMITTED") {
      const validation = validateOrder(order, deployment, {
        previousState: state,
        rulesetVersion: state.rulesetVersion,
        playerOrders: [order],
        enemyOrders: [],
        seed: "submission-validation",
        resolutionTime: order.submittedAt,
      });
      if (!validation.legal) return errorResponse(422, "ORDER_ILLEGAL", "Order failed server validation.", validation);
    }
    if (existingIndex >= 0) state.orders[existingIndex] = order;
    else state.orders.push(order);
    state.version += 1;
    const sequence = eventSequence(state);
    const submittedEvent: CampaignEvent = {
      eventId: `${state.campaignId}:${state.round}:${String(sequence).padStart(4, "0")}:ORDER_SUBMITTED`,
      campaignId: state.campaignId,
      round: state.round,
      sequence,
      type: "ORDER_SUBMITTED",
      actor: deployment.id,
      payload: { orderId: order.id, revision: order.revision, scheduledRound: round, lifecycle: order.lifecycle },
      timestamp: order.submittedAt,
      visibility: "ALLIED",
    };
    state.events.push(submittedEvent);
    const response = { order, campaignVersion: state.version };
    const status = existing ? 200 : 201;
    const receipt: CampaignCommandReceipt<OrderCommandResponse> = {
      schemaVersion: 1,
      operation: "ORDER_UPSERT",
      actorUserId: viewer.userId,
      commandId: intent.commandId,
      requestHash,
      status,
      response,
      createdAt: order.submittedAt,
    };
    const commit = await this.ctx.storage.transaction(async (transaction) => {
      const concurrentReceiptValue = await transaction.get<unknown>(receiptKey);
      if (concurrentReceiptValue !== undefined) {
        const concurrentReceipt = commandReceipt<OrderCommandResponse>(concurrentReceiptValue, "ORDER_UPSERT");
        return concurrentReceipt.requestHash === requestHash &&
          concurrentReceipt.actorUserId === viewer.userId &&
          concurrentReceipt.commandId === intent.commandId
          ? { kind: "REPLAY" as const, receipt: concurrentReceipt }
          : { kind: "COMMAND_REUSED" as const };
      }
      const current = this.storedState(await transaction.get<unknown>(STATE_KEY), baseState);
      const currentOrder = current.orders.find(
        (candidate) => candidate.unitId === deployment.id && candidate.round === round,
      );
      if (
        current.version !== intent.expectedCampaignVersion ||
        (currentOrder?.revision ?? 0) !== intent.expectedOrderRevision
      ) {
        return {
          kind: "VERSION_CHANGED" as const,
          campaignVersion: current.version,
          orderRevision: currentOrder?.revision ?? 0,
        };
      }
      await transaction.put(STATE_KEY, encodeCampaignStoredState(state));
      await transaction.put(`event/${state.round}/${String(sequence).padStart(6, "0")}`, submittedEvent);
      await transaction.put(receiptKey, receipt);
      return { kind: "COMMITTED" as const };
    });
    if (commit.kind === "REPLAY") return json(commit.receipt.response, { status: commit.receipt.status });
    if (commit.kind === "COMMAND_REUSED") {
      return errorResponse(409, "COMMAND_REUSED", "commandId was already used with a different campaign order.");
    }
    if (commit.kind === "VERSION_CHANGED") {
      return errorResponse(409, "CAMPAIGN_VERSION_CHANGED", "Campaign or order state changed before commit.", {
        expectedCampaignVersion: intent.expectedCampaignVersion,
        actualCampaignVersion: commit.campaignVersion,
        expectedOrderRevision: intent.expectedOrderRevision,
        actualOrderRevision: commit.orderRevision,
      });
    }
    this.broadcast("order-updated", state);
    this.log("order.saved", { userId: viewer.userId, unitId: deployment.id, orderId: order.id, revision: order.revision });
    return json(response, { status });
  }

  private async handleCancelOrder(request: Request, orderId: string): Promise<Response> {
    await assertCampaignMutationBodyEmpty(request);
    const viewer = this.viewer(request);
    const state = await this.getState();
    const order = state.orders.find((candidate) => candidate.id === orderId);
    if (!order) return errorResponse(404, "ORDER_NOT_FOUND", "Order was not found.");
    const deployment = state.deployments.find((candidate) => candidate.id === order.unitId);
    if (!deployment || deployment.ownerId !== viewer.userId) {
      return errorResponse(403, "ORDER_FORBIDDEN", "You cannot cancel this order.");
    }
    if (
      !["DRAFT", "SUBMITTED"].includes(order.lifecycle) ||
      (order.round === state.round && state.phase !== "PLANNING")
    ) {
      return errorResponse(409, "ORDER_LOCKED", "Order can no longer be cancelled.");
    }
    order.lifecycle = "CANCELLED";
    state.version += 1;
    await this.ctx.storage.put(STATE_KEY, encodeCampaignStoredState(state));
    this.broadcast("order-cancelled", state);
    return json({ orderId, lifecycle: order.lifecycle });
  }

  private async lockRound(now = Date.now()): Promise<CampaignRuntimeState> {
    const fallback = await this.getState();
    const state = await this.ctx.storage.transaction(async (transaction) => {
      const current = this.storedState(await transaction.get<unknown>(STATE_KEY), fallback);
      if (current.phase !== "PLANNING") return current;
      current.phase = "LOCKED";
      current.orders.forEach((order) => {
        if (order.round === current.round && order.lifecycle === "SUBMITTED") order.lifecycle = "LOCKED";
      });
      const lockEvent = current.clock.schedule.find(
        (scheduled) => scheduled.round === current.round && scheduled.type === "ORDER_LOCK",
      );
      const updated = lockEvent ? removeScheduledEvent(current, lockEvent.id) : current;
      const sequence = eventSequence(updated);
      const event: CampaignEvent = {
        eventId: `${updated.campaignId}:${updated.round}:${String(sequence).padStart(4, "0")}:ORDER_LOCKED`,
        campaignId: updated.campaignId,
        round: updated.round,
        sequence,
        type: "ORDER_LOCKED",
        payload: { lockedOrders: updated.orders.filter((order) => order.round === updated.round && order.lifecycle === "LOCKED").length },
        timestamp: now,
        visibility: "PUBLIC",
      };
      updated.events.push(event);
      updated.version += 1;
      await transaction.put(STATE_KEY, encodeCampaignStoredState(updated));
      await transaction.put(`event/${updated.round}/${String(sequence).padStart(6, "0")}`, event);
      return updated;
    });
    await this.scheduleNextAlarm(state);
    this.broadcast("round-locked", state);
    this.log("round.locked", { round: state.round });
    return state;
  }

  private async remainingPersistentEffectCount(round: number): Promise<number> {
    const pending = await this.ctx.storage.list<{ payload: Record<string, unknown> }>({ prefix: "pending-effect/" });
    return [...pending.values()].filter((effect) => this.effectRound(effect) === round).length;
  }

  private async finaliseResolvedRound(
    round: number,
    now: number,
  ): Promise<{ state: CampaignRuntimeState; record: ResolutionRecord; complete: boolean }> {
    if (await this.remainingPersistentEffectCount(round) > 0) {
      const state = await this.getState();
      const record = await this.ctx.storage.get<ResolutionRecord>(`resolution/${round}`);
      if (!record) throw new Error("RESOLUTION_RECORD_MISSING");
      await this.scheduleNextAlarm(state);
      return { state, record, complete: false };
    }

    let roundStarted: CampaignEvent | undefined;
    const fallback = await this.getState();
    const result = await this.ctx.storage.transaction(async (transaction) => {
      const state = this.storedState(await transaction.get<unknown>(STATE_KEY), fallback);
      const record = await transaction.get<ResolutionRecord>(`resolution/${round}`);
      if (!record) throw new Error("RESOLUTION_RECORD_MISSING");
      if (record.status === "RESOLVED" || state.round !== round || state.phase !== "EFFECTS_PENDING") {
        return { state, record, complete: record.status === "RESOLVED" || state.round !== round };
      }

      state.pendingPersistentEffects = state.pendingPersistentEffects.filter(
        (effect) => this.effectRound(effect) !== round,
      );
      state.orders = state.orders.filter((order) => order.round > round);
      record.status = "RESOLVED";
      record.appliedEffectCount = record.effectCount ?? 0;
      record.resolvedAt = now;
      state.resolutions[record.key] = record;

      if (state.outcome) {
        const { pausedAt: _pausedAt, phaseBeforePause: _phaseBeforePause, ...terminalClock } = state.clock;
        void _pausedAt;
        void _phaseBeforePause;
        state.phase = "COMPLETE";
        state.clock = { ...terminalClock, durationMs: 0, lockLeadMs: 0, lockAt: 0, resolvesAt: 0, schedule: [] };
      } else {
        state.round = round + 1;
        state.phase = "PLANNING";
        state.clock = makeRoundClock(
          state.campaignId,
          state.round,
          now,
          fallback.clock.durationMs,
          fallback.clock.lockLeadMs || this.configuredLockLead(),
        );
        const sequence = eventSequence(state);
        roundStarted = {
          eventId: `${state.campaignId}:${state.round}:${String(sequence).padStart(4, "0")}:ROUND_STARTED`,
          campaignId: state.campaignId,
          round: state.round,
          sequence,
          type: "ROUND_STARTED",
          payload: { previousRound: round, deadline: state.clock.resolvesAt },
          timestamp: now,
          visibility: "PUBLIC",
        };
        state.events.push(roundStarted);
      }
      state.version += 1;
      await transaction.put(STATE_KEY, encodeCampaignStoredState(state));
      await transaction.put(`resolution/${round}`, record);
      if (roundStarted) await transaction.put(`event/${state.round}/${String(roundStarted.sequence).padStart(6, "0")}`, roundStarted);
      return { state, record, complete: true };
    });
    await this.scheduleNextAlarm(result.state);
    return result;
  }

  private async resumePersistentEffects(
    round: number,
    now: number,
  ): Promise<{ state: CampaignRuntimeState; record: ResolutionRecord; complete: boolean }> {
    try {
      await this.applyPendingPersistentEffects(round);
      return await this.finaliseResolvedRound(round, now);
    } catch (error) {
      const state = await this.getState();
      const record = await this.ctx.storage.get<ResolutionRecord>(`resolution/${round}`);
      if (!record) throw error;
      await this.scheduleNextAlarm(state);
      this.log("round.effects.retry_scheduled", {
        round,
        message: error instanceof Error ? error.message : String(error),
      });
      return { state, record, complete: false };
    }
  }

  private async resolveCurrentRound(
    now = Date.now(),
    expectedRound?: number,
  ): Promise<{ state: CampaignRuntimeState; record: ResolutionRecord; duplicate: boolean }> {
    let duplicate = false;
    let committedRecord: ResolutionRecord | undefined;
    const fallback = await this.getState();
    if (expectedRound !== undefined && fallback.round !== expectedRound) {
      const prior = await this.ctx.storage.get<ResolutionRecord>(`resolution/${expectedRound}`);
      if (prior) return { state: fallback, record: prior, duplicate: true };
      throw new Error(`Expected round ${expectedRound}, but campaign is on round ${fallback.round}.`);
    }
    const priorRecord = await this.ctx.storage.get<ResolutionRecord>(`resolution/${fallback.round}`);
    if (priorRecord) {
      if (fallback.phase === "EFFECTS_PENDING" && priorRecord.status !== "RESOLVED") {
        const resumed = await this.resumePersistentEffects(fallback.round, now);
        return { state: resumed.state, record: resumed.record, duplicate: true };
      }
      return { state: fallback, record: priorRecord, duplicate: true };
    }
    const nextState = await this.ctx.storage.transaction(async (transaction) => {
      const state = this.storedState(await transaction.get<unknown>(STATE_KEY), fallback);
      if (expectedRound !== undefined && state.round !== expectedRound) {
        const prior = await transaction.get<ResolutionRecord>(`resolution/${expectedRound}`);
        if (prior) {
          duplicate = true;
          committedRecord = prior;
          return state;
        }
        throw new Error(`Expected round ${expectedRound}, but campaign is on round ${state.round}.`);
      }
      const resolutionKey = `${state.campaignId}:${state.round}`;
      const existing = await transaction.get<ResolutionRecord>(`resolution/${state.round}`);
      if (existing) {
        duplicate = true;
        committedRecord = existing;
        return state;
      }
      state.phase = "RESOLVING";
      state.orders.forEach((order) => {
        if (order.round === state.round && order.lifecycle === "SUBMITTED") order.lifecycle = "LOCKED";
        if (order.round === state.round && order.lifecycle === "LOCKED") order.lifecycle = "RESOLVING";
      });
      await transaction.put(
        `snapshot/${state.round}`,
        encodeCampaignStoredState(structuredClone(state)),
      );

      const playerOrders = state.orders.filter(
        (order) => order.round === state.round && ["LOCKED", "RESOLVING"].includes(order.lifecycle),
      );
      playerOrders.forEach((order) => {
        if (order.lifecycle === "RESOLVING") order.lifecycle = "LOCKED";
      });
      const enemyOrders = generateEnemyOrders(state, now);
      const seed = `${resolutionKey}:${state.rulesetVersion}:foundation-seed-commit`;
      const output = resolveRound({
        previousState: state,
        rulesetVersion: state.rulesetVersion,
        playerOrders,
        enemyOrders,
        seed,
        resolutionTime: now,
      });
      const record: ResolutionRecord = {
        key: resolutionKey,
        campaignId: state.campaignId,
        round: state.round,
        seed,
        startedAt: now,
        committedAt: now,
        eventIds: output.events.map((event) => event.eventId),
        stateDigest: output.digest,
        status: "EFFECTS_PENDING",
        effectCount: output.persistentEffects.length,
        appliedEffectCount: 0,
      };
      output.state.resolutions[resolutionKey] = record;
      const completedRound = output.state.round;
      output.state.phase = "EFFECTS_PENDING";
      output.state.clock = {
        ...state.clock,
        schedule: [],
      };
      output.state.version += 1;
      await transaction.put(STATE_KEY, encodeCampaignStoredState(output.state));
      await transaction.put(`resolution/${completedRound}`, record);
      for (const resolvedEvent of output.events) {
        await transaction.put(
          `event/${completedRound}/${String(resolvedEvent.sequence).padStart(6, "0")}`,
          resolvedEvent,
        );
      }
      for (const effect of output.persistentEffects) {
        await transaction.put(`pending-effect/${effect.idempotencyKey}`, effect);
      }
      committedRecord = record;
      return output.state;
    });

    if (!committedRecord) throw new Error("Resolution transaction completed without a record.");
    const settled = committedRecord.status === "RESOLVED"
      ? { state: nextState, record: committedRecord, complete: true }
      : await this.resumePersistentEffects(committedRecord.round, now);
    this.broadcast(settled.complete ? (duplicate ? "round-resolution-replayed" : "round-resolved") : "round-effects-pending", settled.state);
    this.log(settled.complete ? "round.resolved" : "round.effects_pending", {
      round: settled.record.round,
      resolutionKey: settled.record.key,
      digest: settled.record.stateDigest,
      duplicate,
    });
    return { state: settled.state, record: settled.record, duplicate };
  }

  private async handleManualResolve(request: Request): Promise<Response> {
    await assertCampaignMutationBodyEmpty(request);
    const viewer = this.viewer(request);
    if (!this.isOperator(viewer)) return errorResponse(403, "ADMIN_REQUIRED", "Campaign operator permission is required.");
    const state = await this.getState();
    const expectedHeader = request.headers.get("x-expected-round");
    if (expectedHeader === null) {
      return errorResponse(400, "EXPECTED_ROUND_REQUIRED", "x-expected-round is required for manual resolution.");
    }
    const expectedRound = Number(expectedHeader);
    if (!Number.isInteger(expectedRound) || expectedRound < 1) {
      return errorResponse(400, "ROUND_INVALID", "x-expected-round must be a positive integer.");
    }
    if (expectedRound !== state.round) {
      const prior = await this.ctx.storage.get<ResolutionRecord>(`resolution/${expectedRound}`);
      if (prior) return json({ resolution: this.publicResolution(prior), duplicate: true, nextRound: state.round });
      return errorResponse(409, "ROUND_CHANGED", "Campaign round no longer matches the requested round.");
    }
    if (state.phase === "PAUSED") return errorResponse(409, "CAMPAIGN_PAUSED", "Resume the campaign before resolving.");
    if (state.phase === "PLANNING") await this.lockRound();
    const result = await this.resolveCurrentRound(Date.now(), expectedRound);
    return json({
      resolution: this.publicResolution(result.record),
      duplicate: result.duplicate,
      nextRound: ["COMPLETE", "EFFECTS_PENDING"].includes(result.state.phase) ? null : result.state.round,
      phase: result.state.phase,
      outcome: result.state.outcome,
    });
  }

  private async handleClock(request: Request): Promise<Response> {
    const viewer = this.viewer(request);
    if (!this.isOperator(viewer)) return errorResponse(403, "ADMIN_REQUIRED", "Campaign operator permission is required.");
    const intent = parseCampaignClockIntent(await readJson<unknown>(request));
    const requestHash = await campaignCommandHash(intent);
    const receiptKey = this.clockReceiptKey(viewer.userId, intent.commandId);
    const storedReceipt = await this.ctx.storage.get<unknown>(receiptKey);
    if (storedReceipt !== undefined) {
      const prior = commandReceipt<ClockCommandResponse>(storedReceipt, "CLOCK_UPDATE");
      if (prior.actorUserId !== viewer.userId || prior.commandId !== intent.commandId || prior.requestHash !== requestHash) {
        return errorResponse(409, "COMMAND_REUSED", "commandId was already used with a different clock command.");
      }
      const current = await this.getState();
      await this.scheduleNextAlarm(current);
      return json(prior.response, { status: prior.status });
    }
    const durationMs =
      intent.preset && intent.preset in CLOCK_PRESETS
        ? CLOCK_PRESETS[intent.preset]
        : Number.isInteger(intent.durationMs) && intent.durationMs! >= 0 && intent.durationMs! <= 86_400_000
          ? intent.durationMs!
          : undefined;
    if (durationMs === undefined) throw new Error("Validated clock intent did not resolve to a duration.");
    const baseState = await this.getState();
    if (intent.expectedCampaignVersion !== baseState.version) {
      return errorResponse(409, "CAMPAIGN_VERSION_CHANGED", "Campaign state changed before this clock command was accepted.", {
        expected: intent.expectedCampaignVersion,
        actual: baseState.version,
      });
    }
    if (baseState.phase !== "PLANNING") return errorResponse(409, "ROUND_NOT_PLANNING", "Clock can only change during planning.");
    const now = Date.now();
    const state = structuredClone(baseState);
    state.clock = makeRoundClock(state.campaignId, state.round, now, durationMs, this.configuredLockLead());
    state.version += 1;
    const response: ClockCommandResponse = {
      clock: state.clock,
      preset: intent.preset ?? "custom",
      campaignVersion: state.version,
    };
    const receipt: CampaignCommandReceipt<ClockCommandResponse> = {
      schemaVersion: 1,
      operation: "CLOCK_UPDATE",
      actorUserId: viewer.userId,
      commandId: intent.commandId,
      requestHash,
      status: 200,
      response,
      createdAt: now,
    };
    const commit = await this.ctx.storage.transaction(async (transaction) => {
      const concurrentReceiptValue = await transaction.get<unknown>(receiptKey);
      if (concurrentReceiptValue !== undefined) {
        const concurrentReceipt = commandReceipt<ClockCommandResponse>(concurrentReceiptValue, "CLOCK_UPDATE");
        return concurrentReceipt.requestHash === requestHash &&
          concurrentReceipt.actorUserId === viewer.userId &&
          concurrentReceipt.commandId === intent.commandId
          ? { kind: "REPLAY" as const, receipt: concurrentReceipt }
          : { kind: "COMMAND_REUSED" as const };
      }
      const current = this.storedState(await transaction.get<unknown>(STATE_KEY), baseState);
      if (current.version !== intent.expectedCampaignVersion || current.phase !== "PLANNING") {
        return { kind: "VERSION_CHANGED" as const, campaignVersion: current.version, phase: current.phase };
      }
      await transaction.put(STATE_KEY, encodeCampaignStoredState(state));
      await transaction.put(receiptKey, receipt);
      return { kind: "COMMITTED" as const };
    });
    if (commit.kind === "REPLAY") return json(commit.receipt.response, { status: commit.receipt.status });
    if (commit.kind === "COMMAND_REUSED") {
      return errorResponse(409, "COMMAND_REUSED", "commandId was already used with a different clock command.");
    }
    if (commit.kind === "VERSION_CHANGED") {
      return errorResponse(409, "CAMPAIGN_VERSION_CHANGED", "Campaign state changed before clock commit.", {
        expectedCampaignVersion: intent.expectedCampaignVersion,
        actualCampaignVersion: commit.campaignVersion,
        phase: commit.phase,
      });
    }
    await this.scheduleNextAlarm(state);
    this.broadcast("clock-updated", state);
    return json(response);
  }

  private async handlePause(request: Request): Promise<Response> {
    await assertCampaignMutationBodyEmpty(request);
    const viewer = this.viewer(request);
    if (!this.isOperator(viewer)) return errorResponse(403, "ADMIN_REQUIRED", "Campaign operator permission is required.");
    const now = Date.now();
    const fallback = await this.getState();
    if (fallback.phase === "COMPLETE" || fallback.phase === "FAILED") {
      return errorResponse(409, "CAMPAIGN_COMPLETE", "A completed campaign cannot be paused.");
    }
    if (fallback.phase === "EFFECTS_PENDING") {
      return errorResponse(409, "EFFECTS_PENDING", "Campaign persistence must finish before the clock can be paused.");
    }
    const { state, changed, terminal } = await this.ctx.storage.transaction(async (transaction) => {
      const current = this.storedState(await transaction.get<unknown>(STATE_KEY), fallback);
      if (current.phase === "COMPLETE" || current.phase === "FAILED") {
        return { state: current, changed: false, terminal: true };
      }
      const updated = pauseClock(current, now);
      if (updated === current) return { state: current, changed: false, terminal: false };
      const event = updated.events.at(-1);
      if (!event || event.type !== "CAMPAIGN_PAUSED") throw new Error("Pause transition did not emit its campaign event.");
      await transaction.put(STATE_KEY, encodeCampaignStoredState(updated));
      await transaction.put(`event/${updated.round}/${String(event.sequence).padStart(6, "0")}`, event);
      return { state: updated, changed: true, terminal: false };
    });
    if (terminal) return errorResponse(409, "CAMPAIGN_COMPLETE", "A completed campaign cannot be paused.");
    await this.scheduleNextAlarm(state);
    if (changed) this.broadcast("campaign-paused", state);
    return json({ phase: state.phase, clock: state.clock });
  }

  private async handleResume(request: Request): Promise<Response> {
    await assertCampaignMutationBodyEmpty(request);
    const viewer = this.viewer(request);
    if (!this.isOperator(viewer)) return errorResponse(403, "ADMIN_REQUIRED", "Campaign operator permission is required.");
    const now = Date.now();
    const fallback = await this.getState();
    const { state, changed } = await this.ctx.storage.transaction(async (transaction) => {
      const current = this.storedState(await transaction.get<unknown>(STATE_KEY), fallback);
      const updated = resumeClock(current, now);
      if (updated === current) return { state: current, changed: false };
      const event = updated.events.at(-1);
      if (!event || event.type !== "CAMPAIGN_RESUMED") throw new Error("Resume transition did not emit its campaign event.");
      await transaction.put(STATE_KEY, encodeCampaignStoredState(updated));
      await transaction.put(`event/${updated.round}/${String(event.sequence).padStart(6, "0")}`, event);
      return { state: updated, changed: true };
    });
    await this.scheduleNextAlarm(state);
    if (changed) this.broadcast("campaign-resumed", state);
    return json({ phase: state.phase, clock: state.clock });
  }

  private async handleReport(request: Request, round: number): Promise<Response> {
    const viewer = this.viewer(request);
    if (!Number.isInteger(round) || round < 1) return errorResponse(400, "ROUND_INVALID", "Round number is invalid.");
    const record = await this.ctx.storage.get<ResolutionRecord>(`resolution/${round}`);
    if (!record) return errorResponse(404, "REPORT_NOT_FOUND", "No resolved report exists for this round.");
    const storedEvents = await this.ctx.storage.list<CampaignEvent>({ prefix: `event/${round}/` });
    const state = await this.getState();
    const projected = projectCampaignState(
      { ...state, events: [...storedEvents.values()] },
      viewer,
      Date.now(),
    );
    return json({ resolution: this.publicResolution(record), events: projected.events });
  }

  private publicResolution(record: ResolutionRecord): Omit<ResolutionRecord, "seed"> {
    const { seed: _seed, ...projected } = record;
    void _seed;
    return projected;
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const viewer = this.viewer(request);
    const state = await this.getState();
    const catchUp = campaignRealtimeProjection(state, viewer, parseCampaignRealtimeCursor(new URL(request.url)));
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const attachment: WebSocketAttachment = { userId: viewer.userId, side: viewer.side, role: viewer.role };
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, [`side:${viewer.side}`, `user:${viewer.userId}`]);
    server.send(JSON.stringify({
      type: "connected",
      campaignId: this.campaignId(),
      round: state.round,
      phase: state.phase,
      version: state.version,
      cursor: catchUp.cursor,
      events: catchUp.events,
      truncated: catchUp.truncated,
      serverTime: Date.now(),
    }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    let state = await this.getState();
    if (state.phase === "PAUSED") return;
    const now = Date.now();
    if (state.phase === "EFFECTS_PENDING") {
      const record = await this.ctx.storage.get<ResolutionRecord>(`resolution/${state.round}`);
      if (!record) throw new Error("RESOLUTION_RECORD_MISSING");
      state = (await this.resumePersistentEffects(state.round, now)).state;
      await this.scheduleNextAlarm(state);
      return;
    }
    const due = state.clock.schedule
      .filter((event) => event.runAt <= now)
      .sort((left, right) => left.runAt - right.runAt || (left.type < right.type ? -1 : left.type > right.type ? 1 : 0));
    for (const scheduled of due) {
      state = await this.getState();
      if (scheduled.round !== state.round) continue;
      if (scheduled.type === "ORDER_LOCK") state = await this.lockRound(now);
      if (scheduled.type === "ROUND_RESOLVE") state = (await this.resolveCurrentRound(now, scheduled.round)).state;
    }
    await this.scheduleNextAlarm(state);
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string" || message.length > 8_192) return;
    if (message === "ping") {
      socket.send(JSON.stringify({ type: "pong", serverTime: Date.now() }));
      return;
    }
    socket.send(JSON.stringify({ type: "error", code: "READ_ONLY_SOCKET", message: "Use authenticated HTTP endpoints for commands." }));
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }

  webSocketError(_socket: WebSocket, error: unknown): void {
    this.log("websocket.error", { message: error instanceof Error ? error.message : String(error) });
  }
}
