import type {
  CampaignDeploymentAggregateDto,
  CampaignDeployment,
  CampaignEvent,
  CampaignRuntimeState,
  CampaignSummaryDto,
  CampaignView,
  DeploymentStatus,
  FactionSide,
  ViewerContext,
} from "../../domain/src";
import { coordKey, visibleHexes } from "./hex";
import { getUnitClass } from "./catalogue";

function deploymentTags(deployment: CampaignDeployment): string[] {
  if (deployment.tags) return deployment.tags;
  try {
    return getUnitClass(deployment.definitionId).tags;
  } catch {
    return [];
  }
}

function isGroundDeployment(deployment: CampaignDeployment): boolean {
  const tags = deploymentTags(deployment);
  return !tags.some((tag) => tag === "AEROSPACE" || tag === "ATMO_FLIGHT" || tag === "VTOL");
}

export function projectEvents(events: CampaignEvent[], viewer: ViewerContext): CampaignEvent[] {
  return events.filter((event) => {
    if (viewer.role === "ADMIN") return true;
    if (event.visibility === "PUBLIC") return true;
    if (viewer.side === "ALLIED" && event.visibility === "ALLIED") return true;
    if (viewer.side === "ENEMY" && event.visibility === "ENEMY") return true;
    return false;
  });
}

export function projectCampaignState(
  state: CampaignRuntimeState,
  viewer: ViewerContext,
  serverTime: number,
): CampaignView {
  const observers = state.deployments.filter(
    (deployment) =>
      deployment.side === viewer.side &&
      deployment.status !== "DESTROYED" &&
      (deployment.locationState ?? "ON_MAP") === "ON_MAP",
  );
  const visible = viewer.role === "ADMIN" ? new Set(state.map.map((hex) => coordKey(hex.coord))) : visibleHexes(observers, state.map);
  const groundVisible = viewer.role === "ADMIN"
    ? visible
    : visibleHexes(
        observers.filter((deployment) => !deploymentTags(deployment).includes("CANNOT_SPOT_GROUND")),
        state.map,
      );
  const deployments = state.deployments.filter(
    (deployment) => {
      const location = deployment.locationState ?? "ON_MAP";
      if (location === "RESERVE") return false;
      if (deployment.side === viewer.side) return true;
      const domainVisibility = isGroundDeployment(deployment) ? groundVisible : visible;
      return location === "ON_MAP" && domainVisibility.has(coordKey(deployment.position));
    },
  );
  const map = state.map.map((hex) => ({
    ...hex,
    visibility: visible.has(coordKey(hex.coord))
      ? ("VISIBLE" as const)
      : hex.visibility === "OBSERVED"
        ? ("OBSERVED" as const)
        : ("UNKNOWN" as const),
    ...(viewer.role !== "ADMIN" && !visible.has(coordKey(hex.coord)) && hex.visibility !== "OBSERVED"
      ? {
          control: "NEUTRAL" as const,
          objectiveId: undefined,
          structureIds: [],
          environment: [],
        }
      : {}),
  }));
  const projectedHexes = new Map(map.map((hex) => [coordKey(hex.coord), hex] as const));
  const objectives = state.objectives.filter((objective) =>
    viewer.role === "ADMIN" || projectedHexes.get(coordKey(objective.coord))?.visibility !== "UNKNOWN",
  );
  const orders = state.orders.filter(
    (order) => {
      if (viewer.role === "ADMIN") return true;
      const deployment = deployments.find((candidate) => candidate.id === order.unitId);
      if (!deployment || deployment.side !== viewer.side) return false;
      return order.lifecycle !== "DRAFT" || order.submittedBy === viewer.userId;
    },
  );
  const allDeploymentIds = new Set(state.deployments.map((deployment) => deployment.id));
  const visibleDeploymentIds = new Set(deployments.map((deployment) => deployment.id));
  const events = projectEvents(state.events, viewer).filter(
    (event) =>
      viewer.role === "ADMIN" ||
      !event.actor ||
      !allDeploymentIds.has(event.actor) ||
      visibleDeploymentIds.has(event.actor),
  );
  const {
    resolutions: _resolutions,
    pendingPersistentEffects: _effects,
    reinforcementWaves: _reinforcementWaves,
    ...publicState
  } = state;
  void _resolutions;
  void _effects;
  void _reinforcementWaves;
  return {
    ...publicState,
    map,
    deployments,
    orders,
    objectives,
    events,
    viewer,
    serverTime,
  };
}

const deploymentStatuses: DeploymentStatus[] = ["READY", "ACTIVE", "IMMOBILISED", "DESTROYED", "WITHDRAWN"];

function deploymentAggregate(
  deployments: CampaignDeployment[],
  side: FactionSide,
  visibility: CampaignDeploymentAggregateDto["visibility"],
): CampaignDeploymentAggregateDto {
  const selected = deployments.filter((deployment) => deployment.side === side);
  const byStatus = Object.fromEntries(
    deploymentStatuses.map((status) => [status, selected.filter((deployment) => deployment.status === status).length]),
  ) as Record<DeploymentStatus, number>;
  return { visibility, total: selected.length, byStatus };
}

/**
 * Produces the small read model used by strategic navigation. It deliberately
 * derives from the normal fog projection so it cannot become a second,
 * less-restrictive campaign visibility policy.
 */
export function projectCampaignSummary(
  state: CampaignRuntimeState,
  viewer: ViewerContext,
  serverTime: number,
): CampaignSummaryDto {
  const projected = projectCampaignState(state, viewer, serverTime);
  return {
    campaignId: projected.campaignId,
    campaignName: projected.campaignName,
    planetName: projected.planetName,
    rulesetVersion: projected.rulesetVersion,
    round: projected.round,
    phase: projected.phase,
    version: projected.version,
    clock: {
      durationMs: projected.clock.durationMs,
      roundStartedAt: projected.clock.roundStartedAt,
      lockAt: projected.clock.lockAt,
      resolvesAt: projected.clock.resolvesAt,
      ...(projected.clock.pausedAt === undefined ? {} : { pausedAt: projected.clock.pausedAt }),
    },
    objectives: projected.objectives.map((objective) => ({ ...objective })),
    viewerUnits: projected.deployments
      .filter((deployment) => deployment.ownerId === viewer.userId)
      .map((deployment) => ({
        id: deployment.id,
        ...(deployment.persistentUnitId ? { persistentUnitId: deployment.persistentUnitId } : {}),
        definitionId: deployment.definitionId,
        callsign: deployment.callsign,
        status: deployment.status,
        locationState: deployment.locationState ?? "ON_MAP",
        position: { ...deployment.position },
        currentHealth: deployment.currentHealth,
        maxHealth: deployment.stats.maxHealth,
      })),
    deployments: {
      allied: deploymentAggregate(
        projected.deployments,
        "ALLIED",
        viewer.role === "ADMIN" || viewer.side === "ALLIED" ? "EXACT" : "VISIBLE_ONLY",
      ),
      enemy: deploymentAggregate(
        projected.deployments,
        "ENEMY",
        viewer.role === "ADMIN" || viewer.side === "ENEMY" ? "EXACT" : "VISIBLE_ONLY",
      ),
    },
    viewer: projected.viewer,
    serverTime: projected.serverTime,
  };
}
