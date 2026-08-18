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

const movementEvents = new Set(["UNIT_MOVED", "UNIT_BLOCKED", "UNIT_GARRISONED", "UNIT_LEFT_GARRISON", "UNIT_DUG_IN", "UNIT_DUG_OUT", "EVASIVE_MANEUVER", "AEROSPACE_LANDED", "AEROSPACE_TOOK_OFF"]);
const combatEvents = new Set(["DICE_ROLLED", "UNIT_ATTACKED", "DELAYED_CHARGE_PLACED", "DELAYED_CHARGE_DETONATED", "LIGHT_AT_EXPENDED", "WEAPON_SKIPPED", "SUBSYSTEM_MALFUNCTIONED", "DAMAGE_APPLIED", "UNIT_DESTROYED"]);
const supportEvents = new Set([
  "CARGO_LOADED",
  "CARGO_UNLOADED",
  "CARGO_DESTRUCTION_REQUIRES_ADJUDICATION",
  "AIR_DROP_COMPLETED",
  "AIR_DROP_FAILED",
  "WEAPON_RELOADED",
  "MEDICAL_SUPPLY_RELOADED",
  "UNIT_HEALED",
  "UNIT_REPAIRED",
  "ARTILLERY_DEPLOYED",
  "ARTILLERY_PACKED",
  "ARTILLERY_BOMBARDED",
  "ARTILLERY_FUNNELLED",
  "ARTILLERY_ABANDONED",
  "ARTILLERY_REPLACED",
  "BOMBARDMENT_APPLIED",
  "BOMBARDMENT_RECOVERED",
  "HEX_SCANNED",
  "DRONE_DEPLOYED",
  "STRUCTURE_COMPLETED",
  "STRUCTURE_UPGRADED",
  "SAPPER_BUILD_PROGRESS",
  "SAPPER_BUILD_SUPPLY_RELOADED",
  "SAPPER_MINE_TRIGGERED",
  "SUPPLY_TRANSFERRED",
  "AEROSPACE_REARMED",
  "AEROSPACE_INTERCEPTED",
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
    case "ENEMY_INTENTION_DECLARED": {
      const destination = coordLabel(payload.destination);
      const preference = typeof payload.targetPreference === "string"
        ? ` prioritising ${payload.targetPreference.toLowerCase()}`
        : "";
      if (targetId) {
        return `${actor} declared an ${String(payload.orderType ?? "attack").toLowerCase()} intention against ${target}${preference}${destination ? ` via hex ${destination}` : ""}.`;
      }
      return `${actor} advanced toward ${objective}${destination ? ` at hex ${destination}` : ""}.`;
    }
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
    case "UNIT_GARRISONED":
      return `${actor} entered a building at hex ${coordLabel(payload.position) ?? "unknown"} for 0.25 Speed and gains +1 Cover Armor against outside fire.`;
    case "UNIT_LEFT_GARRISON":
      return `${actor} left its building garrison and lost the building's Cover Armor.`;
    case "UNIT_DUG_IN":
      return payload.method === "ENGINEER_ARTILLERY_POSITION"
        ? `${actor} dug in ${target} at hex ${coordLabel(payload.position) ?? "unknown"} for +2 Defense (${String(payload.conflictId ?? "RC-V5-025")}).`
        : `${actor} dug in at hex ${coordLabel(payload.position) ?? "unknown"} for +2 Defense.`;
    case "UNIT_DUG_OUT":
      return `${actor} left its prepared position and lost Dig In Defense.`;
    case "EVASIVE_MANEUVER":
      return payload.active === true
        ? `${actor} completed an Evasive maneuver: +3 Defense and −2 to outgoing attacks this round.`
        : `${actor} was stopped before completing the minimum Evasive displacement and gained no modifier.`;
    case "AEROSPACE_LANDED":
      return `${actor} landed at a friendly compatible airfield.`;
    case "AEROSPACE_TOOK_OFF":
      return `${actor} took off and resumed its flight state.`;
    case "AEROSPACE_REARMED":
      return `${actor} rearmed while landed at a friendly facility (${String(payload.rulesDecisionId ?? "RC-V5-023")}).`;
    case "AEROSPACE_INTERCEPTED":
      return `${actor} was intercepted by ${deploymentNames.get(String(payload.interceptorId)) ?? String(payload.interceptorId ?? "an allied Fighter")} (${String(payload.rulesDecisionId ?? "RC-V5-028")}).`;
    case "DICE_ROLLED": {
      const raw = numberValue(payload.raw);
      const modified = numberValue(payload.modified);
      return `${actor} rolled ${raw}${modified !== raw ? `, modified to ${modified}` : ""}.`;
    }
    case "UNIT_ATTACKED":
      return `${actor} attacked ${target}: ${numberValue(payload.healthLoss)} damage${payload.rearAttack === true ? ", direct rear attack ignored vehicle Armor" : ""}${numberValue(payload.armorPiercingBonus) > 0 ? `, Light AT added +${numberValue(payload.armorPiercingBonus)} AP` : ""}${payload.highGroundModifier === 1 ? ", high ground added +1" : ""}${payload.evasiveAttackModifier === -2 ? ", Evasive fire applied −2" : ""}${payload.coverArmor === 1 ? ", cover added +1 Armor" : ""}${payload.digInDefense === 2 ? ", Dig In added +2 Defense" : ""}${payload.evasiveDefenseModifier === 3 ? ", target Evasive added +3 Defense" : ""}${payload.rapidFireMultiplier === 2 ? ", Rapid Fire doubled the damage result" : ""}${payload.penetrated === true ? ", armour penetrated" : ""}.`;
    case "DELAYED_CHARGE_PLACED":
      return `${actor} planted a delayed charge on ${target}; it arms next round and the team is revealed.`;
    case "DELAYED_CHARGE_DETONATED":
      return `${actor} remotely detonated its armed charge on ${target} for ${numberValue(payload.loss ?? payload.damage)} damage at AP ${numberValue(payload.armorPiercing ?? 2)}.`;
    case "INFANTRY_STEALTH_RESOLVED":
      return payload.active === true
        ? `${actor} completed its movement under Infantry Stealth.`
        : `${actor} was revealed during its action.`;
    case "LIGHT_AT_EXPENDED":
      return `${actor} spent ${numberValue(payload.chargesSpent)} Light AT charge${numberValue(payload.chargesSpent) === 1 ? "" : "s"} for +${numberValue(payload.armorPiercingBonus)} AP against ${target} (${numberValue(payload.ammunitionAfter)} remaining).`;
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
    case "CARGO_DESTRUCTION_REQUIRES_ADJUDICATION": {
      const cargo = Array.isArray(payload.cargo) ? payload.cargo : [];
      const unitCargo = cargo.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).kind !== "SUPPLY").length;
      return `${actor}'s ${cargo.length} carried load${cargo.length === 1 ? "" : "s"} ${cargo.length === 1 ? "is" : "are"} frozen at hex ${coordLabel(payload.frozenAt) ?? "unknown"}${unitCargo > 0 ? `; ${unitCargo} unit load${unitCargo === 1 ? " requires" : "s require"} GM adjudication` : ""} (${String(payload.conflictId ?? "RC-V5-030")}).`;
    }
    case "CARGO_LOADED":
      return payload.transportMode === "TOWED"
        ? `${actor} hitched ${String(payload.cargoDeploymentId ?? "artillery")} for towing.`
        : payload.transportMode === "EXTERNAL"
          ? `${actor} secured ${String(payload.cargoDeploymentId ?? "a heavy load")} on its external lift rig.`
        : `${actor} embarked ${String(payload.cargoDeploymentId ?? "cargo")}.`;
    case "CARGO_UNLOADED":
      return payload.mode === "RAPPEL_GARRISON"
        ? `${actor} rappelled ${String(payload.cargoDeploymentId ?? "Infantry")} into the authored garrison at hex ${coordLabel(payload.targetHex) ?? "unknown"}; the carrier remained airborne.`
        : payload.transportMode === "TOWED"
        ? `${actor} unhitched ${String(payload.cargoDeploymentId ?? "artillery")}.`
        : payload.transportMode === "EXTERNAL"
          ? `${actor} released ${String(payload.cargoDeploymentId ?? "its heavy load")} from the external lift rig.`
        : `${actor} disembarked ${String(payload.cargoDeploymentId ?? "cargo")}.`;
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
      if (payload.repairMethod === "CREW") {
        return `${actor}'s exposed crew restored ${String(payload.subsystemId ?? "a subsystem")} without Armor benefit (${String(payload.conflictId ?? "RC-V5-024")}).`;
      }
      return payload.repairKind === "SUBSYSTEM"
        ? `${actor} restored ${String(payload.subsystemId ?? "a subsystem")} on ${target}.`
        : `${actor} restored one Hit to ${target} (${numberValue(payload.before)} → ${numberValue(payload.after)}).`;
    case "STRUCTURE_COMPLETED":
      return `${actor} completed ${String(payload.structureName ?? "a fieldwork")} at hex ${coordLabel(payload.targetHex) ?? "unknown"}, spending ${numberValue(payload.smallSupplySpent)} Small Supply.`;
    case "STRUCTURE_UPGRADED":
      return `${actor} upgraded the Sandbag Line at hex ${coordLabel(payload.targetHex) ?? "unknown"} into a Trench.`;
    case "SAPPER_BUILD_PROGRESS":
      return `${actor} added ${numberValue(payload.progressAdded)} progress to ${String(payload.structureDefinitionId ?? "a Sapper project")} at hex ${coordLabel(payload.targetHex) ?? "unknown"}; ${numberValue(payload.buildSupplyAfter)} Build Supply remains.`;
    case "SAPPER_BUILD_SUPPLY_RELOADED":
      return `${actor} consumed one General Supply and restored Build Supply to ${numberValue(payload.buildSupplyAfter)}.`;
    case "SAPPER_MINE_TRIGGERED":
      return `${actor} triggered ${String(payload.mineDefinitionId ?? "a Sapper minefield")} for ${numberValue(payload.healthLoss)} damage.`;
    case "SHIELD_WALL_FORMED":
      return `${actor} formed a Ballistic Shield Wall at hex ${coordLabel(payload.position) ?? "unknown"}, gaining non-stacking Cover Armor 1 against direct fire until movement.`;
    case "MAGNETIC_CLAMPS_MOUNTED":
      return `${String(payload.riderDeploymentId ?? actor)} mounted ${String(payload.carrierDeploymentId ?? "a mech")} using Magnetic Clamps.`;
    case "MAGNETIC_CLAMPS_DISMOUNTED":
      return `${String(payload.riderDeploymentId ?? actor)} dismounted from ${String(payload.carrierDeploymentId ?? "a mech")} at hex ${coordLabel(payload.position) ?? "unknown"}.`;
    case "ARTILLERY_DEPLOYED":
      return `${actor} deployed and unhitched the artillery platform.`;
    case "ARTILLERY_PACKED":
      return `${actor} packed and hitched the artillery platform.`;
    case "ARTILLERY_BOMBARDED":
      return payload.areaHex === true
        ? `${actor} fired area shot ${numberValue(payload.shotIndex)}/${numberValue(payload.shotCount)} at hex ${coordLabel(payload.targetHex) ?? "unknown"}, engaging ${Array.isArray(payload.targetIds) ? payload.targetIds.length : 0} ground target(s).`
        : `${actor} fired a radius-one suppression mission at hex ${coordLabel(payload.targetHex) ?? "unknown"}, spending one Small Supply.`;
    case "ARTILLERY_FUNNELLED":
      return `${actor} funnelled ${target} from hex ${coordLabel(payload.from) ?? "unknown"} to ${coordLabel(payload.to) ?? "unknown"}, spending one Small Supply.`;
    case "ARTILLERY_ABANDONED":
      return `${actor} abandoned ${String(payload.originalDefinitionId ?? "its artillery")} and withdrew as an unarmed 1FS crew; one governed replacement remains available.`;
    case "ARTILLERY_REPLACED":
      return `${actor} restored ${String(payload.definitionId ?? "its artillery")} at a friendly Supply Point for ${numberValue(payload.requisitionSpent)} Req.`;
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
    case "ORDER_CANCELLED":
      return `${actor}'s ${String(payload.previousLifecycle ?? "submitted").toLowerCase()} order was withdrawn before lock.`;
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
