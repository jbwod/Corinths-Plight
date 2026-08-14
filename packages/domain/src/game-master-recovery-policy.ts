/**
 * Exceptional operator correction used only by the globally-authorized Game
 * Master recovery command. This is an application policy, not a V5 combat or
 * repair rule: ordinary gameplay can never invoke it.
 */
export const GAME_MASTER_RECOVERY_POLICY_ID = "game-master-recovery@1" as const;

export const GAME_MASTER_RECOVERY_POLICY = Object.freeze({
  id: GAME_MASTER_RECOVERY_POLICY_ID,
  authority: "GLOBAL_GAME_MASTER",
  operation: "EXCEPTIONAL_ADMIN_CORRECTION",
  requiredCampaignState: "PAUSED_FROM_PLANNING",
  deploymentStatus: "ACTIVE",
  locationState: "ON_MAP",
  health: "MAXIMUM",
  ammunition: "MAXIMUM",
  cooldowns: "CLEARED",
  transientStatuses: "CLEARED",
  subsystemState: "OPERATIONAL",
  persistentUnitStatus: "DEPLOYED",
} as const);
