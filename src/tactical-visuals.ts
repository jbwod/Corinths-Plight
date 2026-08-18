import type { CampaignDeployment, UnitOrder } from "../packages/domain/src";

export type TacticalSpriteState = "IDLE" | "MOVE" | "ATTACK" | "SUPPORT" | "DAMAGED";

export interface TacticalSpriteMotion {
  translateX: number;
  translateY: number;
  rotation: number;
  scale: number;
  opacity: number;
}
export type TacticalFormationRole = "SUPPORT" | "ARMOUR" | "INFANTRY" | "AIR";

export interface TacticalSpriteGroupMember {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  movePhase: 0 | 1;
}

const ATTACK_ACTIONS = new Set([
  "ATTACK", "ASSAULT", "BOMBARDMENT", "AIR_SUPPORT", "PLACE_DELAYED_CHARGE", "DETONATE_DELAYED_CHARGE",
]);

const SUPPORT_ACTIONS = new Set([
  "RECRUIT_IRREGULAR", "HEAL", "REPAIR", "CREW_REPAIR", "RESUPPLY", "RELOAD", "LOAD", "UNLOAD",
  "AIRDROP", "LAND", "TAKE_OFF", "REARM_AEROSPACE", "DIG_IN", "ARTILLERY_DIG_IN", "CONSTRUCT",
  "SAPPER_CONSTRUCT", "TRENCH_UPGRADE", "DEPLOY", "PACK_UP", "GARRISON", "SCAN", "DEPLOY_DRONE",
]);

const FORMATION_SLOTS: Readonly<Record<number, readonly { x: number; y: number }[]>> = {
  1: [{ x: 0, y: 0 }],
  2: [{ x: -13, y: -5 }, { x: 13, y: 5 }],
  3: [{ x: 0, y: -16 }, { x: -16, y: 10 }, { x: 16, y: 10 }],
  4: [{ x: -15, y: -13 }, { x: 15, y: -13 }, { x: -15, y: 13 }, { x: 15, y: 13 }],
  5: [{ x: 0, y: -18 }, { x: -18, y: -6 }, { x: 18, y: -6 }, { x: -11, y: 16 }, { x: 11, y: 16 }],
  6: [{ x: -18, y: -14 }, { x: 0, y: -16 }, { x: 18, y: -14 }, { x: -18, y: 13 }, { x: 0, y: 17 }, { x: 18, y: 13 }],
  7: [{ x: 0, y: -19 }, { x: -18, y: -12 }, { x: 18, y: -12 }, { x: -20, y: 8 }, { x: 0, y: 2 }, { x: 20, y: 8 }, { x: 0, y: 19 }],
  8: [{ x: -18, y: -17 }, { x: 0, y: -19 }, { x: 18, y: -17 }, { x: -21, y: 1 }, { x: 21, y: 1 }, { x: -16, y: 18 }, { x: 0, y: 15 }, { x: 16, y: 18 }],
  9: [{ x: -19, y: -18 }, { x: 0, y: -20 }, { x: 19, y: -18 }, { x: -21, y: 0 }, { x: 0, y: 0 }, { x: 21, y: 0 }, { x: -18, y: 18 }, { x: 0, y: 20 }, { x: 18, y: 18 }],
};

const SINGLE_SPRITE_GROUP = [
  { x: 0, y: 0, scale: 1, rotation: 0, movePhase: 0 },
] as const satisfies readonly TacticalSpriteGroupMember[];

const THREE_SPRITE_BROOD = [
  { x: 0, y: -.2, scale: .7, rotation: 0, movePhase: 0 },
  { x: -.23, y: .19, scale: .7, rotation: -.07, movePhase: 1 },
  { x: .23, y: .19, scale: .7, rotation: .07, movePhase: 0 },
] as const satisfies readonly TacticalSpriteGroupMember[];

const DRONE_SPRITE_BROOD = [
  { x: 0, y: -.25, scale: .52, rotation: 0, movePhase: 0 },
  { x: -.26, y: -.06, scale: .52, rotation: -.09, movePhase: 1 },
  { x: .26, y: -.06, scale: .52, rotation: .09, movePhase: 0 },
  { x: -.18, y: .25, scale: .52, rotation: -.05, movePhase: 0 },
  { x: .18, y: .25, scale: .52, rotation: .05, movePhase: 1 },
] as const satisfies readonly TacticalSpriteGroupMember[];

const SWARM_SPRITE_GROUPS: Readonly<Record<string, readonly TacticalSpriteGroupMember[]>> = {
  "enemy-bug-drone": DRONE_SPRITE_BROOD,
  "enemy-bug-burrower": THREE_SPRITE_BROOD,
  "enemy-bug-flyer": THREE_SPRITE_BROOD,
  "enemy-bug-spitter": THREE_SPRITE_BROOD,
  "enemy-bug-warrior": THREE_SPRITE_BROOD,
};

export function tacticalSpriteGroupLayout(definitionId: string): readonly TacticalSpriteGroupMember[] {
  return SWARM_SPRITE_GROUPS[definitionId] ?? SINGLE_SPRITE_GROUP;
}

