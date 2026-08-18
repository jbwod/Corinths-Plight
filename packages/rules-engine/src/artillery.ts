import type { ArtilleryDeploymentState, Facing, TargetDomain } from "../../domain/src";

export const V5_ARTILLERY_MINIMUM_RANGE = 1;
export const V5_ARTILLERY_MAXIMUM_RANGE = 4;
export const V5_ARTILLERY_FIRE_SUPPLY_COST = 1;
export const V5_FUNNEL_FORCED_DISTANCE_QUARTERS = 2;

export interface DeferredArtilleryResult {
  legal: false;
  reason: string;
  supplySpent: 0;
  supplyAfter: number;
  ruleIds: string[];
}

export interface ExecutableArtilleryResult {
  legal: true;
  supplySpent: 1;
  supplyAfter: number;
  ruleIds: string[];
  applicationProfileId: "public-v1-artillery-funnel@1";
}

export type ArtilleryExecutionResult = DeferredArtilleryResult | ExecutableArtilleryResult;

export interface FunnelExecutionInput {
  deploymentState: ArtilleryDeploymentState;
  targetExists: boolean;
  targetHostile: boolean;
  targetOperational: boolean;
  targetOnMap: boolean;
  targetMovedThisRound: boolean;
  distance: number;
  chosenDirection?: Facing;
  supplyAvailable: number;
}

/**
 * Validates V5 Funnel under the public-v1 whole-hex application rule. V5's
 * half-range forced movement becomes one adjacent displacement before combat;
 * the resolver rejects illegal/off-map/full destinations and never chain-pushes.
 */
export function validateFunnelExecution(input: FunnelExecutionInput): ArtilleryExecutionResult {
  const rejected = (reason: string): DeferredArtilleryResult => ({
    legal: false,
    reason,
    supplySpent: 0,
    supplyAfter: input.supplyAvailable,
    ruleIds: ["RC-UNIT-004", "RC-V5-011"],
  });
  if (!Number.isInteger(input.supplyAvailable) || input.supplyAvailable < 0) {
    return rejected("Funnel requires a non-negative whole Small Supply count.");
  }
  if (input.deploymentState !== "DEPLOYED") return rejected("Artillery must be deployed before using Funnel.");
  if (!input.targetExists) return rejected("Funnel requires one target unit.");
  if (!input.targetHostile) return rejected("Funnel requires a hostile target unit.");
  if (!input.targetOperational || !input.targetOnMap) {
    return rejected("Funnel requires an operational target on the battlefield.");
  }
  if (!input.targetMovedThisRound) return rejected("Funnel can target only a unit that moved this round.");
  if (!Number.isInteger(input.distance) || input.distance < V5_ARTILLERY_MINIMUM_RANGE || input.distance > V5_ARTILLERY_MAXIMUM_RANGE) {
    return rejected("Funnel target must be at Artillery Range 1-4.");
  }
  if (!Number.isInteger(input.chosenDirection) || input.chosenDirection! < 0 || input.chosenDirection! > 5) {
    return rejected("Funnel requires a player-chosen hex direction from 0 through 5.");
  }
  if (input.supplyAvailable < V5_ARTILLERY_FIRE_SUPPLY_COST) {
    return rejected("Funnel requires one Small Supply under RC-V5-011.");
  }
  return {
    legal: true,
    supplySpent: 1,
    supplyAfter: input.supplyAvailable - 1,
    ruleIds: ["RC-UNIT-004", "RC-V5-011", "public-v1-artillery-funnel@1"],
    applicationProfileId: "public-v1-artillery-funnel@1",
  };
}

export type OrbitBand = "LOW" | "HIGH";

export interface ArtilleryAntiOrbitalInput {
  deploymentState: ArtilleryDeploymentState;
  targetDomain: TargetDomain;
  targetOrbitBand?: OrbitBand;
  distance: number;
  supplyAvailable: number;
}

/**
 * Keeps V5's known anti-orbital envelope visible without creating a partial
 * orbital damage system. A legal low-orbit declaration is still blocked by
 * DEC-012 until governed hull durability and combat state exist.
 */
export function validateArtilleryAntiOrbitalExecution(
  input: ArtilleryAntiOrbitalInput,
): DeferredArtilleryResult {
  const rejected = (reason: string): DeferredArtilleryResult => ({
    legal: false,
    reason,
    supplySpent: 0,
    supplyAfter: input.supplyAvailable,
    ruleIds: ["RC-UNIT-004", "RC-V5-011", "RC-V5-013", "DEC-012"],
  });
  if (!Number.isInteger(input.supplyAvailable) || input.supplyAvailable < 0) {
    return rejected("Artillery fire requires a non-negative whole Small Supply count.");
  }
  if (input.deploymentState !== "DEPLOYED") {
    return rejected("Artillery must be deployed before direct anti-orbital fire.");
  }
  if (input.targetDomain !== "ORBITAL") {
    return rejected("V5 Artillery can direct-damage only an Orbital target.");
  }
  if (input.targetOrbitBand !== "LOW") {
    return rejected("V5 Artillery can direct-damage only an Orbital in low orbit.");
  }
  if (!Number.isInteger(input.distance) || input.distance < V5_ARTILLERY_MINIMUM_RANGE || input.distance > V5_ARTILLERY_MAXIMUM_RANGE) {
    return rejected("Low-orbit target must be at Artillery Range 1-4.");
  }
  if (input.supplyAvailable < V5_ARTILLERY_FIRE_SUPPLY_COST) {
    return rejected("Direct anti-orbital fire requires one Small Supply under RC-V5-011.");
  }
  return rejected(
    "Direct anti-orbital fire is deferred by DEC-012 until governed orbital hull durability and combat state exist.",
  );
}
