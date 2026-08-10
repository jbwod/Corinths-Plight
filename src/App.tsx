import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AxialCoord,
  CampaignDeployment,
  CampaignEvent,
  CampaignView,
  Facing,
  OrderType,
  StructuredAction,
} from "../packages/domain/src";
import {
  FACING_LABELS,
  calculateRouteCost,
  canTarget,
  createDemoCampaignState,
  getTacticalActionRule,
  getTacticalOrderRule,
  getUnitClass,
  hexDistance,
  projectCampaignState,
  resolveTacticalCover,
  shortestPath,
} from "../packages/rules-engine/src";
import brandMark from "../app/static/img/brand-icon.gif";
import { ForcesView } from "./components/ForcesView";
import { DeploymentPlanner } from "./components/DeploymentPlanner";
import { Glyph } from "./components/Glyph";
import { HexMap, type TacticalMapLayer } from "./components/HexMap";
import { StrategicWorkspace, type StrategicView } from "./components/StrategicWorkspace";
import { AuthGateway } from "./components/AuthGateway";
import { CampaignReports } from "./components/CampaignReports";

const DEMO_USER = "demo-user";
const DEFAULT_DEVELOPMENT_CAMPAIGN_ID = "outpost-k17";
const DEMO_HEADERS = import.meta.env.DEV ? { "x-demo-user": DEMO_USER } : undefined;
const viewer = {
  userId: DEMO_USER,
  side: "ALLIED" as const,
  role: "PLAYER" as const,
  battalionId: "battalion-33rd-expeditionary",
};

const navigation = [
  ["command", "Command"],
  ["galaxy", "Galactic"],
  ["battalion", "Battalion"],
  ["ship", "Ship"],
  ["forces", "Forces"],
  ["route", "Deployment"],
  ["target", "Campaigns"],
  ["reports", "Reports"],
] as const;

type ActiveNav = (typeof navigation)[number][1];

const strategicViews = new Set<ActiveNav>(["Command", "Galactic", "Battalion", "Ship"]);

function initialNavigation(): ActiveNav {
  const requested = new URLSearchParams(window.location.search).get("view")?.toLowerCase();
  const matched = navigation.find(([, label]) => label.toLowerCase() === requested)?.[1];
  return matched ?? "Command";
}

type ConnectionState = "CONNECTING" | "LIVE" | "RECONNECTING" | "LOCAL" | "ERROR";
interface CampaignDirectoryEntry {
  campaignId: string;
  name: string;
  planetName: string;
  status: string;
  role: string;
  scenarioAvailable: boolean;
  canEnter: boolean;
  canJoin?: boolean;
  outcome?: {
    result: "VICTORY" | "DEFEAT";
    reason: string;
    round: number;
    rewards?: NonNullable<CampaignView["outcome"]>["rewards"];
    resolvedAt: number;
  };
}
type Notice = { tone: "info" | "success" | "danger"; message: string };
type ComposerActionMode = "NONE" | "ATTACK" | "DIG_IN" | "RELOAD" | "LOAD" | "UNLOAD" | "HEAL" | "REPAIR" | "CONSTRUCT" | "DEPLOY" | "PACK_UP" | "BOMBARDMENT";
type RepairKind = "HIT" | "SUBSYSTEM";
const composerActionModes: Exclude<ComposerActionMode, "NONE">[] = ["ATTACK", "DIG_IN", "RELOAD", "LOAD", "UNLOAD", "HEAL", "REPAIR", "CONSTRUCT", "DEPLOY", "PACK_UP", "BOMBARDMENT"];

function initialCampaign(): CampaignView {
  const now = Date.now();
  return projectCampaignState(createDemoCampaignState(now), viewer, now);
}

function coordinatesEqual(left: AxialCoord, right: AxialCoord): boolean {
  return left.q === right.q && left.r === right.r;
}

function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}D ${String(hours).padStart(2, "0")}H ${String(minutes).padStart(2, "0")}M`;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatEvent(event: CampaignEvent): string {
  const payload = event.payload as Record<string, unknown>;
  if (typeof payload.summary === "string") return payload.summary;
  if (event.type === "ORDER_SUBMITTED") return `Order ${String(payload.lifecycle ?? "saved").toLowerCase()} for ${event.actor ?? "unit"}.`;
  if (event.type === "ENEMY_INTENTION_DECLARED") return typeof payload.targetId === "string"
    ? `${event.actor ?? "Enemy formation"} declared ${String(payload.orderType ?? "combat")} against ${payload.targetId}.`
    : `${event.actor ?? "Enemy formation"} advanced toward ${String(payload.objectiveId ?? "the primary objective")}.`;
  if (event.type === "UNIT_MOVED") return `${event.actor ?? "Unit"} completed its plotted movement.`;
  if (event.type === "UNIT_BLOCKED") {
    const increment = typeof payload.distanceIncrement === "number" ? ` after ${payload.distanceIncrement} distance` : "";
    return payload.reason === "HOSTILE_ROUTE_CONTEST"
      ? `${event.actor ?? "Unit"} met an opposing formation${increment}; both halted.`
      : payload.reason === "HOSTILE_FORMATION"
        ? `${event.actor ?? "Unit"} halted before a hostile formation${increment}.`
        : `${event.actor ?? "Unit"} was blocked${increment}.`;
  }
  if (event.type === "UNIT_DUG_IN") return `${event.actor ?? "Unit"} dug in for +2 Defense.`;
  if (event.type === "UNIT_DUG_OUT") return `${event.actor ?? "Unit"} left its prepared position and lost Dig In Defense.`;
  if (event.type === "EVASIVE_MANEUVER") return payload.active === true
    ? `${event.actor ?? "Unit"} completed an Evasive maneuver for +3 Defense and −2 outgoing attacks.`
    : `${event.actor ?? "Unit"} was stopped before completing its Evasive maneuver.`;
  if (event.type === "UNIT_ATTACKED") return `${event.actor ?? "Unit"} engaged ${String(payload.targetId ?? "a hostile")}${payload.evasiveAttackModifier === -2 ? "; Evasive fire applied −2" : ""}${payload.coverArmor === 1 ? "; cover added +1 Armor" : ""}${payload.digInDefense === 2 ? "; Dig In added +2 Defense" : ""}${payload.evasiveDefenseModifier === 3 ? "; target Evasive added +3 Defense" : ""}.`;
  if (event.type === "WEAPON_SKIPPED") return `${event.actor ?? "Unit"}'s ${String(payload.weaponId ?? "weapon")} did not fire: ${String(payload.reason ?? "not eligible")}.`;
  if (event.type === "DAMAGE_APPLIED") return `${event.actor ?? "Unit"} lost ${String(payload.loss ?? "?")} strength.`;
  if (event.type === "UNIT_HEALED") return `${event.actor ?? "Medic"} restored ${String(payload.amount ?? "?")} strength to ${String(payload.targetId ?? "an allied unit")}.`;
  if (event.type === "UNIT_REPAIRED") return `${event.actor ?? "Engineer"} repaired ${String(payload.targetId ?? "an allied vehicle")}.`;
  if (event.type === "STRUCTURE_COMPLETED") return `${event.actor ?? "Engineer"} completed a Sandbag Line at ${String((payload.targetHex as AxialCoord | undefined)?.q ?? "?")}.${String((payload.targetHex as AxialCoord | undefined)?.r ?? "?")}.`;
  if (event.type === "ARTILLERY_DEPLOYED") return `${event.actor ?? "Artillery"} deployed and is ready to fire.`;
  if (event.type === "ARTILLERY_PACKED") return `${event.actor ?? "Artillery"} packed up for movement.`;
  if (event.type === "ARTILLERY_BOMBARDED") return `${event.actor ?? "Artillery"} fired a suppression mission.`;
  if (event.type === "BOMBARDMENT_APPLIED") return `${String(payload.targetId ?? "Hostile unit")} lost Defense under bombardment.`;
  if (event.type === "BOMBARDMENT_RECOVERED") return `${event.actor ?? "Unit"} recovered one Defense from bombardment.`;
  if (event.type === "MEDICAL_SUPPLY_RELOADED") return `${event.actor ?? "Medic"} restored Medical Supply to ${String(payload.medicalSupplyAfter ?? "?")}.`;
  if (event.type === "UNIT_DESTROYED") return `${event.actor ?? "Unit"} was destroyed.`;
  if (event.type === "ROUND_FINISHED") return `Round ${event.round} resolved and archived.`;
  return event.type.replaceAll("_", " ").toLowerCase();
}

function eventLabel(event: CampaignEvent): string {
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `R${event.round} · ${time}`;
}

function campaignOutcomeMessage(campaign: CampaignView): string {
  const primaryObjective = campaign.objectives.find((objective) =>
    objective.id === campaign.scenarioPolicy?.primaryObjectiveId
  );
  const objectiveName = primaryObjective?.name ?? "The primary objective";
  switch (campaign.outcome?.reason) {
    case "FINAL_ROUND_PRIMARY_HELD": return `${objectiveName} held through the final assault.`;
    case "ALL_ALLIED_DEPLOYMENTS_LOST": return "No Allied deployment remains operational.";
    case "PRIMARY_OBJECTIVE_LOST": return `Enemy forces captured ${objectiveName}.`;
    case "FINAL_ROUND_CONDITIONS_NOT_MET": return `${objectiveName} was not secured at the deadline.`;
    default: return "Campaign command has closed this operation.";
  }
}

