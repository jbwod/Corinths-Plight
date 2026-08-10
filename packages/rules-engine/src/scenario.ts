import type {
  AxialCoord,
  CampaignDeployment,
  CampaignOutcome,
  CampaignReinforcementWave,
  CampaignRuntimeState,
  FactionSide,
  ObjectiveState,
} from "../../domain/src";

export interface ObjectiveCaptureResult {
  objectiveId: string;
  objectiveName: string;
  coord: AxialCoord;
  previousOwner: FactionSide;
  owner: "ALLIED" | "ENEMY";
  status: ObjectiveState["status"];
  occupantIds: string[];
}

export interface ScenarioRoundEndResult {
  objectives: ObjectiveState[];
  captures: ObjectiveCaptureResult[];
  outcome?: CampaignOutcome;
}

export interface ReinforcementArrival {
  waveId: string;
  deploymentIds: string[];
  callsigns: string[];
}

export interface ScenarioReinforcementResult {
  deployments: CampaignDeployment[];
  reinforcementWaves: CampaignReinforcementWave[];
  arrivals: ReinforcementArrival[];
}

function samePosition(left: AxialCoord, right: AxialCoord): boolean {
  return left.q === right.q && left.r === right.r;
}

function isActiveOnMap(deployment: CampaignDeployment): boolean {
  return deployment.status === "ACTIVE" && (deployment.locationState ?? "ON_MAP") === "ON_MAP";
}

