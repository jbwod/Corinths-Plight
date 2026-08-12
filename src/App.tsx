import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AxialCoord,
  CampaignDeployment,
  CampaignEvent,
  CampaignMarkerDto,
  CampaignMarkerKind,
  CampaignOperationNoteDto,
  CampaignView,
  Facing,
  OrderType,
  StructuredAction,
} from "../packages/domain/src";
import {
  FACING_LABELS,
  CONSTRUCTIBLE_FIELDWORK_IDS,
  calculateRouteCost,
  canTarget,
  createDemoCampaignState,
  getTacticalActionRule,
  getFieldworkDefinition,
  getTacticalOrderRule,
  getUnitClass,
  hexDistance,
  INFANTRY_GARRISON_BUILDING,
  projectCampaignState,
  resolveTacticalCover,
  shortestPath,
  structureInstanceMatches,
  validateCargoManifest,
  validateBomberAttack,
  validateLimitedForwardArc,
  type ConstructibleFieldworkId,
} from "../packages/rules-engine/src";
import brandMark from "../app/static/img/brand-icon.gif";
import { ForcesView } from "./components/ForcesView";
import { DeploymentPlanner } from "./components/DeploymentPlanner";
import { Glyph } from "./components/Glyph";
import { HexMap, type TacticalMapLayer } from "./components/HexMap";
import { StrategicWorkspace, type StrategicView } from "./components/StrategicWorkspace";
import { AuthGateway } from "./components/AuthGateway";
import { CampaignReports } from "./components/CampaignReports";
import { UnitPortrait } from "./components/UnitVisual";

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
  role?: string;
  joinedAt?: number;
  memberCount?: number;
  minimumPlayers?: number;
  maximumPlayers?: number;
  deploymentCount?: number;
  scenarioAvailable: boolean;
  canEnter: boolean;
  canJoin?: boolean;
  canReinforce?: boolean;
  canWithdraw?: boolean;
  briefing?: {
    threat: string;
    objectives: string[];
    durationRounds: number;
    recommendedCapabilities: string[];
  };
  outcome?: {
    result: "VICTORY" | "DEFEAT";
    reason: string;
    round: number;
    rewards?: NonNullable<CampaignView["outcome"]>["rewards"];
    resolvedAt: number;
  };
}
const campaignCanOpen = (entry: CampaignDirectoryEntry): boolean => entry.canEnter || entry.outcome !== undefined;
type Notice = { tone: "info" | "success" | "danger"; message: string };
type ComposerActionMode = "NONE" | "ATTACK" | "DIG_IN" | "ARTILLERY_DIG_IN" | "RELOAD" | "RESUPPLY" | "LOAD" | "UNLOAD" | "AIRDROP" | "LAND" | "TAKE_OFF" | "REARM_AEROSPACE" | "HEAL" | "REPAIR" | "CREW_REPAIR" | "CONSTRUCT" | "TRENCH_UPGRADE" | "DEPLOY" | "PACK_UP" | "BOMBARDMENT";
type RepairKind = "HIT" | "SUBSYSTEM";
const composerActionModes: Exclude<ComposerActionMode, "NONE">[] = ["ATTACK", "DIG_IN", "ARTILLERY_DIG_IN", "RELOAD", "RESUPPLY", "LOAD", "UNLOAD", "AIRDROP", "LAND", "TAKE_OFF", "REARM_AEROSPACE", "HEAL", "REPAIR", "CREW_REPAIR", "CONSTRUCT", "TRENCH_UPGRADE", "DEPLOY", "PACK_UP", "BOMBARDMENT"];
const constructibleFieldworks = CONSTRUCTIBLE_FIELDWORK_IDS.map(getFieldworkDefinition);

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
  if (event.type === "ORDER_CANCELLED") return `Order withdrawn for ${event.actor ?? "unit"}.`;
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
  if (event.type === "UNIT_GARRISONED") return `${event.actor ?? "Infantry"} entered a building for +1 Cover Armor against outside fire.`;
  if (event.type === "UNIT_LEFT_GARRISON") return `${event.actor ?? "Infantry"} left its building garrison.`;
  if (event.type === "UNIT_DUG_IN") return payload.method === "ENGINEER_ARTILLERY_POSITION"
    ? `${event.actor ?? "Engineer"} dug in ${String(payload.targetId ?? "Artillery")} for +2 Defense.`
    : `${event.actor ?? "Unit"} dug in for +2 Defense.`;
  if (event.type === "UNIT_DUG_OUT") return `${event.actor ?? "Unit"} left its prepared position and lost Dig In Defense.`;
  if (event.type === "EVASIVE_MANEUVER") return payload.active === true
    ? `${event.actor ?? "Unit"} completed an Evasive maneuver for +3 Defense and −2 outgoing attacks.`
    : `${event.actor ?? "Unit"} was stopped before completing its Evasive maneuver.`;
  if (event.type === "UNIT_ATTACKED") return `${event.actor ?? "Unit"} engaged ${String(payload.targetId ?? "a hostile")}${payload.evasiveAttackModifier === -2 ? "; Evasive fire applied −2" : ""}${payload.coverArmor === 1 ? "; cover added +1 Armor" : ""}${payload.digInDefense === 2 ? "; Dig In added +2 Defense" : ""}${payload.evasiveDefenseModifier === 3 ? "; target Evasive added +3 Defense" : ""}${payload.crewRepairArmorExposed === true ? "; exposed crew received no Armor benefit" : ""}.`;
  if (event.type === "WEAPON_SKIPPED") return `${event.actor ?? "Unit"}'s ${String(payload.weaponId ?? "weapon")} did not fire: ${String(payload.reason ?? "not eligible")}.`;
  if (event.type === "DAMAGE_APPLIED") return `${event.actor ?? "Unit"} lost ${String(payload.loss ?? "?")} strength.`;
  if (event.type === "UNIT_HEALED") return `${event.actor ?? "Medic"} restored ${String(payload.amount ?? "?")} strength to ${String(payload.targetId ?? "an allied unit")}.`;
  if (event.type === "UNIT_REPAIRED") return payload.repairMethod === "CREW"
    ? `${event.actor ?? "Vehicle"}'s crew repaired ${String(payload.subsystemId ?? "a subsystem")} while exposed.`
    : `${event.actor ?? "Engineer"} repaired ${String(payload.targetId ?? "an allied vehicle")}.`;
  if (event.type === "SUPPLY_TRANSFERRED") {
    const amount = String(payload.quantity ?? 1);
    const resource = payload.resourceType === "MEDICAL_SUPPLY" ? "Medical Supply" : "Small Supply";
    return `${event.actor ?? "Logi"} restored ${amount} ${resource} to ${String(payload.targetId ?? "an allied unit")}.`;
  }
  if (event.type === "STRUCTURE_COMPLETED") return `${event.actor ?? "Engineer"} completed ${String(payload.structureName ?? "a fieldwork")} at ${String((payload.targetHex as AxialCoord | undefined)?.q ?? "?")}.${String((payload.targetHex as AxialCoord | undefined)?.r ?? "?")}.`;
  if (event.type === "STRUCTURE_UPGRADED") return `${event.actor ?? "Infantry"} upgraded a Sandbag Line into a Trench.`;
  if (event.type === "ARTILLERY_DEPLOYED") return `${event.actor ?? "Artillery"} deployed and is ready to fire.`;
  if (event.type === "ARTILLERY_PACKED") return `${event.actor ?? "Artillery"} packed up for movement.`;
  if (event.type === "ARTILLERY_BOMBARDED") return `${event.actor ?? "Artillery"} fired a suppression mission.`;
  if (event.type === "BOMBARDMENT_APPLIED") return `${String(payload.targetId ?? "Hostile unit")} lost Defense under bombardment.`;
  if (event.type === "BOMBARDMENT_RECOVERED") return `${event.actor ?? "Unit"} recovered one Defense from bombardment.`;
  if (event.type === "AIR_DROP_COMPLETED") return `${event.actor ?? "Heavy Air Transport"} dropped ${String(payload.cargoDeploymentId ?? "cargo")} at ${String((payload.targetHex as AxialCoord | undefined)?.q ?? "?")}.${String((payload.targetHex as AxialCoord | undefined)?.r ?? "?")}.`;
  if (event.type === "AIR_DROP_FAILED") return `${event.actor ?? "Heavy Air Transport"} retained its cargo: ${String(payload.reason ?? "drop conditions were unsafe")}.`;
  if (event.type === "AEROSPACE_LANDED") return `${event.actor ?? "Aerospace unit"} landed at a friendly airfield.`;
  if (event.type === "AEROSPACE_TOOK_OFF") return `${event.actor ?? "Aerospace unit"} took off and rejoined the battle.`;
  if (event.type === "AEROSPACE_REARMED") return `${event.actor ?? "Aerospace unit"} rearmed at the airfield.`;
  if (event.type === "AEROSPACE_INTERCEPTED") return `${event.actor ?? "Aerospace unit"} was intercepted by ${String(payload.interceptorId ?? "a Fighter")}.`;
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
  const [campaignMarkers, setCampaignMarkers] = useState<CampaignMarkerDto[]>([]);
  const [operationNotes, setOperationNotes] = useState<CampaignOperationNoteDto[]>([]);
  const [operationNoteText, setOperationNoteText] = useState("");
  const [operationNoteBattlegroupId, setOperationNoteBattlegroupId] = useState("");
  const [editingOperationNoteId, setEditingOperationNoteId] = useState<string>();
  const [markerMode, setMarkerMode] = useState<CampaignMarkerKind>();
  const [markerLabel, setMarkerLabel] = useState("");
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
  const [constructionDefinitionId, setConstructionDefinitionId] = useState<ConstructibleFieldworkId>("structure-sandbag-line");
  const [selectedWeaponId, setSelectedWeaponId] = useState<string>();
  const [scheduledRound, setScheduledRound] = useState(18);
  const [hovered, setHovered] = useState<{ coord?: AxialCoord; unit?: CampaignDeployment }>({});
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const [cancelConfirmOrderId, setCancelConfirmOrderId] = useState<string>();
  const [withdrawConfirmCampaignId, setWithdrawConfirmCampaignId] = useState<string>();
  const [timelineMode, setTimelineMode] = useState<"ORDERS" | "EVENTS">("EVENTS");
  const [rosterScope, setRosterScope] = useState<"MY_UNITS" | "ALLIED">("MY_UNITS");
  const [mapLayer, setMapLayer] = useState<TacticalMapLayer>("SURFACE");
  const [activeNav, setActiveNav] = useState<ActiveNav>(initialNavigation);
  const [campaignId, setCampaignId] = useState<string | undefined>(
    new URLSearchParams(window.location.search).get("campaign")
      ?? (import.meta.env.DEV ? DEFAULT_DEVELOPMENT_CAMPAIGN_ID : undefined),
  );
  const [campaignDirectory, setCampaignDirectory] = useState<CampaignDirectoryEntry[]>([]);
  const [campaignDirectoryOpen, setCampaignDirectoryOpen] = useState(
    () => new URLSearchParams(window.location.search).get("directory") === "1",
  );
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
    const selected = entries.find((entry) => entry.campaignId === campaignId && campaignCanOpen(entry))
      ?? entries.find(campaignCanOpen);
    setCampaignId(selected?.campaignId);
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("campaign", selected.campaignId);
    else url.searchParams.delete("campaign");
    window.history.replaceState({}, "", url);
    return selected?.campaignId;
  }, [campaignId]);

  const loadCampaign = useCallback(async (quiet = false, requestedCampaignId = campaignId) => {
    if (!requestedCampaignId) return undefined;
    try {
      const [response, markerResponse, noteResponse] = await Promise.all([
        fetch(`/api/campaigns/${requestedCampaignId}/state`, { headers: DEMO_HEADERS }),
        fetch(`/api/campaigns/${requestedCampaignId}/markers`, { headers: DEMO_HEADERS }),
        fetch(`/api/campaigns/${requestedCampaignId}/operation-notes`, { headers: DEMO_HEADERS }),
      ]);
      if (!response.ok) throw new Error(await errorMessage(response));
      if (!markerResponse.ok) throw new Error(await errorMessage(markerResponse));
      if (!noteResponse.ok) throw new Error(await errorMessage(noteResponse));
      const next = (await response.json()) as CampaignView;
      const markerBody = await markerResponse.json() as { markers?: CampaignMarkerDto[] };
      const noteBody = await noteResponse.json() as { notes?: CampaignOperationNoteDto[] };
      setCampaign(next);
      setCampaignMarkers(Array.isArray(markerBody.markers) ? markerBody.markers : []);
      setOperationNotes(Array.isArray(noteBody.notes) ? noteBody.notes : []);
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
  const aerospaceLanded = selectedUnit?.statuses.includes("LANDED") === true;
  const isAerospaceUnit = selectedUnit?.tags?.some((tag) => tag === "ATMO_FLIGHT" || tag === "VTOL") === true;
  const artilleryWeapon = selectedUnit?.weapons.find((weapon) => weapon.indirect) ?? selectedUnit?.weapons[0];
  const medicalSupplyCapacity = selectedUnit ? Math.max(0, Math.floor(selectedUnit.currentHealth)) : 0;
  const selectedCargoValidation = selectedUnit?.cargoProfile
    ? validateCargoManifest(selectedUnit.cargoProfile, selectedUnit.cargo ?? [])
    : undefined;
  const executableComposerActions = composerActionModes.filter((type) =>
    selectedAllowedActions.includes(type) &&
    getTacticalActionRule(type).executable &&
    (type !== "DEPLOY" || !artilleryDeployed) &&
    (type !== "PACK_UP" || artilleryDeployed) &&
    (type !== "BOMBARDMENT" || artilleryDeployed) &&
    (type !== "DIG_IN" || !dugIn) &&
    (type !== "LAND" || !aerospaceLanded) &&
    (type !== "TAKE_OFF" || aerospaceLanded) &&
    (type !== "REARM_AEROSPACE" || aerospaceLanded),
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
    const bombing = validateBomberAttack(
      selectedUnit.tags ?? [],
      weapon,
      draftedRoute,
      targetUnit.position,
      selectedUnit.ammunition[weapon.id] ?? 0,
    );
    const geometryTargeting = bombing.applies
      ? canTarget({ ...intendedAttacker, position: { ...targetUnit.position } }, targetUnit, weapon, campaign.map, campaign.deployments)
      : targeting;
    const arc = validateLimitedForwardArc(selectedUnit.tags ?? [], draftedRoute, selectedUnit.facing, targetUnit.position);
    const ammoAvailable = weapon.ammoCapacity === undefined || (selectedUnit.ammunition[weapon.id] ?? 0) > 0;
    // The resolver ticks an existing cooldown once before this attack phase.
    const cooldownReady = (selectedUnit.cooldowns[weapon.id] ?? 0) <= 1;
    return {
      weapon,
      legal: bombing.legal && geometryTargeting.legal && arc.legal && ammoAvailable && cooldownReady,
      reason: bombing.reason ?? geometryTargeting.reason ?? arc.reason ?? (!ammoAvailable ? "No ammunition." : !cooldownReady ? "Cooling down." : undefined),
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
      ? coLocatedAllies.filter((deployment) =>
          (deployment.locationState ?? "ON_MAP") === "ON_MAP" &&
          (!deployment.tags?.includes("ARTILLERY") ||
            ((selectedUnit.cargoProfile?.towCapacity ?? 0) > 0 && deployment.artilleryDeployment !== "DEPLOYED"))
        )
      : coLocatedAllies.filter((deployment) =>
          deployment.cargoProfile !== undefined &&
          (!selectedUnit.tags?.includes("ARTILLERY") ||
            ((deployment.cargoProfile?.towCapacity ?? 0) > 0 && selectedUnit.artilleryDeployment !== "DEPLOYED"))
        )
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
  const artilleryDigInTargets = selectedUnit ? campaign.deployments.filter((deployment) =>
    deployment.id !== selectedUnit.id &&
    deployment.side === selectedUnit.side &&
    deployment.status !== "DESTROYED" &&
    deployment.tags?.includes("ARTILLERY") === true &&
    (deployment.artilleryDeployment === "DEPLOYED" || deployment.statuses.includes("DEPLOYED")) &&
    !deployment.statuses.includes("DUG_IN") &&
    hexDistance(deployment.position, draftedRoute.at(-1) ?? selectedUnit.position) <= 1
  ) : [];
  const resupplyTargets = selectedUnit ? campaign.deployments.filter((deployment) =>
    deployment.id !== selectedUnit.id &&
    deployment.side === selectedUnit.side &&
    deployment.status !== "DESTROYED" &&
    (
      (deployment.tags?.includes("ARTILLERY") === true && (deployment.supplies?.SMALL_SUPPLY ?? 0) < 2) ||
      (deployment.tags?.includes("ENGINEER") === true && (deployment.supplies?.SMALL_SUPPLY ?? 0) < deployment.currentHealth) ||
      (deployment.tags?.includes("MEDICAL") === true && (deployment.supplies?.MEDICAL_SUPPLY ?? 0) < deployment.currentHealth)
    ) &&
    coordinatesEqual(deployment.position, draftedRoute.at(-1) ?? selectedUnit.position)
  ) : [];
  const supportTargets = actionMode === "LOAD"
    ? loadTargets
    : actionMode === "UNLOAD" || actionMode === "AIRDROP"
      ? unloadTargets
      : actionMode === "HEAL"
        ? healTargets
        : actionMode === "REPAIR"
          ? repairTargets
        : actionMode === "ARTILLERY_DIG_IN"
          ? artilleryDigInTargets
        : actionMode === "RESUPPLY"
          ? resupplyTargets
        : [];
  const supportTarget = supportTargets.find((deployment) => deployment.id === supportTargetUnitId) ?? supportTargets[0];
  const cargoPairIsTow = Boolean(
    supportTarget &&
    (selectedUnit?.tags?.includes("ARTILLERY") || supportTarget.tags?.includes("ARTILLERY")) &&
    ((selectedUnit?.cargoProfile?.towCapacity ?? 0) > 0 || (supportTarget.cargoProfile?.towCapacity ?? 0) > 0),
  );
  const repairableSubsystems = supportTarget?.subsystems?.filter((subsystem) => subsystem.state !== "OPERATIONAL") ?? [];
  const selectedRepairSubsystem = repairableSubsystems.find((subsystem) => subsystem.subsystemId === repairSubsystemId)
    ?? repairableSubsystems[0];
  const crewRepairableSubsystems = selectedUnit?.subsystems?.filter((subsystem) => subsystem.state !== "OPERATIONAL") ?? [];
  const selectedCrewRepairSubsystem = crewRepairableSubsystems.find((subsystem) => subsystem.subsystemId === repairSubsystemId)
    ?? crewRepairableSubsystems[0];
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
  const selectedConstructionFieldwork = getFieldworkDefinition(constructionDefinitionId);
  const constructionHexes = selectedUnit ? campaign.map
    .filter((hex) =>
      hex.visibility !== "UNKNOWN" &&
      hexDistance(draftedRoute.at(-1) ?? selectedUnit.position, hex.coord) <= 1 &&
      !hex.structureIds.some((id) => structureInstanceMatches(id, constructionDefinitionId))
    )
    .sort((left, right) =>
      hexDistance(draftedRoute.at(-1) ?? selectedUnit.position, left.coord) -
        hexDistance(draftedRoute.at(-1) ?? selectedUnit.position, right.coord) ||
      left.coord.q - right.coord.q || left.coord.r - right.coord.r
    ) : [];
  const selectedConstructionHex = constructionHexes.find((hex) =>
    constructionTargetHex && coordinatesEqual(hex.coord, constructionTargetHex)
  )?.coord ?? constructionHexes[0]?.coord;
  const plannedEndHex = draftedRoute.at(-1) ?? selectedUnit?.position;
  const plannedFacilityHex = plannedEndHex
    ? campaign.map.find((hex) => coordinatesEqual(hex.coord, plannedEndHex))
    : undefined;
  const plannedFacilityFriendly = Boolean(selectedUnit && plannedFacilityHex && (
    plannedFacilityHex.control === selectedUnit.side || (
      plannedFacilityHex.objectiveId !== undefined &&
      campaign.objectives.find((objective) => objective.id === plannedFacilityHex.objectiveId)?.owner === selectedUnit.side
    )
  ));
  const landingCapability = selectedUnit?.tags?.includes("VTOL") ? "LAND_VTOL" : "LAND_AEROSPACE";
  const canLandAtPlannedEnd = Boolean(
    plannedFacilityFriendly && plannedFacilityHex?.environment.includes(landingCapability),
  );
  const canRearmAtPlannedEnd = Boolean(
    plannedFacilityFriendly && plannedFacilityHex?.environment.includes("REARM_AEROSPACE"),
  );
  const aerospaceNeedsRearm = selectedUnit?.weapons.some((weapon) =>
    weapon.ammoCapacity !== undefined && (selectedUnit.ammunition[weapon.id] ?? 0) < weapon.ammoCapacity
  ) === true;
  const sandbagAtPlannedEnd = Boolean(plannedEndHex && campaign.map.find((hex) =>
    coordinatesEqual(hex.coord, plannedEndHex)
  )?.structureIds.some((id) => id === "structure-sandbag-line" || id.startsWith("structure-sandbag-line:")));
  const currentOrder = campaign.orders.find(
    (order) => order.unitId === selectedUnit?.id && order.round === scheduledRound && order.lifecycle !== "CANCELLED",
  );
  const currentOrderRevision = campaign.orders.find(
    (order) => order.unitId === selectedUnit?.id && order.round === campaign.round,
  )?.revision ?? 0;
  const routeResult = calculateRouteCost(draftedRoute, campaign.map, {
    rush: orderType === "RUSH",
    unitTags: selectedUnit?.tags,
  });
  const plannedGarrisonHex = draftedRoute.length > 1 && selectedUnit?.tags?.includes("INFANTRY") && selectedUnit.tags.includes("PERSONNEL")
    ? campaign.map.find((hex) => coordinatesEqual(hex.coord, draftedRoute.at(-1)!) && hex.environment.includes(INFANTRY_GARRISON_BUILDING))
    : undefined;
  const targetRange =
    targetUnit && draftedRoute.length > 0 ? hexDistance(draftedRoute.at(-1)!, targetUnit.position) : undefined;
  const ordersForRound = campaign.orders.filter(
    (order) => order.round === campaign.round && !["CANCELLED", "FAILED"].includes(order.lifecycle),
  );
  const commandUnits = campaign.deployments.filter((unit) =>
    unit.side === campaign.viewer.side &&
    !["DESTROYED", "WITHDRAWN"].includes(unit.status) &&
    (unit.locationState === undefined || unit.locationState === "ON_MAP")
  );
  const commandUnitIds = new Set(commandUnits.map((unit) => unit.id));
  const submittedCommandOrders = ordersForRound.filter((order) =>
    commandUnitIds.has(order.unitId) && order.lifecycle !== "DRAFT"
  );
  const draftingCommandUnits = commandUnits.filter((unit) =>
    ordersForRound.some((order) => order.unitId === unit.id && order.lifecycle === "DRAFT")
  );
  const missingCommandUnits = commandUnits.filter((unit) =>
    !ordersForRound.some((order) => order.unitId === unit.id)
  );
  const operationBattlegroups = [...new Set(commandUnits.flatMap((unit) => unit.battlegroupId ? [unit.battlegroupId] : []))].sort();
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
    (actionMode === "CREW_REPAIR" && Boolean(
      selectedCrewRepairSubsystem && orderType === "HOLD" && draftedRoute.length === 1
    )) ||
    (actionMode === "ARTILLERY_DIG_IN" && Boolean(isEngineerUnit && supportTarget)) ||
    (actionMode === "RESUPPLY" && Boolean(supportTarget && (selectedUnit?.supplies?.SMALL_SUPPLY ?? 0) > 0)) ||
    (actionMode === "CONSTRUCT" && Boolean(
      isEngineerUnit && selectedConstructionHex &&
      (selectedUnit?.supplies?.SMALL_SUPPLY ?? 0) >= selectedConstructionFieldwork.smallSupplyCost
    )) ||
    (actionMode === "TRENCH_UPGRADE" && Boolean(
      selectedUnit?.tags?.includes("INFANTRY") && plannedEndHex && sandbagAtPlannedEnd
    )) ||
    (actionMode === "DIG_IN" && !dugIn && orderType === "HOLD" && draftedRoute.length === 1) ||
    (actionMode === "DEPLOY" && isArtilleryUnit && !artilleryDeployed) ||
    (actionMode === "PACK_UP" && isArtilleryUnit && artilleryDeployed) ||
    (actionMode === "BOMBARDMENT" && Boolean(
      isArtilleryUnit && artilleryDeployed && selectedBombardmentHex && (selectedUnit?.supplies?.SMALL_SUPPLY ?? 0) > 0,
    )) ||
    (actionMode === "LAND" && Boolean(isAerospaceUnit && !aerospaceLanded && canLandAtPlannedEnd)) ||
    (actionMode === "TAKE_OFF" && Boolean(isAerospaceUnit && aerospaceLanded)) ||
    (actionMode === "REARM_AEROSPACE" && Boolean(
      isAerospaceUnit && aerospaceLanded && canRearmAtPlannedEnd && aerospaceNeedsRearm,
    )) ||
    ((actionMode === "LOAD" || actionMode === "UNLOAD" || actionMode === "AIRDROP") && Boolean(supportTarget));
  const canSubmit = Boolean(
    selectedUnit &&
      selectedDefinition &&
      routeResult.legal &&
      !routeOverBudget &&
      !evasiveRouteIncomplete &&
      !(mobilityDisabled && draftedRoute.length > 1) &&
      !(aerospaceLanded && draftedRoute.length > 1 && actionMode !== "TAKE_OFF") &&
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
        ? `${cargoPairIsTow ? "hitch for towing" : "coordinate loading"} with ${supportTarget.callsign}`
        : actionMode === "UNLOAD" && supportTarget
          ? `${cargoPairIsTow ? "unhitch" : "coordinate unloading"} with ${supportTarget.callsign}`
          : actionMode === "AIRDROP" && supportTarget
            ? `air drop ${supportTarget.callsign} at ${draftedRoute.at(-1)?.q}.${draftedRoute.at(-1)?.r}`
          : actionMode === "HEAL" && supportTarget
            ? `give First Aid to ${supportTarget.callsign}`
          : actionMode === "REPAIR" && supportTarget
            ? repairKind === "HIT"
              ? `restore one Hit to ${supportTarget.callsign}`
              : `repair ${selectedRepairSubsystem?.subsystemId ?? "a subsystem"} on ${supportTarget.callsign}`
          : actionMode === "CREW_REPAIR" && selectedCrewRepairSubsystem
            ? `expose the crew and repair ${selectedCrewRepairSubsystem.subsystemId}`
          : actionMode === "ARTILLERY_DIG_IN" && supportTarget
            ? `dig in deployed artillery ${supportTarget.callsign} for +2 Defense`
          : actionMode === "RESUPPLY" && supportTarget
            ? `transfer one Small Supply to ${supportTarget.callsign}`
          : actionMode === "CONSTRUCT" && selectedConstructionHex
            ? `build ${selectedConstructionFieldwork.name} at ${selectedConstructionHex.q}.${selectedConstructionHex.r}`
          : actionMode === "TRENCH_UPGRADE" && plannedEndHex
            ? `upgrade the Sandbag Line at ${plannedEndHex.q}.${plannedEndHex.r} into a Trench`
          : actionMode === "DIG_IN"
            ? "prepare this position for +2 Defense"
          : actionMode === "DEPLOY"
            ? "deploy and unhitch the artillery platform"
          : actionMode === "PACK_UP"
            ? "pack and hitch the artillery platform"
          : actionMode === "BOMBARDMENT" && selectedBombardmentHex
            ? `bombard hex ${selectedBombardmentHex.q}.${selectedBombardmentHex.r}`
          : actionMode === "LAND"
            ? `land at the friendly airfield on hex ${plannedEndHex?.q}.${plannedEndHex?.r}`
          : actionMode === "TAKE_OFF"
            ? "take off before following the plotted flight path"
          : actionMode === "REARM_AEROSPACE"
            ? "rearm all aerospace weapon stores"
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
      storedAction?.type === "LOAD" || storedAction?.type === "UNLOAD" || storedAction?.type === "AIRDROP" || storedAction?.type === "HEAL" || storedAction?.type === "REPAIR" || storedAction?.type === "ARTILLERY_DIG_IN"
        ? storedAction.targetDeploymentId ?? (typeof storedAction.payload?.cargoDeploymentId === "string" ? storedAction.payload.cargoDeploymentId : undefined)
        : undefined,
    );
    setRepairKind(storedAction?.type === "REPAIR" && storedAction.payload?.repairKind === "SUBSYSTEM" ? "SUBSYSTEM" : "HIT");
    setRepairSubsystemId(
      (storedAction?.type === "REPAIR" || storedAction?.type === "CREW_REPAIR") && typeof storedAction.payload?.subsystemId === "string"
        ? storedAction.payload.subsystemId
        : undefined,
    );
    setBombardmentTargetHex(storedAction?.type === "BOMBARDMENT" ? storedAction.targetHex : undefined);
    setConstructionTargetHex(storedAction?.type === "CONSTRUCT" ? storedAction.targetHex : undefined);
    if (storedAction?.type === "CONSTRUCT" && CONSTRUCTIBLE_FIELDWORK_IDS.includes(storedAction.structureDefinitionId as ConstructibleFieldworkId)) {
      setConstructionDefinitionId(storedAction.structureDefinitionId as ConstructibleFieldworkId);
    }
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
    setCancelConfirmOrderId(undefined);
    setNotice(undefined);
  }

  function planDestination(coord: AxialCoord, unit?: CampaignDeployment) {
    if (actionMode === "CONSTRUCT" && executableComposerActions.includes("CONSTRUCT")) {
      const eligible = constructionHexes.some((hex) => coordinatesEqual(hex.coord, coord));
      if (!eligible) {
        setNotice({ tone: "danger", message: `${selectedConstructionFieldwork.name} must be placed in the Engineer's current or an adjacent known hex.` });
        return;
      }
      setConstructionTargetHex(coord);
      setNotice({ tone: "info", message: `Hex ${coord.q}.${coord.r} designated for ${selectedConstructionFieldwork.name}.` });
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

  async function placeCampaignMarker(coord: AxialCoord) {
    if (!campaignId || !markerMode || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/markers`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) },
        body: JSON.stringify({
          commandId: `marker-${crypto.randomUUID()}`,
          operation: "PLACE",
          kind: markerMode,
          coord,
          label: markerLabel,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await loadCampaign(true, campaignId);
      setMarkerLabel("");
      setMarkerMode(undefined);
      setNotice({ tone: "success", message: `${markerMode} marker shared at ${coord.q}.${coord.r}.` });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Marker placement failed." });
    } finally {
      setBusy(false);
    }
  }

  async function removeCampaignMarker(markerId: string) {
    if (!campaignId || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/markers`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) },
        body: JSON.stringify({
          commandId: `marker-${crypto.randomUUID()}`,
          operation: "REMOVE",
          markerId,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await loadCampaign(true, campaignId);
      setNotice({ tone: "success", message: "Tactical marker cleared." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Marker removal failed." });
    } finally {
      setBusy(false);
    }
  }

  function editOperationNote(note: CampaignOperationNoteDto) {
    setEditingOperationNoteId(note.id);
    setOperationNoteText(note.text);
    setOperationNoteBattlegroupId(note.battlegroupId ?? "");
  }

  function resetOperationNoteComposer() {
    setEditingOperationNoteId(undefined);
    setOperationNoteText("");
    setOperationNoteBattlegroupId("");
  }

  async function saveOperationNote() {
    if (!campaignId || !operationNoteText.trim() || busy) return;
    const existing = operationNotes.find((note) => note.id === editingOperationNoteId);
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/operation-notes`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) },
        body: JSON.stringify(existing ? {
          commandId: `operation-note-${crypto.randomUUID()}`,
          operation: "UPDATE",
          noteId: existing.id,
          expectedRevision: existing.revision,
          text: operationNoteText,
          ...(operationNoteBattlegroupId ? { battlegroupId: operationNoteBattlegroupId } : {}),
        } : {
          commandId: `operation-note-${crypto.randomUUID()}`,
          operation: "ADD",
          text: operationNoteText,
          ...(operationNoteBattlegroupId ? { battlegroupId: operationNoteBattlegroupId } : {}),
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await loadCampaign(true, campaignId);
      resetOperationNoteComposer();
      setNotice({ tone: "success", message: existing ? "Operation note updated." : "Operation note shared with Allied command." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Operation note update failed." });
    } finally {
      setBusy(false);
    }
  }

  async function removeOperationNote(note: CampaignOperationNoteDto) {
    if (!campaignId || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/operation-notes`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) },
        body: JSON.stringify({
          commandId: `operation-note-${crypto.randomUUID()}`,
          operation: "REMOVE",
          noteId: note.id,
          expectedRevision: note.revision,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await loadCampaign(true, campaignId);
      if (editingOperationNoteId === note.id) resetOperationNoteComposer();
      setNotice({ tone: "success", message: "Operation note removed." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Operation note removal failed." });
    } finally {
      setBusy(false);
    }
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
    } else if (actionMode === "AIRDROP" && supportTarget) {
      actions.push({
        type: "AIRDROP",
        targetDeploymentId: supportTarget.id,
        targetHex: draftedRoute.at(-1) ?? selectedUnit.position,
        equipmentIds: [],
        payload: { cargoDeploymentId: supportTarget.id },
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
    } else if (actionMode === "CREW_REPAIR" && selectedCrewRepairSubsystem) {
      actions.push({
        type: "CREW_REPAIR",
        equipmentIds: [],
        payload: { subsystemId: selectedCrewRepairSubsystem.subsystemId },
      });
    } else if (actionMode === "ARTILLERY_DIG_IN" && supportTarget) {
      actions.push({ type: "ARTILLERY_DIG_IN", targetDeploymentId: supportTarget.id, equipmentIds: [] });
    } else if (actionMode === "RESUPPLY" && supportTarget) {
      actions.push({ type: "RESUPPLY", targetDeploymentId: supportTarget.id, equipmentIds: [] });
    } else if (actionMode === "CONSTRUCT" && selectedConstructionHex) {
      actions.push({
        type: "CONSTRUCT",
        targetHex: selectedConstructionHex,
        structureDefinitionId: constructionDefinitionId,
        equipmentIds: [],
      });
    } else if (actionMode === "TRENCH_UPGRADE" && plannedEndHex) {
      actions.push({ type: "TRENCH_UPGRADE", targetHex: plannedEndHex, equipmentIds: [] });
    } else if (actionMode === "DIG_IN") {
      actions.push({ type: "DIG_IN", equipmentIds: [] });
    } else if (actionMode === "DEPLOY" || actionMode === "PACK_UP") {
      actions.push({ type: actionMode, equipmentIds: [] });
    } else if (actionMode === "BOMBARDMENT" && selectedBombardmentHex) {
      actions.push({ type: "BOMBARDMENT", targetHex: selectedBombardmentHex, equipmentIds: [] });
    } else if (actionMode === "LAND" || actionMode === "TAKE_OFF" || actionMode === "REARM_AEROSPACE") {
      actions.push({ type: actionMode, equipmentIds: [] });
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
      setCancelConfirmOrderId(undefined);
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

  async function cancelOrder() {
    if (!campaignId || !selectedUnit || !currentOrder || locked || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/orders/${encodeURIComponent(currentOrder.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) },
        body: JSON.stringify({
          commandId: `cancel-order-${crypto.randomUUID()}`,
          expectedCampaignVersion: campaign.version,
          expectedOrderRevision: currentOrder.revision,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await loadCampaign(true, campaignId);
      setCancelConfirmOrderId(undefined);
      setTimelineMode("ORDERS");
      setNotice({ tone: "success", message: `${selectedUnit.callsign} order withdrawn. A replacement may be submitted before lock.` });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Order cancellation failed." });
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
      url.searchParams.delete("directory");
      window.history.replaceState({}, "", url);
      setCampaignId(joinCampaignId);
      setCampaignDirectoryOpen(false);
      navigate("Deployment");
      setNotice({ tone: "success", message: "Campaign joined. Deploy a force to open your tactical command channel." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Campaign join failed." });
    } finally {
      setBusy(false);
    }
  }

  function openDeployment(entry: CampaignDirectoryEntry) {
    const url = new URL(window.location.href);
    url.searchParams.set("campaign", entry.campaignId);
    window.history.replaceState({}, "", url);
    setCampaignId(entry.campaignId);
    setCampaignDirectoryOpen(false);
    navigate("Deployment");
  }

  function openCampaign(entry: CampaignDirectoryEntry) {
    const url = new URL(window.location.href);
    url.searchParams.set("campaign", entry.campaignId);
    url.searchParams.delete("directory");
    window.history.replaceState({}, "", url);
    setCampaignId(entry.campaignId);
    setCampaignDirectoryOpen(false);
    void loadCampaign(false, entry.campaignId);
  }

  function browseCampaigns() {
    const url = new URL(window.location.href);
    url.searchParams.set("directory", "1");
    window.history.replaceState({}, "", url);
    setCampaignDirectoryOpen(true);
  }

  async function withdrawCampaign(entry: CampaignDirectoryEntry) {
    if (!entry.canWithdraw || !entry.joinedAt) return;
    if (withdrawConfirmCampaignId !== entry.campaignId) {
      setWithdrawConfirmCampaignId(entry.campaignId);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${entry.campaignId}/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) },
        body: JSON.stringify({
          commandId: `withdraw-campaign-${crypto.randomUUID()}`,
          expectedJoinedAt: entry.joinedAt,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setWithdrawConfirmCampaignId(undefined);
      setCampaignId(undefined);
      const url = new URL(window.location.href);
      url.searchParams.delete("campaign");
      window.history.replaceState({}, "", url);
      await loadCampaignDirectory();
      setNotice({ tone: "success", message: `Left ${entry.name}. Its uncommitted deployment plans were cancelled.` });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Campaign withdrawal failed." });
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
              onChange={(event) => {
                const nextCampaignId = event.target.value || undefined;
                const url = new URL(window.location.href);
                if (nextCampaignId) url.searchParams.set("campaign", nextCampaignId);
                else url.searchParams.delete("campaign");
                window.history.replaceState({}, "", url);
                setCampaignId(nextCampaignId);
              }}
            >
              {campaignDirectory.filter(campaignCanOpen).map((entry) => (
                <option key={entry.campaignId} value={entry.campaignId}>
                  {entry.name} · {entry.status}
                </option>
              ))}
            </select>
          ) : null}
          {activeNav === "Campaigns" && !campaignDirectoryOpen && <button className="campaign-browser-button" onClick={browseCampaigns}>BROWSE CAMPAIGNS</button>}
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
        <DeploymentPlanner
          onNotice={setNotice}
          onCampaignReady={(readyCampaignId) => {
            setCampaignId(readyCampaignId);
            setCampaignDirectoryOpen(false);
            navigate("Campaigns");
            void loadCampaign(false, readyCampaignId);
          }}
        />
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
          onReturnToGalactic={() => navigate("Galactic")}
        />
      ) : activeNav === "Campaigns" && (campaignDirectoryOpen || !campaignId) ? (
        <main className="campaign-directory-layout">
          <header className="campaign-directory-hero panel">
            <div><span className="eyebrow">CAMPAIGN DIRECTORY</span><h2>Choose your next operation</h2><p>Joined operations remain staged here until a persistent force is deployed. Public recruiting campaigns can be joined without exposing private campaign data.</p></div>
            <dl><div><dt>JOINED</dt><dd>{campaignDirectory.filter((entry) => !entry.canJoin).length}</dd></div><div><dt>RECRUITING</dt><dd>{campaignDirectory.filter((entry) => entry.canJoin).length}</dd></div></dl>
          </header>
          <section className="campaign-directory-section panel">
            <header><div><span className="eyebrow">YOUR ASSIGNMENTS</span><h3>Staged campaigns</h3></div></header>
            <div className="campaign-directory-grid">
              {campaignDirectory.filter((entry) => !entry.canJoin).map((entry) => (
                <article key={entry.campaignId} className="campaign-directory-card joined">
                  <header><span>{entry.planetName}</span><b>{entry.status}</b></header>
                  <h4>{entry.name}</h4>
                  <p>{entry.briefing?.objectives.join(" · ") ?? "Awaiting an authored operation briefing."}</p>
                  <dl><div><dt>THREAT</dt><dd>{entry.briefing?.threat ?? "UNKNOWN"}</dd></div><div><dt>DURATION</dt><dd>{entry.briefing ? `${entry.briefing.durationRounds} ROUNDS` : "UNSET"}</dd></div><div><dt>FORCE</dt><dd>{entry.deploymentCount ? `${entry.deploymentCount} DEPLOYED` : "NOT DEPLOYED"}</dd></div></dl>
                  <footer>
                    {entry.canEnter && <button className="primary" disabled={busy} onClick={() => openCampaign(entry)}>OPEN CAMPAIGN</button>}
                    {entry.status === "RECRUITING" && entry.scenarioAvailable && <button className="primary" disabled={busy} onClick={() => openDeployment(entry)}>PLAN DEPLOYMENT</button>}
                    {entry.canReinforce && entry.scenarioAvailable && <button disabled={busy} onClick={() => openDeployment(entry)}>REINFORCE</button>}
                    {entry.canWithdraw && <button className={withdrawConfirmCampaignId === entry.campaignId ? "danger confirm" : "danger"} disabled={busy} onClick={() => void withdrawCampaign(entry)}>{withdrawConfirmCampaignId === entry.campaignId ? "CONFIRM LEAVE" : "LEAVE CAMPAIGN"}</button>}
                  </footer>
                  {withdrawConfirmCampaignId === entry.campaignId && <small className="campaign-withdraw-warning">This cancels your uncommitted plans. Once units deploy, tactical extraction rules apply instead.</small>}
                </article>
              ))}
              {!campaignDirectory.some((entry) => !entry.canJoin) && <p className="campaign-directory-empty">No staged campaign memberships. Join a recruiting operation below.</p>}
            </div>
          </section>
          <section className="campaign-directory-section panel">
            <header><div><span className="eyebrow">OPEN OPERATIONS</span><h3>Recruiting campaigns</h3></div></header>
            <div className="campaign-directory-grid">
              {campaignDirectory.filter((entry) => entry.canJoin).map((entry) => (
                <article key={entry.campaignId} className="campaign-directory-card">
                  <header><span>{entry.planetName}</span><b>{entry.status}</b></header>
                  <h4>{entry.name}</h4>
                  <p>{entry.briefing?.objectives.join(" · ") ?? "Authoritative scenario briefing available after assignment."}</p>
                  <dl><div><dt>THREAT</dt><dd>{entry.briefing?.threat ?? "UNKNOWN"}</dd></div><div><dt>COMMANDERS</dt><dd>{entry.memberCount ?? 0}/{entry.maximumPlayers ?? "—"}</dd></div><div><dt>DURATION</dt><dd>{entry.briefing ? `${entry.briefing.durationRounds} ROUNDS` : "UNSET"}</dd></div></dl>
                  <footer><button className="primary" disabled={busy} onClick={() => void joinCampaign(entry.campaignId)}>JOIN CAMPAIGN</button></footer>
                </article>
              ))}
              {!campaignDirectory.some((entry) => entry.canJoin) && <p className="campaign-directory-empty">No public authored campaigns are recruiting right now.</p>}
            </div>
          </section>
        </main>
      ) : (
      <main className="operations-layout">
        <aside className="left-panel panel">
          <div className="panel-heading">
            <div><span className="eyebrow">ALLIED COMMAND NET</span><h2>Deployed forces</h2></div>
            <span className="readiness-count" aria-label={`${submittedCommandOrders.length} of ${commandUnits.length} Allied units submitted`}>{submittedCommandOrders.length}/{commandUnits.length}</span>
          </div>
          <div className="readiness-bar"><i style={{ width: `${commandUnits.length ? submittedCommandOrders.length / commandUnits.length * 100 : 0}%` }} /></div>
          <div className="panel-filter-row" aria-label="Deployed force roster scope">
            <button className={rosterScope === "MY_UNITS" ? "active" : ""} onClick={() => setRosterScope("MY_UNITS")}>MY UNITS</button>
            <button className={rosterScope === "ALLIED" ? "active" : ""} onClick={() => setRosterScope("ALLIED")}>ALLIED</button>
          </div>
          <button className="campaign-panel-browser" onClick={browseCampaigns}>BROWSE CAMPAIGN DIRECTORY</button>
          <section className="command-readiness" aria-label="Allied order readiness">
            <header><span>ROUND {campaign.round} READINESS</span><strong>{missingCommandUnits.length === 0 && draftingCommandUnits.length === 0 ? "READY TO LOCK" : "ORDERS REQUIRED"}</strong></header>
            <div>
              <span><b>{submittedCommandOrders.length}</b>SUBMITTED</span>
              <span><b>{draftingCommandUnits.length}</b>DRAFTING</span>
              <span><b>{missingCommandUnits.length}</b>MISSING</span>
            </div>
            {missingCommandUnits.length > 0
              ? <p><b>AWAITING</b> {missingCommandUnits.map((unit) => unit.callsign).join(" · ")}</p>
              : draftingCommandUnits.length > 0
                ? <p><b>UNSUBMITTED DRAFTS</b> {draftingCommandUnits.map((unit) => unit.callsign).join(" · ")}</p>
                : <p><b>ALLIED FORMATION READY</b> Every operational on-map unit has submitted.</p>}
          </section>
          <section className="operation-notes" aria-label="Round operation notes">
            <header><span>OPERATION NOTES · ROUND {campaign.round}</span><b>{operationNotes.length}/16</b></header>
            <div className="operation-note-list">
              {operationNotes.map((note) => (
                <article key={note.id} className={note.own ? "own" : ""}>
                  <header><span>{note.battlegroupId?.replace("battlegroup-", "BG ").toUpperCase() ?? "ALLIED COMMAND"}</span><small>{note.own ? "YOU" : "ALLY"} · v{note.revision}</small></header>
                  <p>{note.text}</p>
                  {(note.canEdit || note.canRemove) && <footer>
                    {note.canEdit && <button type="button" onClick={() => editOperationNote(note)}>EDIT</button>}
                    {note.canRemove && <button type="button" className="danger" onClick={() => void removeOperationNote(note)}>REMOVE</button>}
                  </footer>}
                </article>
              ))}
              {operationNotes.length === 0 && <p className="operation-note-empty">No shared plan for this round yet.</p>}
            </div>
            <div className="operation-note-composer">
              <textarea
                aria-label="Allied operation note"
                maxLength={500}
                placeholder="Share the plan, timing, fire support, fallback, or commander intent…"
                value={operationNoteText}
                disabled={campaign.phase !== "PLANNING" || busy}
                onChange={(event) => setOperationNoteText(event.target.value)}
              />
              <div>
                <select aria-label="Operation note Battlegroup" value={operationNoteBattlegroupId} onChange={(event) => setOperationNoteBattlegroupId(event.target.value)}>
                  <option value="">ALLIED COMMAND</option>
                  {operationBattlegroups.map((id) => <option key={id} value={id}>{id.replace("battlegroup-", "BG ").toUpperCase()}</option>)}
                </select>
                {editingOperationNoteId && <button type="button" onClick={resetOperationNoteComposer}>CANCEL</button>}
                <button type="button" className="primary" disabled={campaign.phase !== "PLANNING" || busy || !operationNoteText.trim()} onClick={() => void saveOperationNote()}>{editingOperationNoteId ? "SAVE" : "SHARE"}</button>
              </div>
            </div>
          </section>
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
                  <UnitPortrait
                    definitionId={unit.definitionId}
                    tags={[
                      ...unit.weapons.flatMap((weapon) => weapon.tags),
                      ...(unit.abilities ?? []).map((ability) => ability.abilityId),
                    ]}
                    label={definitionLabel(unit)}
                    className="unit-monogram"
                  />
                  <span className="unit-card-body">
                    <strong>{unit.callsign}</strong>
                    <small>{definitionLabel(unit)}</small>
                    {unit.subsystems?.some((subsystem) => subsystem.state === "DISABLED") && (
                      <small className="subsystem-alert">SYSTEM MALFUNCTION</small>
                    )}
                    <i className="health-track"><b style={{ width: `${unit.currentHealth / unit.stats.maxHealth * 100}%` }} /></i>
                  </span>
                  <span className={`order-state ${order ? order.lifecycle.toLowerCase() : "awaiting"}`}>
                    {order ? order.lifecycle === "DRAFT" ? "DRAFT" : order.orderType : "MISSING"}
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
            <div>
              <span className="eyebrow">TACTICAL FEED</span>
              <strong>{campaign.campaignName.toUpperCase()} // {campaign.scenarioVersion === undefined ? "LIVE GRID" : `SCENARIO v${String(campaign.scenarioVersion).padStart(2, "0")}`}</strong>
            </div>
            <div className="map-tools" aria-label="Tactical map layer">
              {(["SURFACE", "INTEL", "SUPPLY"] as TacticalMapLayer[]).map((layer) => (
                <button className={mapLayer === layer ? "active" : ""} key={layer} onClick={() => setMapLayer(layer)}>{layer}</button>
              ))}
            </div>
            <span className="map-version">STATE v{campaign.version}</span>
          </div>
          <div className="marker-tools" aria-label="Shared tactical marker controls">
            <span>SHARED MARKER</span>
            {(["PING", "MOVE", "ATTACK", "DEFEND", "SUPPORT"] as CampaignMarkerKind[]).map((kind) => (
              <button
                type="button"
                className={markerMode === kind ? `active ${kind.toLowerCase()}` : kind.toLowerCase()}
                key={kind}
                aria-pressed={markerMode === kind}
                disabled={campaign.phase !== "PLANNING" || busy}
                onClick={() => setMarkerMode((current) => current === kind ? undefined : kind)}
              >{kind}</button>
            ))}
            <input
              aria-label="Optional tactical marker label"
              maxLength={80}
              placeholder={markerMode ? "OPTIONAL CALL-OUT" : "SELECT MARKER, THEN HEX"}
              value={markerLabel}
              disabled={!markerMode}
              onChange={(event) => setMarkerLabel(event.target.value)}
            />
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
            markers={campaignMarkers}
            layer={mapLayer}
            selectedUnitId={selectedUnit?.id}
            draftedRoute={draftedRoute}
            draftedFacing={draftedFacing}
            targetUnitId={targetUnitId}
            targetHex={actionMode === "BOMBARDMENT" ? selectedBombardmentHex : actionMode === "CONSTRUCT" ? selectedConstructionHex : undefined}
            onMapClick={(coord, unit) => markerMode ? void placeCampaignMarker(coord) : planDestination(coord, unit)}
            onRemoveMarker={(markerId) => void removeCampaignMarker(markerId)}
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
                {selectedCargoValidation && (
                  <p className={`validation ${selectedCargoValidation.legal ? "" : "danger"}`}>
                    CARGO {selectedCargoValidation.slotsUsedQuarters / 4}/{selectedCargoValidation.capacitySlotsQuarters / 4} SLOTS
                    {(selectedUnit.cargo ?? []).length > 0
                      ? ` · ${(selectedUnit.cargo ?? []).map((item) =>
                          item.transportMode === "TOWED"
                            ? `TOWING ${campaign.deployments.find((unit) => unit.id === item.unitId)?.callsign ?? item.unitId ?? "UNIT"}`
                            : item.kind === "SUPPLY"
                              ? `${item.quantity} ${String(item.supplyType ?? "SUPPLY").replaceAll("_", " ")}`
                              : campaign.deployments.find((unit) => unit.id === item.unitId)?.callsign ?? item.kind
                        ).join(" · ")}`
                      : " · EMPTY"}
                  </p>
                )}
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
                {plannedGarrisonHex && <p className="validation">GARRISON: entering this building costs 0.25 Speed and grants non-stacking +1 Cover Armor against attacks from outside the hex.</p>}
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
                        if (type === "CREW_REPAIR") {
                          setOrderType("HOLD");
                          setDraftedRoute([{ ...selectedUnit.position }]);
                          setRepairSubsystemId(crewRepairableSubsystems[0]?.subsystemId);
                        }
                        if (type !== "ATTACK") setTargetUnitId(undefined);
                        if (type === "RELOAD") setSelectedWeaponId(reloadableWeapons[0]?.id);
                        setSupportTargetUnitId(
                          type === "LOAD"
                            ? loadTargets[0]?.id
                            : type === "UNLOAD"
                              ? unloadTargets[0]?.id
                              : type === "AIRDROP"
                                ? unloadTargets[0]?.id
                              : type === "HEAL"
                                ? healTargets[0]?.id
                                : type === "REPAIR"
                                  ? repairTargets[0]?.id
                                : type === "ARTILLERY_DIG_IN"
                                  ? artilleryDigInTargets[0]?.id
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
                    >{type === "ARTILLERY_DIG_IN" ? "DIG IN ARTILLERY" : type === "CREW_REPAIR" ? "CREW REPAIR" : type}</button>
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
                    {selectedUnit.tags?.includes("AEROSPACE_INTERCEPTOR") && targetUnit?.tags?.includes("AEROSPACE") && (
                      <p className="validation">INTERCEPTOR · this declaration forces the targeted aerospace unit to attack a legal intercepting Fighter or lose its attack.</p>
                    )}
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
                ) : actionMode === "RESUPPLY" ? (
                  <>
                    <label className="field-label" htmlFor="resupply-target">FIELD RESUPPLY TARGET</label>
                    <select
                      id="resupply-target"
                      aria-label="FIELD RESUPPLY TARGET"
                      value={supportTarget?.id ?? ""}
                      onChange={(event) => setSupportTargetUnitId(event.target.value)}
                      disabled={resupplyTargets.length === 0}
                    >
                      {resupplyTargets.map((deployment) => (
                        <option value={deployment.id} key={deployment.id}>
                          {deployment.callsign} · {deployment.tags?.includes("MEDICAL")
                            ? `${deployment.supplies?.MEDICAL_SUPPLY ?? 0}/${deployment.currentHealth} MEDICAL SUPPLY`
                            : `${deployment.supplies?.SMALL_SUPPLY ?? 0}/${deployment.tags?.includes("ARTILLERY") ? 2 : deployment.currentHealth} SMALL SUPPLY`}
                        </option>
                      ))}
                    </select>
                    <p className={`validation ${(selectedUnit.supplies?.SMALL_SUPPLY ?? 0) < 1 ? "danger" : ""}`}>
                      LOGI STOCK: {selectedUnit.supplies?.SMALL_SUPPLY ?? 0}/10 SMALL SUPPLY
                    </p>
                    <p className="validation">STANDARD ACTION · 0.5 SPEED · refill a co-located Medic, Engineer, or Artillery unit. The server chooses the resource and amount.</p>
                    {resupplyTargets.length === 0 && <p className="validation danger">Move into the same hex as an eligible support unit below its current capacity.</p>}
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
                ) : actionMode === "CREW_REPAIR" ? (
                  <>
                    <label className="field-label" htmlFor="crew-repair-subsystem">DAMAGED SUBSYSTEM</label>
                    <select
                      id="crew-repair-subsystem"
                      value={selectedCrewRepairSubsystem?.subsystemId ?? ""}
                      onChange={(event) => setRepairSubsystemId(event.target.value)}
                      disabled={crewRepairableSubsystems.length === 0}
                    >
                      {crewRepairableSubsystems.map((subsystem) => (
                        <option value={subsystem.subsystemId} key={subsystem.subsystemId}>
                          {subsystem.subsystemId.replaceAll("_", " ")} · {subsystem.state}
                        </option>
                      ))}
                    </select>
                    <p className="validation">PRIMARY ACTION · full stationary round · repair one subsystem.</p>
                    <p className="validation danger">CREW EXPOSED: this unit receives no Armor benefit during the round.</p>
                    {crewRepairableSubsystems.length === 0 && <p className="validation danger">This vehicle has no damaged subsystem.</p>}
                  </>
                ) : actionMode === "ARTILLERY_DIG_IN" ? (
                  <>
                    <label className="field-label" htmlFor="artillery-dig-in-target">DEPLOYED ARTILLERY</label>
                    <select
                      id="artillery-dig-in-target"
                      aria-label="DEPLOYED ARTILLERY"
                      value={supportTarget?.id ?? ""}
                      onChange={(event) => setSupportTargetUnitId(event.target.value)}
                      disabled={artilleryDigInTargets.length === 0}
                    >
                      {artilleryDigInTargets.map((deployment) => (
                        <option value={deployment.id} key={deployment.id}>{deployment.callsign} · DEPLOYED</option>
                      ))}
                    </select>
                    <p className="validation">STANDARD ACTION · 0.5 SPEED · no Supply cost · target gains +2 Defense.</p>
                    <p className="validation">The Engineer must finish adjacent; the Artillery unit must remain deployed and stationary this round.</p>
                    {artilleryDigInTargets.length === 0 && <p className="validation danger">No eligible deployed friendly Artillery unit is adjacent to the planned destination.</p>}
                  </>
                ) : actionMode === "CONSTRUCT" ? (
                  <>
                    <label className="field-label" htmlFor="construction-fieldwork">FIELDWORK</label>
                    <select
                      id="construction-fieldwork"
                      value={constructionDefinitionId}
                      onChange={(event) => {
                        const definitionId = event.target.value as ConstructibleFieldworkId;
                        setConstructionDefinitionId(definitionId);
                        const next = campaign.map.find((hex) =>
                          hex.visibility !== "UNKNOWN" &&
                          hexDistance(draftedRoute.at(-1) ?? selectedUnit.position, hex.coord) <= 1 &&
                          !hex.structureIds.some((id) => structureInstanceMatches(id, definitionId))
                        );
                        setConstructionTargetHex(next?.coord);
                      }}
                    >
                      {constructibleFieldworks.map((fieldwork) => (
                        <option value={fieldwork.id} key={fieldwork.id}>{fieldwork.name}</option>
                      ))}
                    </select>
                    <label className="field-label" htmlFor="construction-target">TARGET HEX</label>
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
                      SMALL SUPPLY: {selectedUnit.supplies?.SMALL_SUPPLY ?? 0} · {selectedConstructionFieldwork.name} consumes {selectedConstructionFieldwork.smallSupplyCost}
                    </p>
                    <p className="validation">
                      STANDARD ACTION · 0.5 SPEED · {selectedConstructionFieldwork.id === "structure-sandbag-line"
                        ? "Infantry in the hex gain +1 Armor against fire from outside it."
                        : selectedConstructionFieldwork.id === "structure-razor-wire"
                          ? "Infantry pay +0.5 Speed when entering this hex."
                          : "Vehicles pay +1 Speed when entering this hex."}
                    </p>
                    {constructionHexes.length === 0 && <p className="validation danger">No current or adjacent known hex can accept another {selectedConstructionFieldwork.name}.</p>}
                  </>
                ) : actionMode === "TRENCH_UPGRADE" ? (
                  <>
                    <p className="validation">PRIMARY ACTION · No additional Supply · converts the occupied Sandbag Line into a Trench.</p>
                    <p className="validation">Infantry that are Dug In preserve the +2 Defense while moving between connected Trench hexes.</p>
                    {!sandbagAtPlannedEnd && <p className="validation danger">End the plotted route on a Sandbag Line to upgrade it.</p>}
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
                ) : actionMode === "LAND" || actionMode === "TAKE_OFF" || actionMode === "REARM_AEROSPACE" ? (
                  <>
                    <p className="validation">
                      {actionMode === "LAND"
                        ? "STANDARD ACTION · 0.5 SPEED · finish at a friendly compatible airfield."
                        : actionMode === "TAKE_OFF"
                          ? "STANDARD ACTION · 0.5 SPEED · take off before following the plotted flight path."
                          : "PRIMARY ACTION · restore every authored aerospace ammunition store at a friendly rearm facility."}
                    </p>
                    <p className="validation">FLIGHT STATE: {aerospaceLanded ? "LANDED" : "AIRBORNE"} · END HEX: {plannedEndHex?.q}.{plannedEndHex?.r}</p>
                    {actionMode === "LAND" && !canLandAtPlannedEnd && <p className="validation danger">The plotted endpoint is not a friendly compatible airfield.</p>}
                    {actionMode === "REARM_AEROSPACE" && !canRearmAtPlannedEnd && <p className="validation danger">This hex cannot rearm aerospace units.</p>}
                    {actionMode === "REARM_AEROSPACE" && !aerospaceNeedsRearm && <p className="validation danger">All fitted aerospace weapons are already fully armed.</p>}
                  </>
                ) : actionMode === "LOAD" || actionMode === "UNLOAD" || actionMode === "AIRDROP" ? (
                  <>
                    <label className="field-label" htmlFor="cargo-target">
                      {actionMode === "LOAD" ? "CARRIER / CARGO PARTNER" : actionMode === "AIRDROP" ? "MANIFESTED DROP UNIT" : "CARGO / CARRIER PARTNER"}
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
                      {actionMode === "AIRDROP"
                        ? "The selected Infantry or Light Vehicle exits at the route endpoint for no Speed cost. The flight path must be straight and the destination clear; hazardous drops fail closed."
                        : actionMode === "LOAD"
                        ? cargoPairIsTow
                          ? "Packed Artillery and Logi must be co-located and both submit matching Load actions to hitch. Towing uses no cargo slot."
                          : "Carrier and cargo must be co-located and both submit matching Load actions."
                        : cargoPairIsTow
                          ? "Logi and towed Artillery must both submit matching Unload actions to unhitch in the carrier hex."
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
                {currentOrder && cancelConfirmOrderId === currentOrder.id && (
                  <p className="cancel-warning" role="status">Withdraw this {currentOrder.lifecycle.toLowerCase()} order? The unit returns to MISSING until a replacement is submitted.</p>
                )}
              </div>
              <div className={`composer-actions ${currentOrder && ["DRAFT", "SUBMITTED"].includes(currentOrder.lifecycle) ? "with-cancel" : ""}`}>
                {currentOrder && ["DRAFT", "SUBMITTED"].includes(currentOrder.lifecycle) && (
                  <button
                    className={`cancel ${cancelConfirmOrderId === currentOrder.id ? "confirm" : ""}`}
                    disabled={busy || locked}
                    onClick={() => cancelConfirmOrderId === currentOrder.id
                      ? void cancelOrder()
                      : setCancelConfirmOrderId(currentOrder.id)}
                  >
                    {cancelConfirmOrderId === currentOrder.id
                      ? "CONFIRM WITHDRAW"
                      : currentOrder.lifecycle === "DRAFT" ? "DELETE DRAFT" : "WITHDRAW ORDER"}
                  </button>
                )}
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
