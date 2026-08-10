import type { CampaignEvent } from "../../packages/domain/src";

export type CampaignReportGroup = "MOVEMENT" | "COMBAT" | "SUPPORT" | "OBJECTIVES" | "COMMAND";

export interface CampaignReportMetrics {
  movements: number;
  attacks: number;
  diceRolls: number;
  damage: number;
  destroyed: number;
  objectiveChanges: number;
  acceptedOrders: number;
  rejectedOrders: number;
}

export const CAMPAIGN_REPORT_GROUPS: CampaignReportGroup[] = [
  "MOVEMENT",
  "COMBAT",
  "SUPPORT",
  "OBJECTIVES",
  "COMMAND",
];

const movementEvents = new Set(["UNIT_MOVED", "UNIT_BLOCKED", "UNIT_DUG_IN", "UNIT_DUG_OUT", "EVASIVE_MANEUVER"]);
const combatEvents = new Set(["DICE_ROLLED", "UNIT_ATTACKED", "WEAPON_SKIPPED", "SUBSYSTEM_MALFUNCTIONED", "DAMAGE_APPLIED", "UNIT_DESTROYED"]);
const supportEvents = new Set([
  "CARGO_LOADED",
  "CARGO_UNLOADED",
  "AIR_DROP_COMPLETED",
  "AIR_DROP_FAILED",
  "WEAPON_RELOADED",
  "MEDICAL_SUPPLY_RELOADED",
  "UNIT_HEALED",
  "UNIT_REPAIRED",
  "ARTILLERY_DEPLOYED",
  "ARTILLERY_PACKED",
  "ARTILLERY_BOMBARDED",
  "BOMBARDMENT_APPLIED",
  "BOMBARDMENT_RECOVERED",
  "HEX_SCANNED",
  "DRONE_DEPLOYED",
  "STRUCTURE_COMPLETED",
  "SUPPLY_TRANSFERRED",
]);
const objectiveEvents = new Set([
  "OBJECTIVE_CAPTURED",
  "ENEMY_REINFORCEMENTS_ARRIVED",
  "CAMPAIGN_COMPLETED",
  "CAMPAIGN_FAILED",
]);

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function coordLabel(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const coord = value as { q?: unknown; r?: unknown };
  if (typeof coord.q !== "number" || typeof coord.r !== "number") return undefined;
  return `${coord.q}.${coord.r}`;
}

function payloadOf(event: CampaignEvent): Record<string, unknown> {
  return event.payload as Record<string, unknown>;
}

function outcomeDescription(payload: Record<string, unknown>, victory: boolean): string {
  switch (payload.reason) {
    case "FINAL_ROUND_PRIMARY_HELD":
      return "Mission accomplished. The primary outpost held through the final round.";
    case "ALL_ALLIED_DEPLOYMENTS_LOST":
      return "Mission failed. No Allied deployment remains operational.";
    case "PRIMARY_OBJECTIVE_LOST":
      return "Mission failed. Enemy forces captured the primary outpost.";
    case "FINAL_ROUND_CONDITIONS_NOT_MET":
      return "Mission failed. The primary outpost was not secured at the final deadline.";
    default:
      return victory ? "Mission accomplished. The campaign is complete." : "Mission failed. The campaign is complete.";
  }
}

export function campaignReportGroup(event: CampaignEvent): CampaignReportGroup {
  const type = String(event.type);
  if (movementEvents.has(type)) return "MOVEMENT";
  if (combatEvents.has(type)) return "COMBAT";
  if (supportEvents.has(type)) return "SUPPORT";
  if (objectiveEvents.has(type)) return "OBJECTIVES";
  return "COMMAND";
}

