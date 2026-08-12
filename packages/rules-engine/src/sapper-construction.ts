export interface SapperBuildProfile {
  capacity: number;
  supplyPerAction: number;
  progressPerAction: number;
  reloadResource: "GENERAL_SUPPLY";
  reloadCost: number;
}

export interface SapperBuildState {
  buildSupply: number;
  generalSupply: number;
  projectProgress: number;
}

export interface SapperBuildResult {
  legal: boolean;
  reason?: string;
  state: SapperBuildState;
  supplySpent: number;
  progressAdded: number;
}

export const SOURCE_SAPPER_BUILD_PROFILE: Readonly<SapperBuildProfile> = Object.freeze({
  capacity: 6,
  supplyPerAction: 3,
  progressPerAction: 3,
  reloadResource: "GENERAL_SUPPLY",
  reloadCost: 1,
});

function validProfile(profile: SapperBuildProfile): boolean {
  return Number.isSafeInteger(profile.capacity) && profile.capacity > 0 &&
    Number.isSafeInteger(profile.supplyPerAction) && profile.supplyPerAction > 0 &&
    profile.supplyPerAction <= profile.capacity &&
    Number.isSafeInteger(profile.progressPerAction) && profile.progressPerAction > 0 &&
    profile.reloadResource === "GENERAL_SUPPLY" &&
    Number.isSafeInteger(profile.reloadCost) && profile.reloadCost > 0;
}

function validState(profile: SapperBuildProfile, state: SapperBuildState): boolean {
  return Number.isSafeInteger(state.buildSupply) &&
    state.buildSupply >= 0 &&
    state.buildSupply <= profile.capacity &&
    Number.isSafeInteger(state.generalSupply) &&
    state.generalSupply >= 0 &&
    Number.isSafeInteger(state.projectProgress) &&
    state.projectProgress >= 0;
}

function rejected(state: SapperBuildState, reason: string): SapperBuildResult {
  return {
    legal: false,
    reason,
    state: { ...state },
    supplySpent: 0,
    progressAdded: 0,
  };
}

/**
 * Source-exact companion construction accounting. This reducer deliberately
 * does not select a structure, action economy, target hex, or completion
 * threshold because those rules remain outside the Sapper class row.
 */
export function performSapperBuildAction(
  state: SapperBuildState,
  profile: SapperBuildProfile = SOURCE_SAPPER_BUILD_PROFILE,
): SapperBuildResult {
  if (!validProfile(profile)) return rejected(state, "Sapper build profile is invalid.");
  if (!validState(profile, state)) return rejected(state, "Sapper build state is invalid.");
  if (state.buildSupply < profile.supplyPerAction) {
    return rejected(state, `Sapper construction requires ${profile.supplyPerAction} Build Supply.`);
  }
  return {
    legal: true,
    state: {
      ...state,
      buildSupply: state.buildSupply - profile.supplyPerAction,
      projectProgress: state.projectProgress + profile.progressPerAction,
    },
    supplySpent: profile.supplyPerAction,
    progressAdded: profile.progressPerAction,
  };
}

/** Restores the six-point Sapper pool for one General Supply crate. */
export function reloadSapperBuildSupply(
  state: SapperBuildState,
  profile: SapperBuildProfile = SOURCE_SAPPER_BUILD_PROFILE,
): SapperBuildResult {
  if (!validProfile(profile)) return rejected(state, "Sapper build profile is invalid.");
  if (!validState(profile, state)) return rejected(state, "Sapper build state is invalid.");
  if (state.buildSupply === profile.capacity) return rejected(state, "Sapper Build Supply is already full.");
  if (state.generalSupply < profile.reloadCost) {
    return rejected(state, `Reload requires ${profile.reloadCost} General Supply crate.`);
  }
  return {
    legal: true,
    state: {
      ...state,
      buildSupply: profile.capacity,
      generalSupply: state.generalSupply - profile.reloadCost,
    },
    supplySpent: profile.reloadCost,
    progressAdded: 0,
  };
}
