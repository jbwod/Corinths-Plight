import { DurableObject } from "cloudflare:workers";
import type {
  CampaignEvent,
  CampaignRuntimeState,
  Facing,
  ResolutionRecord,
  StructuredAction,
  UnitOrder,
  ViewerContext,
} from "../packages/domain/src";
import {
  createDemoCampaignState,
  getActionDefinition,
  getOrderTypeDefinition,
  getUnitClass,
  projectCampaignState,
  resolveRound,
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
  type ClockPreset,
} from "./campaign-clock";
import { viewerFromInternalRequest } from "./auth";
import { generateEnemyOrders } from "./enemy-ai";
import type { Env } from "./env";
import { errorResponse, json, readJson } from "./http";
import { validateIncidentalActions } from "./order-validation";

const STATE_KEY = "state/current";
const FOUNDATION_CAMPAIGN_ID = "outpost-k17";
const MAX_ROUTE_LENGTH = 128;
const MAX_FUTURE_ROUNDS = 8;
const allowedOrderTypes = new Set(["HOLD", "ADVANCE", "RUSH", "EVASIVE", "MELEE_CHARGE", "STEALTH"]);
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

interface OrderIntent {
  unitId?: string;
  round?: number;
  orderType?: string;
  lifecycle?: "DRAFT" | "SUBMITTED";
  route?: Array<{ q: number; r: number }>;
  facing?: number;
  actions?: Array<Partial<StructuredAction>>;
  incidentalActions?: Array<Partial<StructuredAction>>;
  optionalRoleplayText?: string;
}

interface ClockIntent {
  preset?: ClockPreset;
  durationMs?: number;
}

interface WebSocketAttachment {
  userId: string;
  side: string;
  role: string;
}

