import type {
  CampaignDeployment,
  CampaignEvent,
  CampaignRuntimeState,
  CampaignView,
  ViewerContext,
} from "../../domain/src";
import { coordKey, visibleHexes } from "./hex";
import { getTacticalUnitClass } from "./tactical-unit-catalogue";

function deploymentTags(deployment: CampaignDeployment): string[] {
  if (deployment.tags) return deployment.tags;
  try {
    return getTacticalUnitClass(deployment.definitionId).tags;
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
    events,
    viewer,
    serverTime,
  };
}