export function summarizeCampaignReport(events: CampaignEvent[]): CampaignReportMetrics {
  const metrics: CampaignReportMetrics = {
    movements: 0,
    attacks: 0,
    diceRolls: 0,
    damage: 0,
    destroyed: 0,
    objectiveChanges: 0,
    acceptedOrders: 0,
    rejectedOrders: 0,
  };

  for (const event of events) {
    const payload = payloadOf(event);
    if (event.type === "UNIT_MOVED") metrics.movements += 1;
    if (event.type === "UNIT_ATTACKED") metrics.attacks += 1;
    if (event.type === "DICE_ROLLED") metrics.diceRolls += 1;
    if (event.type === "DAMAGE_APPLIED") metrics.damage += numberValue(payload.loss);
    if (event.type === "UNIT_DESTROYED") metrics.destroyed += 1;
    if (event.type === "OBJECTIVE_CAPTURED") metrics.objectiveChanges += 1;
    if (event.type === "ORDER_REJECTED") metrics.rejectedOrders += 1;
    if (event.type === "ROUND_FINISHED") {
      metrics.acceptedOrders = numberValue(payload.ordersAccepted);
      metrics.rejectedOrders = Math.max(metrics.rejectedOrders, numberValue(payload.ordersRejected));
    }
  }

  return metrics;
}