function isCoordinate(value: unknown): value is { q: number; r: number } {
  if (!value || typeof value !== "object") return false;
  const coord = value as { q?: unknown; r?: unknown };
  return Number.isInteger(coord.q) && Number.isInteger(coord.r);
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

  private async getState(): Promise<CampaignRuntimeState> {
    const stored = await this.ctx.storage.get<CampaignRuntimeState>(STATE_KEY);
    if (stored) return stored;
    if (this.campaignId() !== FOUNDATION_CAMPAIGN_ID) {
      throw new Error("CAMPAIGN_NOT_INITIALISED");
    }
    const created = createDemoCampaignState(Date.now(), this.configuredDuration(), this.campaignId());
    created.clock = makeRoundClock(
      created.campaignId,
      created.round,
      created.clock.roundStartedAt,
      this.configuredDuration(),
      this.configuredLockLead(),
    );
    await this.ctx.storage.put(STATE_KEY, created);
    await this.scheduleNextAlarm(created);
    return created;
  }

  private async scheduleNextAlarm(state: CampaignRuntimeState): Promise<void> {
    const next = nextScheduledTime(state);
    if (next === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current !== next) await this.ctx.storage.setAlarm(next);
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

  private broadcast(type: string, state: CampaignRuntimeState, extra: Record<string, unknown> = {}): void {
    const message = JSON.stringify({
      type,
      campaignId: state.campaignId,
      round: state.round,
      phase: state.phase,
      deadline: state.clock.resolvesAt,
      version: state.version,
      ...extra,
    });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // The hibernation API will deliver a close/error callback for dead peers.
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/state" && request.method === "GET") return this.handleState(request);
      if (url.pathname === "/orders" && request.method === "POST") return this.handleOrder(request);
      if (url.pathname.startsWith("/orders/") && request.method === "DELETE") {
        return this.handleCancelOrder(request, decodeURIComponent(url.pathname.slice("/orders/".length)));
      }
      if (url.pathname === "/resolve" && request.method === "POST") return this.handleManualResolve(request);
      if (url.pathname === "/clock" && request.method === "PATCH") return this.handleClock(request);
      if (url.pathname === "/pause" && request.method === "POST") return this.handlePause(request);
      if (url.pathname === "/resume" && request.method === "POST") return this.handleResume(request);
      if (url.pathname === "/ws" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return this.handleWebSocket(request);
      }
      if (url.pathname.startsWith("/reports/") && request.method === "GET") {
        return this.handleReport(request, Number(url.pathname.slice("/reports/".length)));
      }
      return errorResponse(404, "NOT_FOUND", "Campaign endpoint not found.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown campaign error.";
      this.log("campaign.request.failed", { path: url.pathname, message });
      if (message === "REQUEST_TOO_LARGE") return errorResponse(413, message, "Request body is too large.");
      if (error instanceof SyntaxError) return errorResponse(400, "INVALID_JSON", "Request body is not valid JSON.");
      return errorResponse(500, "CAMPAIGN_ERROR", "Campaign request failed.", { message });
    }
  }

  private async handleState(request: Request): Promise<Response> {
    const state = await this.getState();
    const view = projectCampaignState(state, this.viewer(request), Date.now());
    return json(view);
  }

  private sanitiseActions(
    input: Array<Partial<StructuredAction>> | undefined,
    unitId: string,
    deploymentWeaponIds: Set<string>,
    equipmentIds: Set<string>,
    allowedActions: Set<string>,
  ): StructuredAction[] {
    if (!input) return [];
    return input.slice(0, 16).map((candidate, index) => {
      if (!candidate.type || !allowedActionTypes.has(candidate.type)) throw new Error("Unknown action type.");
      if (!allowedActions.has(candidate.type)) throw new Error("Unit class is not eligible for this action.");
      const definition = getActionDefinition(candidate.type);
      if (!definition.executable) throw new Error("Action is catalogued but not executable in this engine version.");
      if (candidate.weaponId && !deploymentWeaponIds.has(candidate.weaponId)) {
        throw new Error("Action references a weapon not fitted to the unit.");
      }
      return {
        id: `action:${unitId}:${index + 1}`,
        type: candidate.type,
        economy: definition.economy,
        speedCost: definition.speedCost,
        targetDeploymentId:
          typeof candidate.targetDeploymentId === "string" ? candidate.targetDeploymentId.slice(0, 128) : undefined,
        targetHex: isCoordinate(candidate.targetHex) ? candidate.targetHex : undefined,
        weaponId: candidate.weaponId,
        equipmentIds: (candidate.equipmentIds ?? []).filter((id) => equipmentIds.has(id)).slice(0, 8),
        ammoRequested:
          Number.isInteger(candidate.ammoRequested) && (candidate.ammoRequested ?? 0) > 0
            ? Math.min(candidate.ammoRequested!, 99)
            : undefined,
        payload: candidate.payload && typeof candidate.payload === "object" ? candidate.payload : undefined,
      };
    });
  }

  private async handleOrder(request: Request): Promise<Response> {
    const viewer = this.viewer(request);
    const intent = await readJson<OrderIntent>(request);
    if (!intent.unitId || typeof intent.unitId !== "string") {
      return errorResponse(400, "UNIT_REQUIRED", "unitId is required.");
    }
    const state = await this.getState();
    const round = intent.round ?? state.round;
    if (round < state.round || round > state.round + MAX_FUTURE_ROUNDS) {
      return errorResponse(409, "ROUND_OUT_OF_RANGE", "Scheduled order round is outside the supported window.");
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
    if (!intent.orderType || !allowedOrderTypes.has(intent.orderType)) {
      return errorResponse(400, "ORDER_TYPE_INVALID", "A supported order type is required.");
    }
    const definition = getUnitClass(deployment.definitionId);
    if (!definition.allowedOrders.includes(intent.orderType)) {
      return errorResponse(422, "ORDER_INELIGIBLE", "This unit class cannot use that order type.");
    }
    if (!getOrderTypeDefinition(intent.orderType as UnitOrder["orderType"]).executable) {
      return errorResponse(422, "ORDER_NOT_EXECUTABLE", "This order is catalogued but not executable in the current engine version.");
    }
    const route = intent.route?.filter(isCoordinate).slice(0, MAX_ROUTE_LENGTH) ?? [deployment.position];
    if (route.length === 0) route.push(deployment.position);
    if (!isCoordinate(route[0]) || route[0].q !== deployment.position.q || route[0].r !== deployment.position.r) {
      route.unshift(deployment.position);
    }
    if (!Number.isInteger(intent.facing) || intent.facing! < 0 || intent.facing! > 5) {
      return errorResponse(400, "FACING_INVALID", "Facing must be a value from 0 through 5.");
    }
    const weaponIds = new Set(deployment.weapons.map((weapon) => weapon.id));
    const equipmentIds = new Set(deployment.equipmentIds);
    const allowedActions = new Set(definition.allowedActions);
    const incidentalValidation = validateIncidentalActions(intent.incidentalActions);
    if (!incidentalValidation.legal) {
      return errorResponse(422, "ACTION_INELIGIBLE", incidentalValidation.reason);
    }
    let actions: StructuredAction[];
    let incidentalActions: StructuredAction[];
    try {
      actions = this.sanitiseActions(intent.actions, deployment.id, weaponIds, equipmentIds, allowedActions);
      incidentalActions = this.sanitiseActions(
        intent.incidentalActions,
        deployment.id,
        weaponIds,
        equipmentIds,
        allowedActions,
      );
    } catch (error) {
      return errorResponse(
        422,
        "ACTION_INELIGIBLE",
        error instanceof Error ? error.message : "Action failed rules validation.",
      );
    }
    if ([...actions, ...incidentalActions].filter((action) => action.type === "ATTACK").length > 1) {
      return errorResponse(422, "ATTACK_LIMIT", "A unit receives one attack activation per round.");
    }
    const visibleDeploymentIds = new Set(
      projectCampaignState(state, viewer, Date.now()).deployments.map((candidate) => candidate.id),
    );
    if (
      [...actions, ...incidentalActions].some(
        (action) => action.targetDeploymentId && !visibleDeploymentIds.has(action.targetDeploymentId),
      )
    ) {
      return errorResponse(422, "TARGET_NOT_VISIBLE", "The target is not present in the unit's current battlefield intelligence.");
    }
    const existingIndex = state.orders.findIndex(
      (candidate) => candidate.unitId === deployment.id && candidate.round === round && candidate.lifecycle !== "CANCELLED",
    );
    const existing = existingIndex >= 0 ? state.orders[existingIndex] : undefined;
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
      facing: intent.facing as Facing,
      actions,
      targets: actions.flatMap((action) => (action.targetDeploymentId ? [action.targetDeploymentId] : [])),
      equipmentUsed: [...new Set(actions.flatMap((action) => action.equipmentIds))],
      ammoUsed: Object.fromEntries(
        actions
          .filter((action) => action.weaponId && action.ammoRequested)
          .map((action) => [action.weaponId!, action.ammoRequested!]),
      ),
      incidentalActions,
      optionalRoleplayText:
        typeof intent.optionalRoleplayText === "string" ? intent.optionalRoleplayText.trim().slice(0, 500) : undefined,
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
    await this.ctx.storage.put(STATE_KEY, state);
    await this.ctx.storage.put(`event/${state.round}/${String(sequence).padStart(6, "0")}`, submittedEvent);
    this.broadcast("order-updated", state, { orderId: order.id, unitId: deployment.id });
    this.log("order.saved", { userId: viewer.userId, unitId: deployment.id, orderId: order.id, revision: order.revision });
    return json({ order, campaignVersion: state.version }, { status: existing ? 200 : 201 });
  }

  private async handleCancelOrder(request: Request, orderId: string): Promise<Response> {
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
    await this.ctx.storage.put(STATE_KEY, state);
    this.broadcast("order-cancelled", state, { orderId });
    return json({ orderId, lifecycle: order.lifecycle });
  }

  private async lockRound(now = Date.now()): Promise<CampaignRuntimeState> {
    const fallback = await this.getState();
    const state = await this.ctx.storage.transaction(async (transaction) => {
      const current = (await transaction.get<CampaignRuntimeState>(STATE_KEY)) ?? fallback;
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
      await transaction.put(STATE_KEY, updated);
      await transaction.put(`event/${updated.round}/${String(sequence).padStart(6, "0")}`, event);
      return updated;
    });
    await this.scheduleNextAlarm(state);
    this.broadcast("round-locked", state);
    this.log("round.locked", { round: state.round });
    return state;
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
    const nextState = await this.ctx.storage.transaction(async (transaction) => {
      const state = (await transaction.get<CampaignRuntimeState>(STATE_KEY)) ?? fallback;
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
      await transaction.put(`snapshot/${state.round}`, structuredClone(state));

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
      };
      output.state.resolutions[resolutionKey] = record;
      const completedRound = output.state.round;
      output.state.round += 1;
      output.state.phase = "PLANNING";
      output.state.clock = makeRoundClock(
        output.state.campaignId,
        output.state.round,
        now,
        state.clock.durationMs,
        state.clock.lockLeadMs || this.configuredLockLead(),
      );
      output.state.orders = output.state.orders.filter((order) => order.round >= output.state.round);
      const roundStarted: CampaignEvent = {
        eventId: `${output.state.campaignId}:${output.state.round}:0001:ROUND_STARTED`,
        campaignId: output.state.campaignId,
        round: output.state.round,
        sequence: 1,
        type: "ROUND_STARTED",
        payload: { previousRound: completedRound, deadline: output.state.clock.resolvesAt },
        timestamp: now,
        visibility: "PUBLIC",
      };
      output.state.events.push(roundStarted);
      output.state.version += 1;
      await transaction.put(STATE_KEY, output.state);
      await transaction.put(`resolution/${completedRound}`, record);
      for (const resolvedEvent of output.events) {
        await transaction.put(
          `event/${completedRound}/${String(resolvedEvent.sequence).padStart(6, "0")}`,
          resolvedEvent,
        );
      }
      await transaction.put(`event/${output.state.round}/000001`, roundStarted);
      for (const effect of output.persistentEffects) {
        await transaction.put(`pending-effect/${effect.idempotencyKey}`, effect);
      }
      committedRecord = record;
      return output.state;
    });

    if (!committedRecord) throw new Error("Resolution transaction completed without a record.");
    await this.scheduleNextAlarm(nextState);
    this.broadcast(duplicate ? "round-resolution-replayed" : "round-resolved", nextState, {
      resolutionKey: committedRecord.key,
      digest: committedRecord.stateDigest,
    });
    this.log("round.resolved", {
      round: committedRecord.round,
      resolutionKey: committedRecord.key,
      digest: committedRecord.stateDigest,
      duplicate,
    });
    return { state: nextState, record: committedRecord, duplicate };
  }

  private async handleManualResolve(request: Request): Promise<Response> {
    const viewer = this.viewer(request);
    if (!this.isOperator(viewer)) return errorResponse(403, "ADMIN_REQUIRED", "Campaign operator permission is required.");
    const state = await this.getState();
    const expectedHeader = request.headers.get("x-expected-round");
    const expectedRound = expectedHeader === null ? state.round : Number(expectedHeader);
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
    return json({ resolution: this.publicResolution(result.record), duplicate: result.duplicate, nextRound: result.state.round });
  }

  private async handleClock(request: Request): Promise<Response> {
    const viewer = this.viewer(request);
    if (!this.isOperator(viewer)) return errorResponse(403, "ADMIN_REQUIRED", "Campaign operator permission is required.");
    const intent = await readJson<ClockIntent>(request);
    const durationMs =
      intent.preset && intent.preset in CLOCK_PRESETS
        ? CLOCK_PRESETS[intent.preset]
        : Number.isInteger(intent.durationMs) && intent.durationMs! >= 0 && intent.durationMs! <= 86_400_000
          ? intent.durationMs!
          : undefined;
    if (durationMs === undefined) return errorResponse(400, "CLOCK_INVALID", "Choose a preset or a duration from 0 to 24 hours.");
    const state = await this.getState();
    if (state.phase !== "PLANNING") return errorResponse(409, "ROUND_NOT_PLANNING", "Clock can only change during planning.");
    state.clock = makeRoundClock(state.campaignId, state.round, Date.now(), durationMs, this.configuredLockLead());
    state.version += 1;
    await this.ctx.storage.put(STATE_KEY, state);
    await this.scheduleNextAlarm(state);
    this.broadcast("clock-updated", state);
    return json({ clock: state.clock, preset: intent.preset ?? "custom" });
  }

  private async handlePause(request: Request): Promise<Response> {
    const viewer = this.viewer(request);
    if (!this.isOperator(viewer)) return errorResponse(403, "ADMIN_REQUIRED", "Campaign operator permission is required.");
    const now = Date.now();
    const fallback = await this.getState();
    const { state, changed } = await this.ctx.storage.transaction(async (transaction) => {
      const current = (await transaction.get<CampaignRuntimeState>(STATE_KEY)) ?? fallback;
      const updated = pauseClock(current, now);
      if (updated === current) return { state: current, changed: false };
      const event = updated.events.at(-1);
      if (!event || event.type !== "CAMPAIGN_PAUSED") throw new Error("Pause transition did not emit its campaign event.");
      await transaction.put(STATE_KEY, updated);
      await transaction.put(`event/${updated.round}/${String(event.sequence).padStart(6, "0")}`, event);
      return { state: updated, changed: true };
    });
    await this.scheduleNextAlarm(state);
    if (changed) this.broadcast("campaign-paused", state);
    return json({ phase: state.phase, clock: state.clock });
  }

  private async handleResume(request: Request): Promise<Response> {
    const viewer = this.viewer(request);
    if (!this.isOperator(viewer)) return errorResponse(403, "ADMIN_REQUIRED", "Campaign operator permission is required.");
    const now = Date.now();
    const fallback = await this.getState();
    const { state, changed } = await this.ctx.storage.transaction(async (transaction) => {
      const current = (await transaction.get<CampaignRuntimeState>(STATE_KEY)) ?? fallback;
      const updated = resumeClock(current, now);
      if (updated === current) return { state: current, changed: false };
      const event = updated.events.at(-1);
      if (!event || event.type !== "CAMPAIGN_RESUMED") throw new Error("Resume transition did not emit its campaign event.");
      await transaction.put(STATE_KEY, updated);
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

  private handleWebSocket(request: Request): Response {
    const viewer = this.viewer(request);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const attachment: WebSocketAttachment = { userId: viewer.userId, side: viewer.side, role: viewer.role };
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, [`side:${viewer.side}`, `user:${viewer.userId}`]);
    server.send(JSON.stringify({ type: "connected", campaignId: this.campaignId() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    let state = await this.getState();
    if (state.phase === "PAUSED") return;
    const now = Date.now();
    const due = state.clock.schedule
      .filter((event) => event.runAt <= now)
      .sort((left, right) => left.runAt - right.runAt || left.type.localeCompare(right.type));
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