function definitionLabel(deployment: CampaignDeployment): string {
  try {
    return getUnitClass(deployment.definitionId).name;
  } catch {
    return deployment.definitionId;
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string; details?: { reasons?: string[] } } };
    const reasons = body.error?.details?.reasons;
    return reasons?.length ? reasons.join(" ") : body.error?.message ?? `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

function GameApp() {
  const [campaign, setCampaign] = useState<CampaignView>(initialCampaign);
  const [connection, setConnection] = useState<ConnectionState>("CONNECTING");
  const [now, setNow] = useState(() => Date.now());
  const [selectedUnitId, setSelectedUnitId] = useState("dep-rook-7");
  const [orderType, setOrderType] = useState<OrderType>("ADVANCE");
  const [draftedRoute, setDraftedRoute] = useState<AxialCoord[]>([{ q: -3, r: 1 }]);
  const [draftedFacing, setDraftedFacing] = useState<Facing>(2);
  const [targetUnitId, setTargetUnitId] = useState<string>();
  const [supportTargetUnitId, setSupportTargetUnitId] = useState<string>();
  const [actionMode, setActionMode] = useState<ComposerActionMode>("NONE");
  const [repairKind, setRepairKind] = useState<RepairKind>("HIT");
  const [repairSubsystemId, setRepairSubsystemId] = useState<string>();
  const [bombardmentTargetHex, setBombardmentTargetHex] = useState<AxialCoord>();
  const [constructionTargetHex, setConstructionTargetHex] = useState<AxialCoord>();
  const [selectedWeaponId, setSelectedWeaponId] = useState<string>();
  const [scheduledRound, setScheduledRound] = useState(18);
  const [hovered, setHovered] = useState<{ coord?: AxialCoord; unit?: CampaignDeployment }>({});
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const [timelineMode, setTimelineMode] = useState<"ORDERS" | "EVENTS">("EVENTS");
  const [rosterScope, setRosterScope] = useState<"MY_UNITS" | "ALLIED">("MY_UNITS");
  const [mapLayer, setMapLayer] = useState<TacticalMapLayer>("SURFACE");
  const [activeNav, setActiveNav] = useState<ActiveNav>(initialNavigation);
  const [campaignId, setCampaignId] = useState<string | undefined>(
    import.meta.env.DEV ? DEFAULT_DEVELOPMENT_CAMPAIGN_ID : undefined,
  );
  const [campaignDirectory, setCampaignDirectory] = useState<CampaignDirectoryEntry[]>([]);
  const realtimeCursor = useRef<{ round: number; sequence: number; version: number } | undefined>(undefined);

  const loadCampaignDirectory = useCallback(async (): Promise<string | undefined> => {
    const response = await fetch("/api/campaigns", { headers: DEMO_HEADERS });
    if (!response.ok) throw new Error(await errorMessage(response));
    const body = await response.json() as {
      campaigns?: CampaignDirectoryEntry[];
      availableCampaigns?: CampaignDirectoryEntry[];
    };
    const entries = [
      ...(Array.isArray(body.campaigns) ? body.campaigns : []),
      ...(Array.isArray(body.availableCampaigns) ? body.availableCampaigns : []),
    ];
    setCampaignDirectory(entries);
    const selected = entries.find((entry) => entry.campaignId === campaignId && entry.canEnter)
      ?? entries.find((entry) => entry.canEnter);
    setCampaignId(selected?.campaignId);
    return selected?.campaignId;
  }, [campaignId]);

  const loadCampaign = useCallback(async (quiet = false, requestedCampaignId = campaignId) => {
    if (!requestedCampaignId) return undefined;
    try {
      const response = await fetch(`/api/campaigns/${requestedCampaignId}/state`, { headers: DEMO_HEADERS });
      if (!response.ok) throw new Error(await errorMessage(response));
      const next = (await response.json()) as CampaignView;
      setCampaign(next);
      const latestEvent = [...next.events].sort((left, right) =>
        left.round - right.round || left.sequence - right.sequence
      ).at(-1);
      realtimeCursor.current = {
        round: latestEvent?.round ?? next.round,
        sequence: latestEvent?.sequence ?? 0,
        version: next.version,
      };
      setConnection("LIVE");
      return next;
    } catch (error) {
      setConnection((current) => current === "LIVE" ? "RECONNECTING" : import.meta.env.DEV ? "LOCAL" : "ERROR");
      if (!quiet) {
        setNotice({
          tone: import.meta.env.DEV ? "info" : "danger",
          message: import.meta.env.DEV
            ? `Local tactical projection active. ${error instanceof Error ? error.message : "Campaign service is offline."}`
            : `Campaign service unavailable. ${error instanceof Error ? error.message : "No local tactical state has been substituted."}`,
        });
      }
      return undefined;
    }
  }, [campaignId]);

  useEffect(() => {
    if (activeNav !== "Campaigns" && activeNav !== "Reports") return;
    const initialLoad = window.setTimeout(() => {
      void loadCampaignDirectory()
        .then((selected) => selected ? loadCampaign(false, selected) : undefined)
        .catch((error: unknown) => {
          setConnection(import.meta.env.DEV ? "LOCAL" : "ERROR");
          setNotice({ tone: import.meta.env.DEV ? "info" : "danger", message: error instanceof Error ? error.message : "Campaign directory is unavailable." });
        });
    }, 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [activeNav, loadCampaign, loadCampaignDirectory]);

  useEffect(() => {
    if (activeNav !== "Campaigns" || !campaignId) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let reconnectTimer: number | undefined;
    let closed = false;
    let socket: WebSocket | undefined;

    const connect = () => {
      if (closed) return;
      try {
        const query = new URLSearchParams();
        if (import.meta.env.DEV) query.set("demo_user", DEMO_USER);
        if (realtimeCursor.current) {
          query.set("sinceRound", String(realtimeCursor.current.round));
          query.set("sinceSequence", String(realtimeCursor.current.sequence));
          query.set("sinceVersion", String(realtimeCursor.current.version));
        }
        socket = new WebSocket(
          `${protocol}//${window.location.host}/api/campaigns/${campaignId}/ws${query.size > 0 ? `?${query}` : ""}`,
        );
        socket.addEventListener("open", () => setConnection("LIVE"));
        socket.addEventListener("message", (event) => {
          const message = JSON.parse(String(event.data)) as {
            type?: string;
            version?: number;
            cursor?: { round: number; sequence: number; version: number };
            events?: unknown[];
            truncated?: boolean;
          };
          const priorVersion = realtimeCursor.current?.version ?? 0;
          if (message.cursor) realtimeCursor.current = message.cursor;
          const missedWhileDisconnected = Boolean(message.events?.length || message.truncated || (message.version ?? 0) > priorVersion);
          if (message.type !== "pong" && (message.type !== "connected" || missedWhileDisconnected)) {
            void loadCampaign(true, campaignId);
          }
        });
        socket.addEventListener("close", () => {
          if (closed) return;
          setConnection("RECONNECTING");
          reconnectTimer = window.setTimeout(connect, 2_500);
        });
        socket.addEventListener("error", () => socket?.close());
      } catch {
        setConnection(import.meta.env.DEV ? "LOCAL" : "RECONNECTING");
      }
    };
    connect();
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [activeNav, campaignId, loadCampaign]);

  const ownUnits = useMemo(
    () => campaign.deployments.filter((deployment) => deployment.ownerId === campaign.viewer.userId),
    [campaign.deployments, campaign.viewer.userId],
  );
  const alliedUnits = useMemo(
    () => campaign.deployments.filter((deployment) => deployment.side === "ALLIED"),
    [campaign.deployments],
  );
  const rosterUnits = rosterScope === "MY_UNITS" ? ownUnits : alliedUnits;
  const selectedUnit =
    ownUnits.find((deployment) => deployment.id === selectedUnitId) ?? ownUnits.find((unit) => unit.status !== "DESTROYED");
  const selectedDefinition = selectedUnit ? getUnitClass(selectedUnit.definitionId) : undefined;
  const selectedAllowedOrders = selectedUnit?.allowedOrders ?? selectedDefinition?.allowedOrders ?? [];
  const selectedAllowedActions = selectedUnit?.allowedActions ?? selectedDefinition?.allowedActions ?? [];
  const isMedicalUnit = selectedDefinition?.tags.includes("MEDICAL") ?? false;
  const isEngineerUnit = selectedDefinition?.tags.includes("ENGINEER") ?? false;
  const isArtilleryUnit = selectedDefinition?.tags.includes("ARTILLERY") ?? false;
  const disabledSubsystems = selectedUnit?.subsystems?.filter((subsystem) => subsystem.state === "DISABLED") ?? [];
  const weaponSystemsDisabled = disabledSubsystems.some((subsystem) => subsystem.subsystemId.toUpperCase() === "WEAPONS");
  const mobilityDisabled = disabledSubsystems.some((subsystem) => subsystem.subsystemId.toUpperCase() === "MOBILITY");
  const artilleryDeployed = selectedUnit?.artilleryDeployment === "DEPLOYED" || selectedUnit?.statuses.includes("DEPLOYED") === true;
  const dugIn = selectedUnit?.statuses.includes("DUG_IN") === true;
  const artilleryWeapon = selectedUnit?.weapons.find((weapon) => weapon.indirect) ?? selectedUnit?.weapons[0];
  const medicalSupplyCapacity = selectedUnit ? Math.max(0, Math.floor(selectedUnit.currentHealth)) : 0;
  const executableComposerActions = composerActionModes.filter((type) =>
    selectedAllowedActions.includes(type) &&
    getTacticalActionRule(type).executable &&
    (type !== "DEPLOY" || !artilleryDeployed) &&
    (type !== "PACK_UP" || artilleryDeployed) &&
    (type !== "BOMBARDMENT" || artilleryDeployed) &&
    (type !== "DIG_IN" || !dugIn),
  );
  const targetUnit = campaign.deployments.find((deployment) => deployment.id === targetUnitId);
  const targetIsHorde = targetUnit?.tags?.includes("HORDE") === true;
  const reloadableWeapons = selectedUnit?.weapons.filter((weapon) =>
    weapon.ammoCapacity !== undefined &&
    (selectedUnit.ammunition[weapon.id] ?? 0) < weapon.ammoCapacity
  ) ?? [];
  const selectedWeapon = reloadableWeapons.find((weapon) => weapon.id === selectedWeaponId) ?? reloadableWeapons[0];
  const intendedAttacker = selectedUnit
    ? { ...selectedUnit, position: draftedRoute.at(-1) ?? selectedUnit.position }
    : undefined;
  const attackWeaponChecks = selectedUnit?.weapons.map((weapon) => {
    if (!intendedAttacker || !targetUnit) return { weapon, legal: false, reason: "Choose a target." };
    const targeting = canTarget(intendedAttacker, targetUnit, weapon, campaign.map, campaign.deployments);
    const ammoAvailable = weapon.ammoCapacity === undefined || (selectedUnit.ammunition[weapon.id] ?? 0) > 0;
    // The resolver ticks an existing cooldown once before this attack phase.
    const cooldownReady = (selectedUnit.cooldowns[weapon.id] ?? 0) <= 1;
    return {
      weapon,
      legal: targeting.legal && ammoAvailable && cooldownReady,
      reason: targeting.reason ?? (!ammoAvailable ? "No ammunition." : !cooldownReady ? "Cooling down." : undefined),
    };
  }) ?? [];
  const participatingWeapons = attackWeaponChecks.filter((check) => check.legal).map((check) => check.weapon);
  const rapidFireReady = participatingWeapons.some((weapon) => weapon.tags.includes("RAPID_FIRE"));
  const attackerHex = selectedUnit ? campaign.map.find((hex) => coordinatesEqual(hex.coord, draftedRoute.at(-1) ?? selectedUnit.position)) : undefined;
  const targetHex = targetUnit ? campaign.map.find((hex) => coordinatesEqual(hex.coord, targetUnit.position)) : undefined;
  const attackerIsGround = selectedUnit ? !selectedUnit.tags?.some((tag) => tag === "AEROSPACE" || tag === "VTOL" || tag === "ORBITAL") : false;
  const targetIsGround = targetUnit ? !targetUnit.tags?.some((tag) => tag === "AEROSPACE" || tag === "VTOL" || tag === "ORBITAL") : false;
  const highGroundAdvantage = Boolean(attackerIsGround && targetIsGround && attackerHex && targetHex && attackerHex.elevation > targetHex.elevation);
  const targetCover = selectedUnit && targetUnit
    ? resolveTacticalCover(
        { ...selectedUnit, position: draftedRoute.at(-1) ?? selectedUnit.position },
        targetUnit,
        campaign.map,
      )
    : { armor: 0 as const, sources: [] };
  const coLocatedAllies = selectedUnit ? campaign.deployments.filter((deployment) =>
    deployment.id !== selectedUnit.id &&
    deployment.side === selectedUnit.side &&
    deployment.status !== "DESTROYED" &&
    coordinatesEqual(deployment.position, selectedUnit.position)
  ) : [];
  const loadTargets = selectedUnit
    ? selectedUnit.cargoProfile
      ? coLocatedAllies.filter((deployment) => (deployment.locationState ?? "ON_MAP") === "ON_MAP")
      : coLocatedAllies.filter((deployment) => deployment.cargoProfile !== undefined)
    : [];
  const unloadTargets = selectedUnit
    ? selectedUnit.cargoProfile
      ? (selectedUnit.cargo ?? []).flatMap((item) => {
          const deployment = item.unitId
            ? campaign.deployments.find((candidate) => candidate.id === item.unitId)
            : undefined;
          return deployment ? [deployment] : [];
        })
      : campaign.deployments.filter((deployment) =>
          deployment.cargoProfile !== undefined &&
          deployment.cargo?.some((item) => item.unitId === selectedUnit.id)
        )
    : [];
  const healTargets = selectedUnit ? campaign.deployments.filter((deployment) =>
    deployment.id !== selectedUnit.id &&
    deployment.side === selectedUnit.side &&
    deployment.status !== "DESTROYED" &&
    deployment.definitionId === "unit-infantry-squad" &&
    deployment.currentHealth > 0 &&
    deployment.currentHealth < deployment.stats.maxHealth &&
    coordinatesEqual(deployment.position, draftedRoute.at(-1) ?? selectedUnit.position)
  ) : [];
  const repairTargets = selectedUnit ? campaign.deployments.filter((deployment) =>
    deployment.id !== selectedUnit.id &&
    deployment.side === selectedUnit.side &&
    deployment.status !== "DESTROYED" &&
    deployment.stats.healthModel === "HITS" &&
    (
      deployment.currentHealth < deployment.stats.maxHealth ||
      deployment.subsystems?.some((subsystem) => subsystem.state !== "OPERATIONAL") === true
    ) &&
    coordinatesEqual(deployment.position, draftedRoute.at(-1) ?? selectedUnit.position)
  ) : [];
  const supportTargets = actionMode === "LOAD"
    ? loadTargets
    : actionMode === "UNLOAD"
      ? unloadTargets
      : actionMode === "HEAL"
        ? healTargets
        : actionMode === "REPAIR"
          ? repairTargets
        : [];
  const supportTarget = supportTargets.find((deployment) => deployment.id === supportTargetUnitId) ?? supportTargets[0];
  const repairableSubsystems = supportTarget?.subsystems?.filter((subsystem) => subsystem.state !== "OPERATIONAL") ?? [];
  const selectedRepairSubsystem = repairableSubsystems.find((subsystem) => subsystem.subsystemId === repairSubsystemId)
    ?? repairableSubsystems[0];
  const bombardmentHexes = selectedUnit && artilleryWeapon ? campaign.map
    .filter((hex) => {
      const distance = hexDistance(selectedUnit.position, hex.coord);
      return hex.visibility !== "UNKNOWN" && distance >= 1 && distance <= artilleryWeapon.range;
    })
    .sort((left, right) => {
      const hostileCount = (coord: AxialCoord) => campaign.deployments.filter((deployment) =>
        deployment.side !== selectedUnit.side &&
        deployment.status !== "DESTROYED" &&
        hexDistance(deployment.position, coord) <= 1
      ).length;
      return hostileCount(right.coord) - hostileCount(left.coord) ||
        hexDistance(selectedUnit.position, left.coord) - hexDistance(selectedUnit.position, right.coord) ||
        left.coord.q - right.coord.q || left.coord.r - right.coord.r;
    }) : [];
  const selectedBombardmentHex = bombardmentHexes.find((hex) =>
    bombardmentTargetHex && coordinatesEqual(hex.coord, bombardmentTargetHex)
  )?.coord ?? bombardmentHexes[0]?.coord;
  const constructionHexes = selectedUnit ? campaign.map
    .filter((hex) =>
      hex.visibility !== "UNKNOWN" &&
      hexDistance(draftedRoute.at(-1) ?? selectedUnit.position, hex.coord) <= 1 &&
      !hex.structureIds.some((id) => id === "structure-sandbag-line" || id.startsWith("structure-sandbag-line:"))
    )
    .sort((left, right) =>
      hexDistance(draftedRoute.at(-1) ?? selectedUnit.position, left.coord) -
        hexDistance(draftedRoute.at(-1) ?? selectedUnit.position, right.coord) ||
      left.coord.q - right.coord.q || left.coord.r - right.coord.r
    ) : [];
  const selectedConstructionHex = constructionHexes.find((hex) =>
    constructionTargetHex && coordinatesEqual(hex.coord, constructionTargetHex)
  )?.coord ?? constructionHexes[0]?.coord;
  const currentOrder = campaign.orders.find(
    (order) => order.unitId === selectedUnit?.id && order.round === scheduledRound && order.lifecycle !== "CANCELLED",
  );
  const currentOrderRevision = campaign.orders.find(
    (order) => order.unitId === selectedUnit?.id && order.round === campaign.round,
  )?.revision ?? 0;
  const routeResult = calculateRouteCost(draftedRoute, campaign.map, { rush: orderType === "RUSH" });
  const targetRange =
    targetUnit && draftedRoute.length > 0 ? hexDistance(draftedRoute.at(-1)!, targetUnit.position) : undefined;
  const ordersForRound = campaign.orders.filter(
    (order) => order.round === campaign.round && !["CANCELLED", "FAILED"].includes(order.lifecycle),
  );
  const ownSubmitted = ownUnits.filter((unit) =>
    ordersForRound.some((order) => order.unitId === unit.id && order.lifecycle !== "DRAFT"),
  ).length;
  const locked =
    campaign.phase !== "PLANNING" ||
    (campaign.clock.lockAt > 0 && now >= campaign.clock.lockAt && scheduledRound === campaign.round);
  const manualClock = campaign.clock.resolvesAt === 0;
  const campaignTerminal = campaign.phase === "COMPLETE" || campaign.phase === "FAILED";
  const showOperatorControls = campaign.viewer.role === "ADMIN" || import.meta.env.DEV;
  const countdown = campaignTerminal
    ? campaign.outcome?.result ?? "COMPLETE"
    : manualClock
      ? "MANUAL"
      : formatCountdown(campaign.clock.resolvesAt - now);
  const lockCountdown = manualClock ? "operator controlled" : formatCountdown(campaign.clock.lockAt - now);
  const routeOverBudget = Boolean(selectedUnit && routeResult.total > selectedUnit.stats.speed);
  const evasiveMinimumDisplacement = selectedUnit ? selectedUnit.stats.speed / 2 : 0;
  const evasiveDisplacement = selectedUnit
    ? hexDistance(selectedUnit.position, draftedRoute.at(-1) ?? selectedUnit.position)
    : 0;
  const evasiveRouteIncomplete = orderType === "EVASIVE" && evasiveDisplacement < evasiveMinimumDisplacement;
  const deployedArtilleryMoving = Boolean(isArtilleryUnit && artilleryDeployed && draftedRoute.length > 1);
  const noEligibleAttackWeapon = actionMode === "ATTACK" && Boolean(targetUnit) && participatingWeapons.length === 0;
  const actionReady =
    actionMode === "NONE" ||
    (actionMode === "ATTACK" && Boolean(targetUnit && participatingWeapons.length > 0 && orderType !== "RUSH" && !weaponSystemsDisabled)) ||
    (actionMode === "RELOAD" && Boolean(
      (selectedUnit?.supplies?.SMALL_SUPPLY ?? 0) > 0 &&
      (isMedicalUnit
        ? (selectedUnit?.supplies?.MEDICAL_SUPPLY ?? 0) < medicalSupplyCapacity
        : selectedWeapon),
    )) ||
    (actionMode === "HEAL" && Boolean(supportTarget && (selectedUnit?.supplies?.MEDICAL_SUPPLY ?? 0) > 0)) ||
    (actionMode === "REPAIR" && Boolean(
      isEngineerUnit &&
      supportTarget &&
      (selectedUnit?.supplies?.SMALL_SUPPLY ?? 0) > 0 &&
      (repairKind === "HIT" ? supportTarget.currentHealth < supportTarget.stats.maxHealth : selectedRepairSubsystem),
    )) ||
    (actionMode === "CONSTRUCT" && Boolean(
      isEngineerUnit && selectedConstructionHex && (selectedUnit?.supplies?.SMALL_SUPPLY ?? 0) > 0
    )) ||
    (actionMode === "DIG_IN" && !dugIn && orderType === "HOLD" && draftedRoute.length === 1) ||
    (actionMode === "DEPLOY" && isArtilleryUnit && !artilleryDeployed) ||
    (actionMode === "PACK_UP" && isArtilleryUnit && artilleryDeployed) ||
    (actionMode === "BOMBARDMENT" && Boolean(
      isArtilleryUnit && artilleryDeployed && selectedBombardmentHex && (selectedUnit?.supplies?.SMALL_SUPPLY ?? 0) > 0,
    )) ||
    ((actionMode === "LOAD" || actionMode === "UNLOAD") && Boolean(supportTarget));
  const canSubmit = Boolean(
    selectedUnit &&
      selectedDefinition &&
      routeResult.legal &&
      !routeOverBudget &&
      !evasiveRouteIncomplete &&
      !(mobilityDisabled && draftedRoute.length > 1) &&
      !deployedArtilleryMoving &&
      !locked &&
      actionReady,
  );
  const actionSummary = actionMode === "ATTACK" && targetUnit && participatingWeapons.length > 0
    ? `engage ${targetUnit.callsign} with ${participatingWeapons.map((weapon) => weapon.name).join(" + ")}`
    : actionMode === "RELOAD" && isMedicalUnit
      ? "restore Medical Supply using one Small Supply"
      : actionMode === "RELOAD" && selectedWeapon
        ? `reload ${selectedWeapon.name} using one Small Supply`
      : actionMode === "LOAD" && supportTarget
        ? `coordinate loading with ${supportTarget.callsign}`
        : actionMode === "UNLOAD" && supportTarget
          ? `coordinate unloading with ${supportTarget.callsign}`
          : actionMode === "HEAL" && supportTarget
            ? `give First Aid to ${supportTarget.callsign}`
          : actionMode === "REPAIR" && supportTarget
            ? repairKind === "HIT"
              ? `restore one Hit to ${supportTarget.callsign}`
              : `repair ${selectedRepairSubsystem?.subsystemId ?? "a subsystem"} on ${supportTarget.callsign}`
          : actionMode === "CONSTRUCT" && selectedConstructionHex
            ? `build a Sandbag Line at ${selectedConstructionHex.q}.${selectedConstructionHex.r}`
          : actionMode === "DIG_IN"
            ? "prepare this position for +2 Defense"
          : actionMode === "DEPLOY"
            ? "deploy and unhitch the artillery platform"
          : actionMode === "PACK_UP"
            ? "pack and hitch the artillery platform"
          : actionMode === "BOMBARDMENT" && selectedBombardmentHex
            ? `bombard hex ${selectedBombardmentHex.q}.${selectedBombardmentHex.r}`
          : undefined;

  useEffect(() => {
    if (!selectedUnit) return;
    const order = campaign.orders.find(
      (candidate) =>
        candidate.unitId === selectedUnit.id &&
        candidate.round === scheduledRound &&
        candidate.lifecycle !== "CANCELLED",
    );
    // The editor intentionally rehydrates when the selected remote order changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrderType(order?.orderType ?? (getUnitClass(selectedUnit.definitionId).allowedOrders.includes("ADVANCE") ? "ADVANCE" : "HOLD"));
    setDraftedRoute(order?.route ?? [{ ...selectedUnit.position }]);
    setDraftedFacing(order?.facing ?? selectedUnit.facing);
    const storedAction = order?.actions[0];
    const storedMode = storedAction && composerActionModes.includes(storedAction.type as Exclude<ComposerActionMode, "NONE">)
      ? storedAction.type as ComposerActionMode
      : "NONE";
    setActionMode(storedMode);
    setTargetUnitId(storedAction?.type === "ATTACK" ? storedAction.targetDeploymentId : undefined);
    setSupportTargetUnitId(
      storedAction?.type === "LOAD" || storedAction?.type === "UNLOAD" || storedAction?.type === "HEAL" || storedAction?.type === "REPAIR"
        ? storedAction.targetDeploymentId ?? (typeof storedAction.payload?.cargoDeploymentId === "string" ? storedAction.payload.cargoDeploymentId : undefined)
        : undefined,
    );
    setRepairKind(storedAction?.type === "REPAIR" && storedAction.payload?.repairKind === "SUBSYSTEM" ? "SUBSYSTEM" : "HIT");
    setRepairSubsystemId(
      storedAction?.type === "REPAIR" && typeof storedAction.payload?.subsystemId === "string"
        ? storedAction.payload.subsystemId
        : undefined,
    );
    setBombardmentTargetHex(storedAction?.type === "BOMBARDMENT" ? storedAction.targetHex : undefined);
    setConstructionTargetHex(storedAction?.type === "CONSTRUCT" ? storedAction.targetHex : undefined);
    setSelectedWeaponId(storedAction?.weaponId ?? selectedUnit.weapons[0]?.id);
  }, [campaign.orders, scheduledRound, selectedUnit]);

  useEffect(() => {
    if (scheduledRound !== campaign.round) {
      // This runtime accepts only authoritative current-round orders.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScheduledRound(campaign.round);
    }
  }, [campaign.round, scheduledRound]);

  function selectUnit(unit: CampaignDeployment) {
    setSelectedUnitId(unit.id);
    setScheduledRound(campaign.round);
    setNotice(undefined);
  }

  function planDestination(coord: AxialCoord, unit?: CampaignDeployment) {
    if (actionMode === "CONSTRUCT" && executableComposerActions.includes("CONSTRUCT")) {
      const eligible = constructionHexes.some((hex) => coordinatesEqual(hex.coord, coord));
      if (!eligible) {
        setNotice({ tone: "danger", message: "Sandbags must be placed in the Engineer's current or an adjacent known hex." });
        return;
      }
      setConstructionTargetHex(coord);
      setNotice({ tone: "info", message: `Hex ${coord.q}.${coord.r} designated for a Sandbag Line.` });
      return;
    }
    if (actionMode === "BOMBARDMENT" && executableComposerActions.includes("BOMBARDMENT")) {
      setBombardmentTargetHex(coord);
      setNotice({ tone: "info", message: `Hex ${coord.q}.${coord.r} designated for suppression fire.` });
      return;
    }
    if (unit?.ownerId === campaign.viewer.userId) {
      selectUnit(unit);
      return;
    }
    if (unit?.side === "ENEMY") {
      if (!executableComposerActions.includes("ATTACK")) {
        setNotice({ tone: "danger", message: `${selectedUnit?.callsign ?? "This unit"} cannot perform an Attack action.` });
        return;
      }
      setActionMode("ATTACK");
      setTargetUnitId(unit.id);
      setNotice({ tone: "info", message: `${unit.callsign} designated as the attack target.` });
      return;
    }
    if (!selectedUnit || orderType === "HOLD") return;
    const blocked = new Set(
      campaign.deployments
        .filter((deployment) => deployment.id !== selectedUnit.id && deployment.status !== "DESTROYED")
        .map((deployment) => `${deployment.position.q},${deployment.position.r}`),
    );
    blocked.delete(`${coord.q},${coord.r}`);
    const route = shortestPath(selectedUnit.position, coord, campaign.map, { blocked });
    if (route.length === 0) {
      setNotice({ tone: "danger", message: "No legal route reaches that hex." });
      return;
    }
    setDraftedRoute(route);
    setNotice(undefined);
  }

  async function submitOrder(lifecycle: "DRAFT" | "SUBMITTED" = "SUBMITTED") {
    if (!campaignId || !selectedUnit || (lifecycle === "SUBMITTED" && !canSubmit)) return;
    const actions: Array<Partial<StructuredAction>> = [];
    if (actionMode === "ATTACK" && targetUnit && participatingWeapons.length > 0 && orderType !== "RUSH") {
      actions.push({
        type: "ATTACK",
        targetDeploymentId: targetUnit.id,
        targetHex: targetUnit.position,
        equipmentIds: [],
      });
    } else if (actionMode === "RELOAD" && isMedicalUnit) {
      actions.push({ type: "RELOAD", equipmentIds: [] });
    } else if (actionMode === "RELOAD" && selectedWeapon) {
      actions.push({ type: "RELOAD", weaponId: selectedWeapon.id, equipmentIds: [] });
    } else if (actionMode === "LOAD" && supportTarget) {
      actions.push({ type: "LOAD", targetDeploymentId: supportTarget.id, equipmentIds: [] });
    } else if (actionMode === "UNLOAD" && supportTarget) {
      actions.push({
        type: "UNLOAD",
        targetDeploymentId: supportTarget.id,
        targetHex: selectedUnit.cargoProfile ? draftedRoute.at(-1) ?? selectedUnit.position : undefined,
        equipmentIds: [],
      });
    } else if (actionMode === "HEAL" && supportTarget) {
      actions.push({ type: "HEAL", targetDeploymentId: supportTarget.id, equipmentIds: [] });
    } else if (actionMode === "REPAIR" && supportTarget) {
      actions.push({
        type: "REPAIR",
        targetDeploymentId: supportTarget.id,
        equipmentIds: [],
        payload: repairKind === "HIT"
          ? { repairKind: "HIT" }
          : { repairKind: "SUBSYSTEM", subsystemId: selectedRepairSubsystem?.subsystemId },
      });
    } else if (actionMode === "CONSTRUCT" && selectedConstructionHex) {
      actions.push({
        type: "CONSTRUCT",
        targetHex: selectedConstructionHex,
        structureDefinitionId: "structure-sandbag-line",
        equipmentIds: [],
      });
    } else if (actionMode === "DIG_IN") {
      actions.push({ type: "DIG_IN", equipmentIds: [] });
    } else if (actionMode === "DEPLOY" || actionMode === "PACK_UP") {
      actions.push({ type: actionMode, equipmentIds: [] });
    } else if (actionMode === "BOMBARDMENT" && selectedBombardmentHex) {
      actions.push({ type: "BOMBARDMENT", targetHex: selectedBombardmentHex, equipmentIds: [] });
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/orders`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) },
        body: JSON.stringify({
          commandId: `order-${crypto.randomUUID()}`,
          expectedCampaignVersion: campaign.version,
          expectedOrderRevision: currentOrderRevision,
          unitId: selectedUnit.id,
          round: scheduledRound,
          orderType,
          lifecycle,
          route: orderType === "HOLD" ? [selectedUnit.position] : draftedRoute,
          facing: draftedFacing,
          actions,
          incidentalActions: [],
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await loadCampaign(true, campaignId);
      setNotice({
        tone: "success",
        message: `${selectedUnit.callsign} order ${lifecycle === "DRAFT" ? "saved as draft" : "submitted to campaign command"}.`,
      });
      setTimelineMode("ORDERS");
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Order submission failed." });
    } finally {
      setBusy(false);
    }
  }

  async function runCommand(path: string, init: RequestInit, success: string) {
    if (!campaignId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...(DEMO_HEADERS ?? {}), ...init.headers },
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await loadCampaign(true, campaignId);
      setNotice({ tone: "success", message: success });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Campaign command failed." });
    } finally {
      setBusy(false);
    }
  }

  async function joinCampaign(joinCampaignId: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${joinCampaignId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) },
        body: JSON.stringify({ commandId: `join-campaign-${crypto.randomUUID()}` }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await loadCampaignDirectory();
      const url = new URL(window.location.href);
      url.searchParams.set("campaign", joinCampaignId);
      window.history.replaceState({}, "", url);
      navigate("Deployment");
      setNotice({ tone: "success", message: "Campaign joined. Deploy a force to open your tactical command channel." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Campaign join failed." });
    } finally {
      setBusy(false);
    }
  }

  const visibleTimeline =
    timelineMode === "EVENTS"
      ? [...campaign.events].sort((left, right) => right.timestamp - left.timestamp).slice(0, 8)
      : ordersForRound
          .slice()
          .sort((left, right) => right.submittedAt - left.submittedAt)
          .map<CampaignEvent>((order, index) => ({
            eventId: `ui:${order.id}`,
            campaignId: campaign.campaignId,
            round: order.round,
            sequence: index,
            type: "ORDER_SUBMITTED",
            actor: campaign.deployments.find((deployment) => deployment.id === order.unitId)?.callsign ?? order.unitId,
            payload: { lifecycle: order.lifecycle, orderType: order.orderType },
            timestamp: order.submittedAt,
            visibility: "ALLIED",
          }));

  const strategicView = strategicViews.has(activeNav) ? activeNav as StrategicView : undefined;
  const tacticalContext = activeNav === "Campaigns" || activeNav === "Reports";
  const topbarCopy: Record<ActiveNav, { eyebrow: string; title: string }> = {
    Command: { eyebrow: "33RD EXPEDITIONARY // PERSISTENT WORLD", title: "Command Overview" },
    Galactic: { eyebrow: "HELION SYSTEM // STRATEGIC THEATRE", title: "Galactic Operations" },
    Battalion: { eyebrow: "COOPERATIVE ORGANISATION // ACTIVE MEMBERSHIP", title: "Battalion Command" },
    Ship: { eyebrow: "PRIMARY ORBITAL // BATTALION HOME", title: "CSV Resolute" },
    Forces: { eyebrow: "33RD EXPEDITIONARY BATTALION // MUSTER", title: "Persistent Force Registry" },
    Deployment: { eyebrow: "TACTICAL MUSTER // FORCE PROJECTION", title: "Deployment Planner" },
    Campaigns: connection === "ERROR"
      ? { eyebrow: "TACTICAL NETWORK // UNAVAILABLE", title: "Campaign Operations" }
      : { eyebrow: `ACTIVE OPERATION // ${campaign.planetName.toUpperCase()}`, title: campaign.campaignName },
    Reports: connection === "ERROR"
      ? { eyebrow: "TACTICAL ARCHIVE // UNAVAILABLE", title: "Campaign Reports" }
      : { eyebrow: `AFTER-ACTION ARCHIVE // ${campaign.planetName.toUpperCase()}`, title: "Campaign Reports" },
  };

  function navigate(next: ActiveNav) {
    setActiveNav(next);
    const url = new URL(window.location.href);
    if (next === "Command") url.searchParams.delete("view");
    else url.searchParams.set("view", next.toLowerCase());
    window.history.replaceState({}, "", url);
    setNotice(undefined);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <img src={brandMark} alt="Corinth's Plight crest" />
          <div>
            <span className="eyebrow">EXPEDITIONARY COMMAND</span>
            <strong>CORINTH'S PLIGHT</strong>
          </div>
        </div>
        <div className="campaign-title-block">
          <span className="eyebrow">{topbarCopy[activeNav].eyebrow}</span>
          <h1>{topbarCopy[activeNav].title}</h1>
          {tacticalContext && campaignDirectory.length > 1 ? (
            <select
              aria-label="Active campaign"
              value={campaignId ?? ""}
              onChange={(event) => setCampaignId(event.target.value || undefined)}
            >
              {campaignDirectory.filter((entry) => entry.canEnter).map((entry) => (
                <option key={entry.campaignId} value={entry.campaignId}>
                  {entry.name} · {entry.status}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="round-clock" aria-label={tacticalContext ? `Round ${campaign.round}, campaign ${countdown}` : "Persistent strategic layer; open Command for the authoritative clock"}>
          <Glyph name="clock" size={17} />
          {tacticalContext ? (
            <><div><span>ROUND {campaign.round}</span><strong>{countdown}</strong></div><small>{campaignTerminal ? "MISSION ENDED" : manualClock ? "UNTIMED" : `LOCK ${lockCountdown}`}</small></>
          ) : (
            <><div><span>STRATEGIC LAYER</span><strong>ASYNC</strong></div><small>SEE COMMAND<br />FOR CLOCK</small></>
          )}
        </div>
        <div className={`connection-pill ${tacticalContext ? connection.toLowerCase() : ""}`}>
          <i /> {tacticalContext ? connection === "LIVE" ? "CAMPAIGN LIVE" : connection : "PERSISTENT WORLD"}
        </div>
      </header>

      <nav className="rail" aria-label="Primary">
        {navigation.map(([icon, label]) => (
          <button
            className={activeNav === label ? "active" : ""}
            key={label}
            onClick={() => navigate(label)}
          >
            <Glyph name={icon} />
            <span>{label}</span>
          </button>
        ))}
        <button className="rail-settings" onClick={() => setNotice({ tone: "info", message: "Campaign operator controls are available in the command drawer." })}>
          <Glyph name="settings" />
          <span>Settings</span>
        </button>
      </nav>

      {strategicView ? (
        <StrategicWorkspace
          view={strategicView}
          onNavigate={(view) => navigate(view)}
          onNotice={setNotice}
        />
      ) : activeNav === "Forces" ? (
        <ForcesView onNotice={setNotice} />
      ) : activeNav === "Deployment" ? (
        <DeploymentPlanner onNotice={setNotice} />
      ) : (activeNav === "Campaigns" || activeNav === "Reports") && connection === "ERROR" ? (
        <main className="operations-layout">
          <section className="panel" style={{ gridColumn: "1 / -1", padding: "2rem" }}>
            <span className="eyebrow">PERSISTENT CAMPAIGN UNAVAILABLE</span>
            <h2>No local tactical state has been substituted</h2>
            <p>The authenticated campaign directory or campaign state could not be loaded. Retry the live service before issuing orders or reading reports.</p>
            <button onClick={() => void loadCampaignDirectory().then((selected) => selected ? loadCampaign(false, selected) : undefined)}>RETRY CAMPAIGN LINK</button>
          </section>
        </main>
      ) : activeNav === "Reports" ? (
        <CampaignReports
          campaign={campaign}
          campaignId={campaignId ?? campaign.campaignId}
          demoUser={import.meta.env.DEV ? DEMO_USER : undefined}
          onReturnToCampaign={() => navigate("Campaigns")}
        />
      ) : activeNav === "Campaigns" && !campaignId ? (
        <main className="operations-layout">
          <section className="panel" style={{ gridColumn: "1 / -1", padding: "2rem" }}>
            <span className="eyebrow">CAMPAIGN DIRECTORY</span>
            <h2>No playable campaign assigned</h2>
            <p>Your account is signed in, but none of your campaign memberships currently has authored tactical content.</p>
            {campaignDirectory.some((entry) => entry.canJoin) ? (
              <div className="composer-actions">
                {campaignDirectory.filter((entry) => entry.canJoin).map((entry) => (
                  <button key={entry.campaignId} disabled={busy} onClick={() => void joinCampaign(entry.campaignId)}>
                    JOIN {entry.name.toUpperCase()}
                  </button>
                ))}
              </div>
            ) : <p>Join an active operation from Battalion or return after command opens a deployment.</p>}
          </section>
        </main>
      ) : (
      <main className="operations-layout">
        <aside className="left-panel panel">
          <div className="panel-heading">
            <div><span className="eyebrow">BATTLEGROUP HAMMER</span><h2>Deployed forces</h2></div>
            <span className="readiness-count">{ownSubmitted}/{ownUnits.length}</span>
          </div>
          <div className="readiness-bar"><i style={{ width: `${ownUnits.length ? ownSubmitted / ownUnits.length * 100 : 0}%` }} /></div>
          <div className="panel-filter-row" aria-label="Deployed force roster scope">
            <button className={rosterScope === "MY_UNITS" ? "active" : ""} onClick={() => setRosterScope("MY_UNITS")}>MY UNITS</button>
            <button className={rosterScope === "ALLIED" ? "active" : ""} onClick={() => setRosterScope("ALLIED")}>ALLIED</button>
          </div>
          <div className="unit-roster">
            {rosterUnits.map((unit) => {
              const order = ordersForRound.find((candidate) => candidate.unitId === unit.id);
              const selected = unit.id === selectedUnit?.id;
              const inspectOnly = unit.ownerId !== campaign.viewer.userId;
              return (
                <button
                  className={`unit-card ${selected ? "selected" : ""} ${inspectOnly ? "inspect-only" : ""}`}
                  key={unit.id}
                  onClick={() => inspectOnly
                    ? setHovered({ coord: unit.position, unit })
                    : selectUnit(unit)}
                  title={inspectOnly ? "Allied formation: shared intention and status inspection only" : "Compose this unit's order"}
                >
                  <span className="unit-monogram">{unit.callsign.slice(0, 2)}</span>
                  <span className="unit-card-body">
                    <strong>{unit.callsign}</strong>
                    <small>{definitionLabel(unit)}</small>
                    {unit.subsystems?.some((subsystem) => subsystem.state === "DISABLED") && (
                      <small className="subsystem-alert">SYSTEM MALFUNCTION</small>
                    )}
                    <i className="health-track"><b style={{ width: `${unit.currentHealth / unit.stats.maxHealth * 100}%` }} /></i>
                  </span>
                  <span className={`order-state ${order ? order.lifecycle.toLowerCase() : "awaiting"}`}>
                    {order ? order.orderType : inspectOnly ? "ALLY" : "AWAITING"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="allied-intentions">
            <span className="eyebrow">ALLIED INTENTIONS</span>
            {campaign.orders
              .filter((order) => order.round === campaign.round && !ownUnits.some((unit) => unit.id === order.unitId))
              .slice(0, 3)
              .map((order) => (
                <div key={order.id}><i /><span>{campaign.deployments.find((unit) => unit.id === order.unitId)?.callsign ?? order.unitId}</span><strong>{order.orderType}</strong></div>
              ))}
          </div>
          <div className="objective-list">
            <span className="eyebrow">MISSION OBJECTIVES</span>
            {campaign.objectives.map((objective, index) => (
              <div key={objective.id} className={objective.owner.toLowerCase()}>
                <b>0{index + 1}</b><span>{objective.name}<small>{objective.owner} CONTROL</small></span>
              </div>
            ))}
          </div>
        </aside>

        <section className="map-panel" aria-label="Tactical operations map">
          <div className="map-toolbar">
            <div><span className="eyebrow">TACTICAL FEED</span><strong>{campaign.campaignName.toUpperCase()} // GRID {String(campaign.scenarioVersion).padStart(2, "0")}</strong></div>
            <div className="map-tools" aria-label="Tactical map layer">
              {(["SURFACE", "INTEL", "SUPPLY"] as TacticalMapLayer[]).map((layer) => (
                <button className={mapLayer === layer ? "active" : ""} key={layer} onClick={() => setMapLayer(layer)}>{layer}</button>
              ))}
            </div>
            <span className="map-version">STATE v{campaign.version}</span>
          </div>
          {campaign.outcome && (
            <div className={`campaign-terminal-overlay ${campaign.outcome.result.toLowerCase()}`} role="status">
              <span>{campaign.outcome.result === "VICTORY" ? "MISSION ACCOMPLISHED" : "MISSION FAILED"}</span>
              <strong>{campaignOutcomeMessage(campaign)}</strong>
              <small>Round {campaign.outcome.round} · campaign state locked</small>
              <small>Unit service records updated · Req reward remains balance required</small>
              <button onClick={() => navigate("Reports")}>OPEN AFTER-ACTION REPORT</button>
            </div>
          )}
          <HexMap
            campaign={campaign}
            layer={mapLayer}
            selectedUnitId={selectedUnit?.id}
            draftedRoute={draftedRoute}
            draftedFacing={draftedFacing}
            targetUnitId={targetUnitId}
            targetHex={actionMode === "BOMBARDMENT" ? selectedBombardmentHex : actionMode === "CONSTRUCT" ? selectedConstructionHex : undefined}
            onMapClick={planDestination}
            onHover={(coord, unit) => setHovered({ coord, unit })}
          />
          <div className="hover-inspector">
            <span>{hovered.coord ? `${hovered.coord.q}.${hovered.coord.r}` : "--.--"}</span>
            <strong>{hovered.unit?.callsign ?? campaign.map.find((hex) => hovered.coord && coordinatesEqual(hex.coord, hovered.coord))?.terrainId.replace("terrain-", "").toUpperCase() ?? "NO CONTACT"}</strong>
            <small>{hovered.unit
              ? mapLayer === "SUPPLY"
                ? `SMALL ${hovered.unit.supplies?.SMALL_SUPPLY ?? 0} · MEDICAL ${hovered.unit.supplies?.MEDICAL_SUPPLY ?? 0}`
                : mapLayer === "INTEL"
                  ? `${definitionLabel(hovered.unit)} · SENSOR ${hovered.unit.stats.sensors}`
                  : definitionLabel(hovered.unit)
              : mapLayer === "INTEL"
                ? `VISIBILITY ${campaign.map.find((hex) => hovered.coord && coordinatesEqual(hex.coord, hovered.coord))?.visibility ?? "UNKNOWN"}`
                : mapLayer === "SUPPLY" ? "HOVER AN ALLIED UNIT FOR SUPPLY" : "SELECT A HEX FOR INTEL"}</small>
          </div>
        </section>

        <aside className="right-panel panel">
          <div className="panel-heading right-heading">
            <div><span className="eyebrow">ORDER COMPOSER</span><h2>{selectedUnit?.callsign ?? "No unit"}</h2></div>
            <span className={`phase-badge ${campaign.phase.toLowerCase()}`}>{campaign.phase}</span>
          </div>
          {selectedUnit && selectedDefinition ? (
            <>
              <div className="unit-summary">
                <div className="summary-identity"><span>{selectedUnit.callsign.slice(0, 3)}</span><div><strong>{definitionLabel(selectedUnit)}</strong><small>{selectedUnit.status} · {selectedUnit.currentHealth}/{selectedUnit.stats.maxHealth} {selectedUnit.stats.healthModel === "HITS" ? "HITS" : "FS"}</small></div></div>
                {disabledSubsystems.length > 0 && (
                  <div className="subsystem-alert-strip" role="status">
                    {disabledSubsystems.map((subsystem) => (
                      <span key={subsystem.subsystemId}>{subsystem.subsystemId.replaceAll("_", " ")} OFFLINE</span>
                    ))}
                  </div>
                )}
                {dugIn && <div className="subsystem-alert-strip dug-in-strip" role="status"><span>DUG IN · +2 DEFENSE</span></div>}
                <div className="stat-grid">
                  <span><small>SPEED</small><b>{selectedUnit.stats.speed}</b></span>
                  <span><small>ARMOUR</small><b>{selectedUnit.stats.armor}</b></span>
                  <span><small>SENSORS</small><b>{selectedUnit.stats.sensors}</b></span>
                  <span><small>FACING</small><b>{FACING_LABELS[selectedUnit.facing]}</b></span>
                </div>
              </div>

              <section className="composer-step">
                <header><b>01</b><div><strong>Round & order</strong><small>Choose when and how this unit moves</small></div></header>
                <div className="round-selector">
                  <button disabled aria-label="Previous round unavailable">−</button>
                  <span>ROUND <b>{campaign.round}</b><small>CURRENT ONLY</small></span>
                  <button disabled aria-label="Future scheduling unavailable">+</button>
                </div>
                <div className="order-types">
                  {selectedAllowedOrders.map((type) => {
                    const definition = getTacticalOrderRule(type as OrderType);
                    return (
                    <button
                      className={orderType === type ? "active" : ""}
                      key={type}
                      disabled={!definition.executable || (mobilityDisabled && type !== "HOLD")}
                      title={definition.executable ? undefined : "Catalogued for a later deterministic resolver phase"}
                      onClick={() => {
                        setOrderType(type as OrderType);
                        if (type === "HOLD") setDraftedRoute([{ ...selectedUnit.position }]);
                        if (type === "RUSH") {
                          setTargetUnitId(undefined);
                          if (actionMode === "ATTACK") setActionMode("NONE");
                        }
                      }}
                    >{type.replaceAll("_", " ")}{!definition.executable ? " · SOON" : ""}</button>
                    );
                  })}
                </div>
              </section>

              <section className="composer-step">
                <header><b>02</b><div><strong>Route & facing</strong><small>Click the map to plot a destination</small></div></header>
                <div className="route-readout">
                  <Glyph name="route" size={18} />
                  <div><strong>{draftedRoute.length - 1} HEX{draftedRoute.length === 2 ? "" : "ES"}</strong><small>{routeResult.total.toFixed(1)} / {selectedUnit.stats.speed} SPEED</small></div>
                  <button onClick={() => setDraftedRoute([{ ...selectedUnit.position }])}>RESET</button>
                </div>
                {routeOverBudget && <p className="validation danger">Route exceeds this unit's speed budget.</p>}
                {orderType === "EVASIVE" && (
                  <p className={`validation ${evasiveRouteIncomplete ? "danger" : ""}`}>
                    EVASIVE: end at least {evasiveMinimumDisplacement} hexes from the start ({evasiveDisplacement} plotted). Active movement grants +3 Defense and applies −2 to this unit's attacks.
                  </p>
                )}
                {mobilityDisabled && draftedRoute.length > 1 && <p className="validation danger">Mobility subsystem offline. Repair this unit before moving.</p>}
                {!routeResult.legal && <p className="validation danger">{routeResult.reason}</p>}
                <div className="facing-control" aria-label="Final facing">
                  {FACING_LABELS.map((facing, index) => (
                    <button className={draftedFacing === index ? "active" : ""} key={facing} onClick={() => setDraftedFacing(index as Facing)}>{facing}</button>
                  ))}
                </div>
              </section>

              <section className="composer-step">
                <header><b>03</b><div><strong>Tactical action</strong><small>Choose one server-supported action</small></div></header>
                <div className="order-types action-types" aria-label="Tactical action">
                  <button
                    className={actionMode === "NONE" ? "active" : ""}
                    onClick={() => {
                      setActionMode("NONE");
                      setTargetUnitId(undefined);
                      setSupportTargetUnitId(undefined);
                    }}
                  >NO ACTION</button>
                  {executableComposerActions.map((type) => (
                    <button
                      className={actionMode === type ? "active" : ""}
                      key={type}
                      disabled={type === "ATTACK" && (orderType === "RUSH" || weaponSystemsDisabled)}
                      onClick={() => {
                        setActionMode(type);
                        if (type === "DIG_IN") {
                          setOrderType("HOLD");
                          setDraftedRoute([{ ...selectedUnit.position }]);
                        }
                        if (type !== "ATTACK") setTargetUnitId(undefined);
                        if (type === "RELOAD") setSelectedWeaponId(reloadableWeapons[0]?.id);
                        setSupportTargetUnitId(
                          type === "LOAD"
                            ? loadTargets[0]?.id
                            : type === "UNLOAD"
                              ? unloadTargets[0]?.id
                              : type === "HEAL"
                                ? healTargets[0]?.id
                                : type === "REPAIR"
                                  ? repairTargets[0]?.id
                                : undefined,
                        );
                        if (type === "REPAIR") {
                          const target = repairTargets[0];
                          const damagedSubsystem = target?.subsystems?.find((subsystem) => subsystem.state !== "OPERATIONAL");
                          setRepairKind(target && target.currentHealth < target.stats.maxHealth ? "HIT" : "SUBSYSTEM");
                          setRepairSubsystemId(damagedSubsystem?.subsystemId);
                        }
                        if (type === "CONSTRUCT") setConstructionTargetHex(constructionHexes[0]?.coord);
                        if (type === "BOMBARDMENT") setBombardmentTargetHex(bombardmentHexes[0]?.coord);
                      }}
                    >{type}</button>
                  ))}
                </div>
                {actionMode === "ATTACK" && selectedUnit.weapons.length > 0 ? (
                  <>
                    <label className="field-label">WEAPONS IN ACTIVATION</label>
                    <div className="weapon-activation-list" aria-label="Attack weapon participation">
                      {attackWeaponChecks.map(({ weapon, legal, reason }) => (
                        <p className={`validation ${targetUnit && !legal ? "danger" : ""}`} key={weapon.id}>
                          <strong>{weapon.name}</strong> · D{weapon.damage.sides} · R{weapon.range} · AP{weapon.armorPiercing} · {legal ? "FIRES" : reason ?? "SKIPPED"}
                        </p>
                      ))}
                    </div>
                    <div className={`target-card ${targetUnit ? "acquired" : ""}`}>
                      <Glyph name="target" size={18} />
                      {targetUnit ? <div><strong>{targetUnit.callsign}</strong><small>{definitionLabel(targetUnit)} · RANGE {targetRange}</small></div> : <div><strong>NO TARGET</strong><small>Click a visible hostile on the map</small></div>}
                      {targetUnit && <button onClick={() => setTargetUnitId(undefined)}>CLEAR</button>}
                    </div>
                    {noEligibleAttackWeapon && <p className="validation danger">No fitted weapon can engage this target from the planned position.</p>}
                    {highGroundAdvantage && <p className="validation">HIGH GROUND: this attack gains +1 to its damage result before mitigation.</p>}
                    {targetCover.armor === 1 && <p className="validation">TARGET IN COVER: +1 Armor applies from {targetCover.sources.map((source) => source.replaceAll("-", " ")).join(" + ")}.</p>}
                    {rapidFireReady && targetIsHorde && <p className="validation">RAPID FIRE: modified damage doubles against this Horde target before mitigation.</p>}
                    {orderType === "EVASIVE" && <p className="validation">EVASIVE FIRE: each outgoing damage result receives −2.</p>}
                    {weaponSystemsDisabled && <p className="validation danger">Weapon systems offline. An Engineer must repair this unit before it can fire.</p>}
                    {orderType === "RUSH" && <p className="validation">Rush doubles received damage and forbids attacks.</p>}
                  </>
                ) : actionMode === "ATTACK" ? (
                  <p className="validation danger">This unit has no executable weapon profile.</p>
                ) : actionMode === "RELOAD" && isMedicalUnit ? (
                  <>
                    <p className={`validation ${(selectedUnit.supplies?.SMALL_SUPPLY ?? 0) < 1 ? "danger" : ""}`}>
                      SMALL SUPPLY: {selectedUnit.supplies?.SMALL_SUPPLY ?? 0} · medical reload consumes 1
                    </p>
                    <p className={`validation ${(selectedUnit.supplies?.MEDICAL_SUPPLY ?? 0) >= medicalSupplyCapacity ? "danger" : ""}`}>
                      MEDICAL SUPPLY: {selectedUnit.supplies?.MEDICAL_SUPPLY ?? 0}/{medicalSupplyCapacity} · capacity follows current Medic Force Strength
                    </p>
                    <p className="validation">Restore all Medical Supply up to this Medic's current Force Strength.</p>
                  </>
                ) : actionMode === "RELOAD" ? (
                  <>
                    <label className="field-label" htmlFor="reload-weapon">WEAPON TO RELOAD</label>
                    <select
                      id="reload-weapon"
                      value={selectedWeapon?.id ?? ""}
                      onChange={(event) => setSelectedWeaponId(event.target.value)}
                      disabled={reloadableWeapons.length === 0}
                    >
                      {reloadableWeapons.map((weapon) => (
                        <option value={weapon.id} key={weapon.id}>
                          {weapon.name} · {selectedUnit.ammunition[weapon.id] ?? 0}/{weapon.ammoCapacity} AMMO
                        </option>
                      ))}
                    </select>
                    <p className={`validation ${(selectedUnit.supplies?.SMALL_SUPPLY ?? 0) < 1 ? "danger" : ""}`}>
                      SMALL SUPPLY: {selectedUnit.supplies?.SMALL_SUPPLY ?? 0} · reload consumes 1
                    </p>
                    {reloadableWeapons.length === 0 && <p className="validation">Every finite-ammo weapon is already full.</p>}
                  </>
                ) : actionMode === "HEAL" ? (
                  <>
                    <label className="field-label" htmlFor="heal-target">WOUNDED INFANTRY</label>
                    <select
                      id="heal-target"
                      value={supportTarget?.id ?? ""}
                      onChange={(event) => setSupportTargetUnitId(event.target.value)}
                      disabled={healTargets.length === 0}
                    >
                      {healTargets.map((deployment) => (
                        <option value={deployment.id} key={deployment.id}>
                          {deployment.callsign} · {deployment.currentHealth}/{deployment.stats.maxHealth} FORCE STRENGTH
                        </option>
                      ))}
                    </select>
                    <p className={`validation ${(selectedUnit.supplies?.MEDICAL_SUPPLY ?? 0) < 1 ? "danger" : ""}`}>
                      MEDICAL SUPPLY: {selectedUnit.supplies?.MEDICAL_SUPPLY ?? 0} · First Aid consumes 1
                    </p>
                    <p className="validation">
                      Restore D6 Force Strength to a wounded friendly Infantry unit in base contact, capped by this medic's current Force Strength.
                    </p>
                    {healTargets.length === 0 && <p className="validation danger">No wounded friendly Infantry unit is in base contact at the planned destination.</p>}
                  </>
                ) : actionMode === "REPAIR" ? (
                  <>
                    <label className="field-label" htmlFor="repair-target">DAMAGED VEHICLE</label>
                    <select
                      id="repair-target"
                      value={supportTarget?.id ?? ""}
                      onChange={(event) => {
                        const target = repairTargets.find((deployment) => deployment.id === event.target.value);
                        setSupportTargetUnitId(event.target.value);
                        setRepairKind(target && target.currentHealth < target.stats.maxHealth ? "HIT" : "SUBSYSTEM");
                        setRepairSubsystemId(target?.subsystems?.find((subsystem) => subsystem.state !== "OPERATIONAL")?.subsystemId);
                      }}
                      disabled={repairTargets.length === 0}
                    >
                      {repairTargets.map((deployment) => (
                        <option value={deployment.id} key={deployment.id}>
                          {deployment.callsign} · {deployment.currentHealth}/{deployment.stats.maxHealth} HITS
                        </option>
                      ))}
                    </select>
                    <div className="order-types repair-types" aria-label="Repair choice">
                      <button
                        className={repairKind === "HIT" ? "active" : ""}
                        disabled={!supportTarget || supportTarget.currentHealth >= supportTarget.stats.maxHealth}
                        onClick={() => setRepairKind("HIT")}
                      >RESTORE 1 HIT</button>
                      <button
                        className={repairKind === "SUBSYSTEM" ? "active" : ""}
                        disabled={repairableSubsystems.length === 0}
                        onClick={() => {
                          setRepairKind("SUBSYSTEM");
                          setRepairSubsystemId(repairableSubsystems[0]?.subsystemId);
                        }}
                      >REPAIR SUBSYSTEM</button>
                    </div>
                    {repairKind === "SUBSYSTEM" && (
                      <>
                        <label className="field-label" htmlFor="repair-subsystem">DAMAGED SUBSYSTEM</label>
                        <select
                          id="repair-subsystem"
                          value={selectedRepairSubsystem?.subsystemId ?? ""}
                          onChange={(event) => setRepairSubsystemId(event.target.value)}
                          disabled={repairableSubsystems.length === 0}
                        >
                          {repairableSubsystems.map((subsystem) => (
                            <option value={subsystem.subsystemId} key={subsystem.subsystemId}>
                              {subsystem.subsystemId.replaceAll("_", " ")} · {subsystem.state}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    <p className={`validation ${(selectedUnit.supplies?.SMALL_SUPPLY ?? 0) < 1 ? "danger" : ""}`}>
                      SMALL SUPPLY: {selectedUnit.supplies?.SMALL_SUPPLY ?? 0} · Engineer Repair consumes 1
                    </p>
                    <p className="validation">Restore one vehicle Hit or one damaged subsystem to a friendly vehicle in base contact.</p>
                    {repairTargets.length === 0 && <p className="validation danger">No damaged friendly vehicle is in base contact at the planned destination.</p>}
                  </>
                ) : actionMode === "CONSTRUCT" ? (
                  <>
                    <label className="field-label" htmlFor="construction-target">SANDBAG LINE HEX</label>
                    <select
                      id="construction-target"
                      value={selectedConstructionHex ? `${selectedConstructionHex.q},${selectedConstructionHex.r}` : ""}
                      onChange={(event) => {
                        const [q, r] = event.target.value.split(",").map(Number);
                        setConstructionTargetHex({ q, r });
                      }}
                      disabled={constructionHexes.length === 0}
                    >
                      {constructionHexes.map((hex) => (
                        <option value={`${hex.coord.q},${hex.coord.r}`} key={`${hex.coord.q},${hex.coord.r}`}>
                          HEX {hex.coord.q}.{hex.coord.r} · {coordinatesEqual(hex.coord, draftedRoute.at(-1) ?? selectedUnit.position) ? "CURRENT" : "ADJACENT"}
                        </option>
                      ))}
                    </select>
                    <p className={`validation ${(selectedUnit.supplies?.SMALL_SUPPLY ?? 0) < 1 ? "danger" : ""}`}>
                      SMALL SUPPLY: {selectedUnit.supplies?.SMALL_SUPPLY ?? 0} · Sandbag Line consumes 1
                    </p>
                    <p className="validation">STANDARD ACTION · 0.5 SPEED · Infantry in the hex gain +1 Armor against fire from outside it.</p>
                    {constructionHexes.length === 0 && <p className="validation danger">No current or adjacent known hex can accept another Sandbag Line.</p>}
                  </>
                ) : actionMode === "DIG_IN" ? (
                  <>
                    <p className="validation">Prepare this hex and gain +2 Defense. The bonus stacks with one Cover Armor source.</p>
                    <p className="validation">STANDARD ACTION · ALL SPEED · ends after this unit actually moves from the position.</p>
                    {dugIn && <p className="validation danger">This unit is already dug in.</p>}
                  </>
                ) : actionMode === "DEPLOY" || actionMode === "PACK_UP" ? (
                  <>
                    <p className="validation">
                      {actionMode === "DEPLOY"
                        ? "Deploy and unhitch the artillery platform. It may fire after deploying."
                        : "Pack and hitch the artillery platform. It may move from the next round."}
                    </p>
                    <p className="validation">STANDARD ACTION · 0.5 SPEED · CURRENT STATE: {artilleryDeployed ? "DEPLOYED" : "PACKED"}</p>
                  </>
                ) : actionMode === "BOMBARDMENT" ? (
                  <>
                    <label className="field-label" htmlFor="bombardment-target">SUPPRESSION TARGET HEX</label>
                    <select
                      id="bombardment-target"
                      aria-label="BOMBARDMENT TARGET HEX"
                      value={selectedBombardmentHex ? `${selectedBombardmentHex.q},${selectedBombardmentHex.r}` : ""}
                      onChange={(event) => {
                        const [q, r] = event.target.value.split(",").map(Number);
                        setBombardmentTargetHex({ q, r });
                      }}
                      disabled={bombardmentHexes.length === 0}
                    >
                      {bombardmentHexes.map((hex) => {
                        const affected = campaign.deployments.filter((deployment) =>
                          deployment.side !== selectedUnit.side &&
                          deployment.status !== "DESTROYED" &&
                          hexDistance(deployment.position, hex.coord) <= 1
                        ).length;
                        return (
                          <option value={`${hex.coord.q},${hex.coord.r}`} key={`${hex.coord.q},${hex.coord.r}`}>
                            HEX {hex.coord.q}.{hex.coord.r} · RANGE {hexDistance(selectedUnit.position, hex.coord)} · {affected} HOSTILE{affected === 1 ? "" : "S"}
                          </option>
                        );
                      })}
                    </select>
                    <p className={`validation ${(selectedUnit.supplies?.SMALL_SUPPLY ?? 0) < 1 ? "danger" : ""}`}>
                      SMALL SUPPLY: {selectedUnit.supplies?.SMALL_SUPPLY ?? 0} · Bombardment consumes 1
                    </p>
                    <p className="validation">PRIMARY ACTION · Radius 1 · hostile Defense −1 per active stack · requires a friendly spotter.</p>
                    {bombardmentHexes.length === 0 && <p className="validation danger">No known hex is within Artillery range.</p>}
                  </>
                ) : actionMode === "LOAD" || actionMode === "UNLOAD" ? (
                  <>
                    <label className="field-label" htmlFor="cargo-target">
                      {actionMode === "LOAD" ? "CARRIER / CARGO PARTNER" : "CARGO / CARRIER PARTNER"}
                    </label>
                    <select
                      id="cargo-target"
                      value={supportTarget?.id ?? ""}
                      onChange={(event) => setSupportTargetUnitId(event.target.value)}
                      disabled={supportTargets.length === 0}
                    >
                      {supportTargets.map((deployment) => (
                        <option value={deployment.id} key={deployment.id}>
                          {deployment.callsign} · {definitionLabel(deployment)}
                        </option>
                      ))}
                    </select>
                    <p className="validation">
                      {actionMode === "LOAD"
                        ? "Carrier and cargo must be co-located and both submit matching Load actions."
                        : "Carrier and embarked cargo must both submit matching Unload actions before lock."}
                    </p>
                    {supportTargets.length === 0 && (
                      <p className="validation danger">
                        No eligible {actionMode === "LOAD" ? "co-located loading partner" : "manifested cargo partner"} is available.
                      </p>
                    )}
                  </>
                ) : executableComposerActions.length === 0 ? (
                  <p className="validation">This unit has no additional executable tactical actions.</p>
                ) : (
                  <p className="validation">Movement and facing only. Select an action when needed.</p>
                )}
              </section>

              <div className="order-summary-card">
                <span>AUTO-GENERATED ORDER</span>
                <p><b>{selectedUnit.callsign}</b> will <b>{orderType.replaceAll("_", " ")}</b> to hex <b>{draftedRoute.at(-1)?.q}.{draftedRoute.at(-1)?.r}</b>, face <b>{FACING_LABELS[draftedFacing]}</b>{actionSummary ? <> and <b>{actionSummary}</b></> : ""}.</p>
              </div>
              <div className="composer-actions">
                <button className="secondary" disabled={busy || locked} onClick={() => void submitOrder("DRAFT")}>SAVE DRAFT</button>
                <button className="primary" disabled={busy || !canSubmit} onClick={() => void submitOrder("SUBMITTED")}>{busy ? "TRANSMITTING…" : currentOrder ? "UPDATE ORDER" : "SUBMIT ORDER"}</button>
              </div>
            </>
          ) : <div className="empty-panel">No owned deployment is available.</div>}

          {showOperatorControls && <details className="operator-drawer">
            <summary>CAMPAIGN OPERATOR CONTROLS</summary>
            <div>
              {(["manual", "1m", "5m", "30m", "24h"] as const).map((preset) => (
                <button key={preset} disabled={busy || campaignTerminal} onClick={() => void runCommand("/clock", {
                  method: "PATCH",
                  body: JSON.stringify({
                    commandId: `clock-${crypto.randomUUID()}`,
                    expectedCampaignVersion: campaign.version,
                    preset,
                  }),
                }, `Round clock set to ${preset}.`)}>{preset.toUpperCase()}</button>
              ))}
              <button disabled={busy || campaign.phase === "PAUSED" || campaignTerminal} onClick={() => void runCommand("/pause", { method: "POST" }, "Campaign clock paused.")}>PAUSE</button>
              <button disabled={busy || campaign.phase !== "PAUSED"} onClick={() => void runCommand("/resume", { method: "POST" }, "Campaign clock resumed.")}>RESUME</button>
              <button className="resolve" disabled={busy || campaign.phase === "PAUSED" || campaignTerminal} onClick={() => void runCommand("/resolve", { method: "POST", headers: { "x-expected-round": String(campaign.round) } }, `Round ${campaign.round} resolved.`)}>RESOLVE NOW</button>
            </div>
          </details>}
        </aside>

        <section className="timeline panel">
          <div className="timeline-tabs">
            <button className={timelineMode === "EVENTS" ? "active" : ""} onClick={() => setTimelineMode("EVENTS")}>ROUND EVENTS</button>
            <button className={timelineMode === "ORDERS" ? "active" : ""} onClick={() => setTimelineMode("ORDERS")}>SUBMITTED ORDERS <i>{ordersForRound.length}</i></button>
          </div>
          <div className="event-strip">
            {visibleTimeline.length ? visibleTimeline.map((event) => (
              <article key={event.eventId} className={event.type.toLowerCase()}>
                <span>{eventLabel(event)}</span><strong>{event.type.replaceAll("_", " ")}</strong><p>{formatEvent(event)}</p>
              </article>
            )) : <div className="no-events">No visible entries for this round.</div>}
          </div>
        </section>
      </main>
      )}

      {notice && (
        <div className={`notice ${notice.tone}`} role="status">
          <Glyph name={notice.tone === "danger" ? "target" : "signal"} size={18} />
          <span>{notice.message}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice(undefined)}>×</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return <AuthGateway><GameApp /></AuthGateway>;
}