export function describeCampaignReportEvent(
  event: CampaignEvent,
  deploymentNames: ReadonlyMap<string, string> = new Map(),
): string {
  const payload = payloadOf(event);
  const actor = event.actor ? deploymentNames.get(event.actor) ?? event.actor : "Campaign command";
  const targetId = typeof payload.targetId === "string" ? payload.targetId : undefined;
  const target = targetId ? deploymentNames.get(targetId) ?? targetId : "the target";
  const objective = typeof payload.objectiveName === "string"
    ? payload.objectiveName
    : typeof payload.objectiveId === "string"
      ? payload.objectiveId
      : "the objective";

  switch (String(event.type)) {
    case "UNIT_MOVED": {
      const destination = coordLabel(payload.to);
      return `${actor} moved${destination ? ` to hex ${destination}` : " along its plotted route"}.`;
    }
    case "UNIT_BLOCKED": {
      const where = typeof payload.at === "string" ? ` at ${payload.at}` : " during movement";
      const increment = typeof payload.distanceIncrement === "number" ? ` after ${payload.distanceIncrement} distance` : "";
      if (payload.reason === "HOSTILE_ROUTE_CONTEST") return `${actor} met an opposing ground formation${where}${increment}; both stopped before entering.`;
      if (payload.reason === "HOSTILE_FORMATION") return `${actor} halted before an occupied hostile position${where}${increment}.`;
      return `${actor} was blocked${where}${increment}.`;
    }
    case "UNIT_DUG_IN":
      return `${actor} dug in at hex ${coordLabel(payload.position) ?? "unknown"} for +2 Defense.`;
    case "UNIT_DUG_OUT":
      return `${actor} left its prepared position and lost Dig In Defense.`;
    case "EVASIVE_MANEUVER":
      return payload.active === true
        ? `${actor} completed an Evasive maneuver: +3 Defense and −2 to outgoing attacks this round.`
        : `${actor} was stopped before completing the minimum Evasive displacement and gained no modifier.`;
    case "DICE_ROLLED": {
      const raw = numberValue(payload.raw);
      const modified = numberValue(payload.modified);
      return `${actor} rolled ${raw}${modified !== raw ? `, modified to ${modified}` : ""}.`;
    }
    case "UNIT_ATTACKED":
      return `${actor} attacked ${target}: ${numberValue(payload.healthLoss)} damage${payload.highGroundModifier === 1 ? ", high ground added +1" : ""}${payload.evasiveAttackModifier === -2 ? ", Evasive fire applied −2" : ""}${payload.coverArmor === 1 ? ", cover added +1 Armor" : ""}${payload.digInDefense === 2 ? ", Dig In added +2 Defense" : ""}${payload.evasiveDefenseModifier === 3 ? ", target Evasive added +3 Defense" : ""}${payload.rapidFireMultiplier === 2 ? ", Rapid Fire doubled the damage result" : ""}${payload.penetrated === true ? ", armour penetrated" : ""}.`;
    case "WEAPON_SKIPPED":
      return `${actor}'s ${String(payload.weaponId ?? "weapon")} did not fire at ${target}: ${String(payload.reason ?? "not eligible")}`;
    case "SUBSYSTEM_MALFUNCTIONED": {
      const affected = Array.isArray(payload.affectedSubsystemIds)
        ? payload.affectedSubsystemIds.map(String).join(" and ")
        : "a subsystem";
      return `${target}'s ${affected} malfunctioned after ${actor}'s natural ${numberValue(payload.naturalRoll)}.`;
    }
    case "DAMAGE_APPLIED":
      return `${actor} lost ${numberValue(payload.loss)} strength (${numberValue(payload.before)} → ${numberValue(payload.after)}).`;
    case "UNIT_DESTROYED":
      return `${actor} was destroyed.`;
    case "CARGO_LOADED":
      return `${actor} embarked ${String(payload.cargoDeploymentId ?? "cargo")}.`;
    case "CARGO_UNLOADED":
      return `${actor} disembarked ${String(payload.cargoDeploymentId ?? "cargo")}.`;
    case "AIR_DROP_COMPLETED":
      return `${actor} completed an air drop.`;
    case "AIR_DROP_FAILED":
      return `${actor}'s air drop failed: ${String(payload.reason ?? "drop zone unavailable")}.`;
    case "WEAPON_RELOADED":
      return `${actor} reloaded ${String(payload.weaponId ?? "a weapon")}.`;
    case "MEDICAL_SUPPLY_RELOADED":
      return `${actor} restored Medical Supply to ${numberValue(payload.medicalSupplyAfter)}.`;
    case "UNIT_HEALED":
      return `${actor} restored ${numberValue(payload.amount)} strength to ${target}.`;
    case "UNIT_REPAIRED":
      return payload.repairKind === "SUBSYSTEM"
        ? `${actor} restored ${String(payload.subsystemId ?? "a subsystem")} on ${target}.`
        : `${actor} restored one Hit to ${target} (${numberValue(payload.before)} → ${numberValue(payload.after)}).`;
    case "ARTILLERY_DEPLOYED":
      return `${actor} deployed and unhitched the artillery platform.`;
    case "ARTILLERY_PACKED":
      return `${actor} packed and hitched the artillery platform.`;
    case "ARTILLERY_BOMBARDED":
      return `${actor} fired a radius-one suppression mission at hex ${coordLabel(payload.targetHex) ?? "unknown"}, spending one Small Supply.`;
    case "BOMBARDMENT_APPLIED":
      return `${target} now has ${numberValue(payload.stacksAfter)} bombardment suppression stack${numberValue(payload.stacksAfter) === 1 ? "" : "s"} (Defense ${numberValue(payload.defenseAfter)}).`;
    case "BOMBARDMENT_RECOVERED":
      return `${actor} recovered one bombardment suppression stack (Defense ${numberValue(payload.defenseAfter)}).`;
    case "HEX_SCANNED":
      return `${actor} scanned hex ${coordLabel(payload.targetHex) ?? "unknown"}.`;
    case "DRONE_DEPLOYED":
      return `${actor} deployed a reconnaissance drone.`;
    case "ORDER_REJECTED": {
      const reasons = Array.isArray(payload.reasons) ? payload.reasons.filter((reason): reason is string => typeof reason === "string") : [];
      return `${actor}'s order was rejected${reasons.length ? `: ${reasons.join(" ")}` : "."}`;
    }
    case "OBJECTIVE_CAPTURED":
      return `${objective} changed control to ${String(payload.owner ?? payload.to ?? "another side")}.`;
    case "ENEMY_REINFORCEMENTS_ARRIVED": {
      const callsigns = Array.isArray(payload.callsigns)
        ? payload.callsigns.filter((callsign): callsign is string => typeof callsign === "string")
        : [];
      return `Enemy reinforcements entered the battlespace${callsigns.length ? `: ${callsigns.join(", ")}` : ""}.`;
    }
    case "CAMPAIGN_COMPLETED":
      return typeof payload.summary === "string" ? payload.summary : outcomeDescription(payload, true);
    case "CAMPAIGN_FAILED":
      return typeof payload.summary === "string" ? payload.summary : outcomeDescription(payload, false);
    case "ROUND_FINISHED":
      return `${numberValue(payload.ordersAccepted)} orders resolved; ${numberValue(payload.ordersRejected)} rejected.`;
    default:
      return typeof payload.summary === "string"
        ? payload.summary
        : String(event.type).replaceAll("_", " ").toLowerCase();
  }
}