function objectiveSummaries(objectives: ObjectiveState[]): CampaignOutcome["objectives"] {
  return objectives
    .map(({ id, owner, status }) => ({ id, owner, status }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function outcome(
  state: Pick<CampaignRuntimeState, "round">,
  objectives: ObjectiveState[],
  result: CampaignOutcome["result"],
  reason: CampaignOutcome["reason"],
): CampaignOutcome {
  return {
    result,
    round: state.round,
    reason,
    objectives: objectiveSummaries(objectives),
    rewards: {
      serviceHistory: "RECORDED",
      requisition: {
        status: "BALANCE_REQUIRED",
        amount: null,
        rulesDecisionId: "RC-V5-016",
      },
    },
  };
}

/**
 * Applies the declarative scenario policy after all movement and combat for a
 * round. Input order cannot affect captures, summaries, or the terminal result.
 */
export function evaluateScenarioRoundEnd(
  state: Pick<
    CampaignRuntimeState,
    "round" | "deployments" | "objectives" | "scenarioPolicy" | "outcome"
  >,
): ScenarioRoundEndResult {
  const policy = state.scenarioPolicy;
  if (!policy) return { objectives: state.objectives, captures: [], outcome: state.outcome };
  if (policy.policyId !== "HOLD_PRIMARY_OBJECTIVE" || policy.version !== 1) {
    throw new Error("Unsupported campaign scenario policy.");
  }

  const objectives = state.objectives
    .map((objective) => structuredClone(objective))
    .sort((left, right) => left.id.localeCompare(right.id));
  const objectiveIds = new Set(objectives.map((objective) => objective.id));
  const capturableIds = new Set(policy.capturableObjectiveIds);
  if (
    objectiveIds.size !== objectives.length ||
    capturableIds.size !== policy.capturableObjectiveIds.length ||
    !objectiveIds.has(policy.primaryObjectiveId) ||
    !capturableIds.has(policy.primaryObjectiveId) ||
    [...capturableIds].some((id) => !objectiveIds.has(id))
  ) {
    throw new Error("Campaign scenario policy references invalid objectives.");
  }
  const finalRound = policy.startRound + policy.maxRounds - 1;
  if (
    !Number.isSafeInteger(policy.startRound) ||
    policy.startRound < 1 ||
    !Number.isSafeInteger(policy.maxRounds) ||
    policy.maxRounds < 1 ||
    !Number.isSafeInteger(finalRound)
  ) {
    throw new Error("Campaign scenario policy has an invalid duration.");
  }
  if (state.outcome || state.round < policy.startRound) {
    return { objectives, captures: [], outcome: state.outcome };
  }

  const deployments = [...state.deployments].sort((left, right) => left.id.localeCompare(right.id));
  const captures: ObjectiveCaptureResult[] = [];
  for (const objective of objectives.filter(({ id }) => capturableIds.has(id))) {
    const occupants = deployments.filter(
      (deployment) =>
        isActiveOnMap(deployment) &&
        (deployment.side === "ALLIED" || deployment.side === "ENEMY") &&
        samePosition(deployment.position, objective.coord),
    );
    const allied = occupants.filter(({ side }) => side === "ALLIED");
    const enemy = occupants.filter(({ side }) => side === "ENEMY");
    if ((allied.length > 0) === (enemy.length > 0)) continue;
    const owner = allied.length > 0 ? "ALLIED" : "ENEMY";
    if (objective.owner === owner) continue;
    const previousOwner = objective.owner;
    objective.owner = owner;
    captures.push({
      objectiveId: objective.id,
      objectiveName: objective.name,
      coord: { ...objective.coord },
      previousOwner,
      owner,
      status: objective.status,
      occupantIds: (allied.length > 0 ? allied : enemy).map(({ id }) => id),
    });
  }

  const primary = objectives.find(({ id }) => id === policy.primaryObjectiveId)!;
  const alliedSurvivors = deployments.filter(
    ({ side, status }) => side === "ALLIED" && status !== "DESTROYED" && status !== "WITHDRAWN",
  );
  if (alliedSurvivors.length === 0) {
    return {
      objectives,
      captures,
      outcome: outcome(state, objectives, "DEFEAT", "ALL_ALLIED_DEPLOYMENTS_LOST"),
    };
  }
  if (primary.owner === "ENEMY") {
    return {
      objectives,
      captures,
      outcome: outcome(state, objectives, "DEFEAT", "PRIMARY_OBJECTIVE_LOST"),
    };
  }
  if (state.round >= finalRound) {
    return {
      objectives,
      captures,
      outcome: primary.owner === "ALLIED"
        ? outcome(state, objectives, "VICTORY", "FINAL_ROUND_PRIMARY_HELD")
        : outcome(state, objectives, "DEFEAT", "FINAL_ROUND_CONDITIONS_NOT_MET"),
    };
  }
  return { objectives, captures };
}

/** Activates authored reserve deployments after the completed round. */
export function applyScenarioReinforcements(
  state: Pick<CampaignRuntimeState, "round" | "deployments" | "reinforcementWaves" | "outcome">,
): ScenarioReinforcementResult {
  const deployments = state.deployments.map((deployment) => structuredClone(deployment));
  const waves = (state.reinforcementWaves ?? []).map((wave) => structuredClone(wave));
  if (state.outcome) return { deployments, reinforcementWaves: waves, arrivals: [] };

  const byId = new Map(deployments.map((deployment) => [deployment.id, deployment]));
  const arrivals: ReinforcementArrival[] = [];
  for (const wave of waves
    .filter((candidate) => candidate.status === "PENDING" && candidate.arrivesAfterRound === state.round)
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const arriving = wave.deploymentIds.map((id) => byId.get(id));
    if (arriving.some((deployment) => !deployment)) throw new Error(`Scenario wave ${wave.id} references a missing deployment.`);
    for (const deployment of arriving as CampaignDeployment[]) {
      if (deployment.side !== "ENEMY" || deployment.status !== "READY" || deployment.locationState !== "RESERVE") {
        throw new Error(`Scenario wave ${wave.id} contains a deployment that is not an Enemy reserve.`);
      }
      deployment.status = "ACTIVE";
      deployment.locationState = "ON_MAP";
    }
    wave.status = "ARRIVED";
    arrivals.push({
      waveId: wave.id,
      deploymentIds: wave.deploymentIds.slice(),
      callsigns: (arriving as CampaignDeployment[]).map((deployment) => deployment.callsign),
    });
  }
  return { deployments, reinforcementWaves: waves, arrivals };
}