export function tacticalSpriteGroupFrame(
  frame: number,
  state: TacticalSpriteState,
  movePhase: TacticalSpriteGroupMember["movePhase"],
): number {
  if (state !== "MOVE" || movePhase === 0) return frame;
  if (frame === 1) return 2;
  return frame === 2 ? 1 : frame;
}

export function tacticalFormationLayout(count: number): readonly { x: number; y: number }[] {
  const bounded = Math.max(1, Math.floor(count));
  if (bounded <= 9) return FORMATION_SLOTS[bounded]!;
  const columns = Math.ceil(Math.sqrt(bounded));
  const rows = Math.ceil(bounded / columns);
  const xStep = columns === 1 ? 0 : 42 / (columns - 1);
  const yStep = rows === 1 ? 0 : 38 / (rows - 1);
  return Array.from({ length: bounded }, (_, index) => ({
    x: -21 + (index % columns) * xStep,
    y: -19 + Math.floor(index / columns) * yStep,
  }));
}

export function tacticalFormationScale(count: number): number {
  if (count <= 1) return 1;
  if (count <= 2) return .94;
  if (count <= 3) return .86;
  if (count <= 4) return .8;
  if (count <= 6) return .71;
  if (count <= 9) return .63;
  return .55;
}

export function tacticalFormationRole(deployment: Pick<CampaignDeployment, "definitionId" | "tags">): TacticalFormationRole {
  const identity = `${deployment.definitionId} ${(deployment.tags ?? []).join(" ")}`.toUpperCase();
  if (/AEROSPACE|FIGHTER|BOMBER|VTOL|FLYER|AIR[ _-]?TRANSPORT/.test(identity)) return "AIR";
  if (/ARTILLERY|LOGI|MEDIC|ENGINEER|SAPPER|SUPPORT/.test(identity)) return "SUPPORT";
  if (/TANK|MECH|VEHICLE|IFV|ARMO(U)?R|BUG[ _-]?HEAVY/.test(identity)) return "ARMOUR";
  return "INFANTRY";
}

export function tacticalSpriteState(deployment: CampaignDeployment, order?: UnitOrder): TacticalSpriteState {
  const healthRatio = deployment.currentHealth / Math.max(1, deployment.stats.maxHealth);
  if (
    healthRatio <= .45 ||
    deployment.status === "IMMOBILISED" ||
    deployment.statuses.some((status) => /DAMAG|BURN|CRIPPL|IMMOBIL/i.test(status))
  ) return "DAMAGED";
  if (!order) return "IDLE";
  const actions = [...order.actions, ...order.incidentalActions].map((action) => action.type);
  if (actions.some((action) => ATTACK_ACTIONS.has(action)) || order.orderType === "MELEE_CHARGE") return "ATTACK";
  if (actions.some((action) => SUPPORT_ACTIONS.has(action))) return "SUPPORT";
  if (order.route.length > 1) return "MOVE";
  return "IDLE";
}

export function tacticalSpriteFrame(state: TacticalSpriteState, elapsedMs: number, reducedMotion = false): number {
  if (reducedMotion) return state === "DAMAGED" ? 5 : state === "ATTACK" ? 3 : state === "SUPPORT" ? 4 : state === "MOVE" ? 1 : 0;
  if (state === "MOVE") return Math.floor(elapsedMs / 180) % 2 === 0 ? 1 : 2;
  if (state === "ATTACK") return elapsedMs % 720 < 180 ? 3 : 0;
  if (state === "SUPPORT") return elapsedMs % 960 < 560 ? 4 : 0;
  if (state === "DAMAGED") return 5;
  return 0;
}

export function tacticalSpriteMotion(
  state: TacticalSpriteState,
  elapsedMs: number,
  reducedMotion = false,
): TacticalSpriteMotion {
  const still = { translateX: 0, translateY: 0, rotation: 0, scale: 1, opacity: 1 };
  if (reducedMotion) return still;
  if (state === "MOVE") {
    const phase = elapsedMs / 180 * Math.PI;
    return { ...still, translateY: Math.sin(phase) * .65, rotation: Math.sin(phase) * .008 };
  }
  if (state === "ATTACK") {
    const phase = elapsedMs % 720;
    const recoil = phase < 180 ? 1 - phase / 180 : 0;
    return { ...still, translateY: recoil * 2.1, scale: 1 + recoil * .012 };
  }
  if (state === "SUPPORT") {
    const phase = Math.sin(elapsedMs / 170);
    return { ...still, scale: 1 + phase * .012, opacity: .94 + (phase + 1) * .025 };
  }
  if (state === "DAMAGED") return { ...still, opacity: .9 };
  return still;
}

export function stableDeploymentOrder(left: CampaignDeployment, right: CampaignDeployment): number {
  const side = left.side.localeCompare(right.side);
  if (side !== 0) return side;
  const rolePriority: Record<TacticalFormationRole, number> = { SUPPORT: 0, ARMOUR: 1, INFANTRY: 2, AIR: 3 };
  const role = rolePriority[tacticalFormationRole(left)] - rolePriority[tacticalFormationRole(right)];
  if (role !== 0) return role;
  const owner = left.ownerId.localeCompare(right.ownerId);
  if (owner !== 0) return owner;
  const definition = left.definitionId.localeCompare(right.definitionId);
  return definition !== 0 ? definition : left.id.localeCompare(right.id);
}
