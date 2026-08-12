import type {
  AxialCoord,
  BattlefieldHex,
  CampaignDeployment,
  CampaignEvent,
  ObjectiveState,
} from "../../packages/domain/src";

export interface CampaignReplayStartingState {
  round: number;
  map: BattlefieldHex[];
  deployments: CampaignDeployment[];
  objectives: ObjectiveState[];
}

export interface CampaignReplayFrame {
  index: number;
  event?: CampaignEvent;
  deployments: CampaignDeployment[];
  objectives: ObjectiveState[];
  actorId?: string;
  targetId?: string;
  targetHex?: AxialCoord;
  route?: AxialCoord[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function coord(value: unknown): AxialCoord | undefined {
  const candidate = record(value);
  return typeof candidate.q === "number" && typeof candidate.r === "number"
    ? { q: candidate.q, r: candidate.r }
    : undefined;
}

function targetId(payload: Record<string, unknown>): string | undefined {
  return typeof payload.targetId === "string"
    ? payload.targetId
    : typeof payload.targetDeploymentId === "string"
      ? payload.targetDeploymentId
      : typeof payload.cargoDeploymentId === "string"
        ? payload.cargoDeploymentId
        : undefined;
}

function applyEvent(
  deployments: CampaignDeployment[],
  objectives: ObjectiveState[],
  event: CampaignEvent,
): void {
  const payload = record(event.payload);
  const actor = event.actor ? deployments.find((unit) => unit.id === event.actor) : undefined;
  const target = targetId(payload)
    ? deployments.find((unit) => unit.id === targetId(payload))
    : undefined;
  switch (event.type) {
    case "UNIT_MOVED": {
      const destination = coord(payload.to);
      if (actor && destination) actor.position = destination;
      break;
    }
    case "DAMAGE_APPLIED":
      if (actor && typeof payload.after === "number") actor.currentHealth = payload.after;
      break;
    case "UNIT_DESTROYED":
      if (actor) {
        actor.currentHealth = 0;
        actor.status = "DESTROYED";
        actor.locationState = "DESTROYED";
      }
      break;
    case "UNIT_HEALED":
      if (target && typeof payload.after === "number") target.currentHealth = payload.after;
      break;
    case "UNIT_REPAIRED":
      if (target && typeof payload.after === "number") target.currentHealth = payload.after;
      if (target && payload.repairKind === "SUBSYSTEM" && typeof payload.subsystemId === "string") {
        target.subsystems = target.subsystems?.map((subsystem) =>
          subsystem.subsystemId === payload.subsystemId
            ? { subsystemId: subsystem.subsystemId, state: "OPERATIONAL" }
            : subsystem
        );
      }
      break;
    case "LIGHT_AT_EXPENDED":
      if (actor && typeof payload.ammunitionAfter === "number") {
        actor.ammunition["weapon-light-at"] = payload.ammunitionAfter;
      }
      break;
    case "UNIT_DUG_IN":
      if (target ?? actor) (target ?? actor)!.statuses = [...new Set([...(target ?? actor)!.statuses, "DUG_IN"])];
      break;
    case "UNIT_GARRISONED":
      if (actor) actor.statuses = [...new Set([...actor.statuses, "GARRISONED"])];
      break;
    case "UNIT_LEFT_GARRISON":
      if (actor) actor.statuses = actor.statuses.filter((status) => status !== "GARRISONED");
      break;
    case "UNIT_DUG_OUT":
      if (actor) actor.statuses = actor.statuses.filter((status) => status !== "DUG_IN");
      break;
    case "ARTILLERY_DEPLOYED":
      if (actor) {
        actor.artilleryDeployment = "DEPLOYED";
        actor.statuses = [...actor.statuses.filter((status) => status !== "PACKED"), "DEPLOYED"];
      }
      break;
    case "ARTILLERY_PACKED":
      if (actor) {
        actor.artilleryDeployment = "PACKED";
        actor.statuses = [...actor.statuses.filter((status) => status !== "DEPLOYED"), "PACKED"];
      }
      break;
    case "CARGO_LOADED":
      if (actor && target) {
        target.position = { ...actor.position };
        target.locationState = "EMBARKED";
      }
      break;
    case "CARGO_UNLOADED":
    case "AIR_DROP_COMPLETED":
      if (actor && target) {
        target.position = coord(payload.targetHex) ?? { ...actor.position };
        target.locationState = "ON_MAP";
      }
      break;
    case "AEROSPACE_LANDED":
      if (actor) actor.statuses = [...new Set([...actor.statuses, "LANDED"])];
      break;
    case "AEROSPACE_TOOK_OFF":
      if (actor) actor.statuses = actor.statuses.filter((status) => status !== "LANDED");
      break;
    case "OBJECTIVE_CAPTURED": {
      const objectiveId = typeof payload.objectiveId === "string" ? payload.objectiveId : undefined;
      const owner = payload.owner ?? payload.to;
      const objective = objectiveId ? objectives.find((candidate) => candidate.id === objectiveId) : undefined;
      if (objective && (owner === "ALLIED" || owner === "ENEMY" || owner === "NEUTRAL")) objective.owner = owner;
      break;
    }
  }
}

export function buildCampaignReplayFrames(
  startingState: CampaignReplayStartingState,
  events: CampaignEvent[],
): CampaignReplayFrame[] {
  const deployments = structuredClone(startingState.deployments);
  const objectives = structuredClone(startingState.objectives);
  const frames: CampaignReplayFrame[] = [{ index: 0, deployments: structuredClone(deployments), objectives: structuredClone(objectives) }];
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence || (left.eventId < right.eventId ? -1 : 1));
  for (const event of ordered) {
    applyEvent(deployments, objectives, event);
    const payload = record(event.payload);
    frames.push({
      index: frames.length,
      event,
      deployments: structuredClone(deployments),
      objectives: structuredClone(objectives),
      actorId: event.actor,
      targetId: targetId(payload),
      targetHex: coord(payload.targetHex) ?? coord(payload.to),
      route: Array.isArray(payload.route) ? payload.route.map(coord).filter((item): item is AxialCoord => item !== undefined) : undefined,
    });
  }
  return frames;
}
