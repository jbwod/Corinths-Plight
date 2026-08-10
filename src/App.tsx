import { useCallback, useEffect, useMemo, useState } from "react";
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
  createDemoCampaignState,
  getUnitClass,
  getOrderTypeDefinition,
  hexDistance,
  projectCampaignState,
  shortestPath,
} from "../packages/rules-engine/src";
import brandMark from "../app/static/img/brand-icon.gif";
import { ForcesView } from "./components/ForcesView";
import { Glyph } from "./components/Glyph";
import { HexMap } from "./components/HexMap";
import { StrategicWorkspace, type StrategicView } from "./components/StrategicWorkspace";

const DEMO_USER = "demo-user";
const CAMPAIGN_ID = "outpost-k17";
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
  ["target", "Campaigns"],
  ["reports", "Reports"],
] as const;

type ActiveNav = Exclude<(typeof navigation)[number][1], "Reports">;

const strategicViews = new Set<ActiveNav>(["Command", "Galactic", "Battalion", "Ship"]);

function initialNavigation(): ActiveNav {
  const requested = new URLSearchParams(window.location.search).get("view")?.toLowerCase();
  const matched = navigation.find(([, label]) => label.toLowerCase() === requested)?.[1];
  return matched && matched !== "Reports" ? matched : "Command";
}

type ConnectionState = "CONNECTING" | "LIVE" | "RECONNECTING" | "LOCAL";
type Notice = { tone: "info" | "success" | "danger"; message: string };

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
  if (event.type === "UNIT_MOVED") return `${event.actor ?? "Unit"} completed its plotted movement.`;
  if (event.type === "UNIT_ATTACKED") return `${event.actor ?? "Unit"} engaged ${String(payload.targetId ?? "a hostile")}.`;
  if (event.type === "DAMAGE_APPLIED") return `${event.actor ?? "Unit"} lost ${String(payload.loss ?? "?")} strength.`;
  if (event.type === "UNIT_DESTROYED") return `${event.actor ?? "Unit"} was destroyed.`;
  if (event.type === "ROUND_FINISHED") return `Round ${event.round} resolved and archived.`;
  return event.type.replaceAll("_", " ").toLowerCase();
}

function eventLabel(event: CampaignEvent): string {
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `R${event.round} · ${time}`;
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

export default function App() {
  const [campaign, setCampaign] = useState<CampaignView>(initialCampaign);
  const [connection, setConnection] = useState<ConnectionState>("CONNECTING");
  const [now, setNow] = useState(() => Date.now());
  const [selectedUnitId, setSelectedUnitId] = useState("dep-rook-7");
  const [orderType, setOrderType] = useState<OrderType>("ADVANCE");
  const [draftedRoute, setDraftedRoute] = useState<AxialCoord[]>([{ q: -3, r: 1 }]);
  const [draftedFacing, setDraftedFacing] = useState<Facing>(2);
  const [targetUnitId, setTargetUnitId] = useState<string>();
  const [selectedWeaponId, setSelectedWeaponId] = useState<string>();
  const [scheduledRound, setScheduledRound] = useState(18);
  const [hovered, setHovered] = useState<{ coord?: AxialCoord; unit?: CampaignDeployment }>({});
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const [timelineMode, setTimelineMode] = useState<"ORDERS" | "EVENTS">("EVENTS");
  const [activeNav, setActiveNav] = useState<ActiveNav>(initialNavigation);

  const loadCampaign = useCallback(async (quiet = false) => {
    try {
      const response = await fetch(`/api/campaigns/${CAMPAIGN_ID}/state`, {
        headers: { "x-demo-user": DEMO_USER },
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const next = (await response.json()) as CampaignView;
      setCampaign(next);
      setConnection("LIVE");
      return next;
    } catch (error) {
      setConnection((current) => (current === "LIVE" ? "RECONNECTING" : "LOCAL"));
      if (!quiet) {
        setNotice({
          tone: "info",
          message: `Local tactical projection active. ${error instanceof Error ? error.message : "Campaign service is offline."}`,
        });
      }
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (activeNav !== "Campaigns") return;
    const initialLoad = window.setTimeout(() => void loadCampaign(), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [activeNav, loadCampaign]);

  useEffect(() => {
    if (activeNav !== "Campaigns") return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let reconnectTimer: number | undefined;
    let closed = false;
    let socket: WebSocket | undefined;

    const connect = () => {
      if (closed) return;
      try {
        socket = new WebSocket(
          `${protocol}//${window.location.host}/api/campaigns/${CAMPAIGN_ID}/ws?demo_user=${encodeURIComponent(DEMO_USER)}`,
        );
        socket.addEventListener("open", () => setConnection("LIVE"));
        socket.addEventListener("message", (event) => {
          const message = JSON.parse(String(event.data)) as { type?: string };
          if (message.type !== "connected" && message.type !== "pong") void loadCampaign(true);
        });
        socket.addEventListener("close", () => {
          if (closed) return;
          setConnection("RECONNECTING");
          reconnectTimer = window.setTimeout(connect, 2_500);
        });
        socket.addEventListener("error", () => socket?.close());
      } catch {
        setConnection("LOCAL");
      }
    };
    connect();
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [activeNav, loadCampaign]);

  const ownUnits = useMemo(
    () => campaign.deployments.filter((deployment) => deployment.ownerId === campaign.viewer.userId),
    [campaign.deployments, campaign.viewer.userId],
  );
  const selectedUnit =
    ownUnits.find((deployment) => deployment.id === selectedUnitId) ?? ownUnits.find((unit) => unit.status !== "DESTROYED");
  const selectedDefinition = selectedUnit ? getUnitClass(selectedUnit.definitionId) : undefined;
  const targetUnit = campaign.deployments.find((deployment) => deployment.id === targetUnitId);
  const selectedWeapon = selectedUnit?.weapons.find((weapon) => weapon.id === selectedWeaponId) ?? selectedUnit?.weapons[0];
  const currentOrder = campaign.orders.find(
    (order) => order.unitId === selectedUnit?.id && order.round === scheduledRound && order.lifecycle !== "CANCELLED",
  );
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
  const countdown = manualClock ? "MANUAL" : formatCountdown(campaign.clock.resolvesAt - now);
  const lockCountdown = manualClock ? "operator controlled" : formatCountdown(campaign.clock.lockAt - now);
  const routeOverBudget = Boolean(selectedUnit && routeResult.total > selectedUnit.stats.speed);
  const targetOutOfRange = Boolean(
    targetUnit && selectedWeapon && targetRange !== undefined && targetRange > selectedWeapon.range,
  );
  const canSubmit = Boolean(
    selectedUnit &&
      selectedDefinition &&
      routeResult.legal &&
      !routeOverBudget &&
      !locked &&
      (!targetUnit || (selectedWeapon && orderType !== "RUSH" && !targetOutOfRange)),
  );

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
    setTargetUnitId(order?.targets[0]);
    setSelectedWeaponId(order?.actions.find((action) => action.type === "ATTACK")?.weaponId ?? selectedUnit.weapons[0]?.id);
  }, [campaign.orders, scheduledRound, selectedUnit]);

  useEffect(() => {
    if (scheduledRound < campaign.round) {
      // A resolved round invalidates the old scheduling window.
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
    if (unit?.ownerId === campaign.viewer.userId) {
      selectUnit(unit);
      return;
    }
    if (unit?.side === "ENEMY") {
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
    if (!selectedUnit || (lifecycle === "SUBMITTED" && !canSubmit)) return;
    if (targetUnit && !selectedWeapon) return;
    const actions: Array<Partial<StructuredAction>> = [];
    if (targetUnit && orderType !== "RUSH") {
      actions.push({
        type: "ATTACK",
        economy: "STANDARD",
        targetDeploymentId: targetUnit.id,
        targetHex: targetUnit.position,
        weaponId: selectedWeapon!.id,
        equipmentIds: [],
        ammoRequested: selectedWeapon!.ammoCapacity === undefined ? undefined : 1,
      });
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${CAMPAIGN_ID}/orders`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-demo-user": DEMO_USER },
        body: JSON.stringify({
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
      await loadCampaign(true);
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
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${CAMPAIGN_ID}${path}`, {
        ...init,
        headers: { "content-type": "application/json", "x-demo-user": DEMO_USER, ...init.headers },
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await loadCampaign(true);
      setNotice({ tone: "success", message: success });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Campaign command failed." });
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
  const topbarCopy: Record<ActiveNav, { eyebrow: string; title: string }> = {
    Command: { eyebrow: "33RD EXPEDITIONARY // PERSISTENT WORLD", title: "Command Overview" },
    Galactic: { eyebrow: "HELION SYSTEM // STRATEGIC THEATRE", title: "Galactic Operations" },
    Battalion: { eyebrow: "COOPERATIVE ORGANISATION // ACTIVE MEMBERSHIP", title: "Battalion Command" },
    Ship: { eyebrow: "PRIMARY ORBITAL // BATTALION HOME", title: "CSV Resolute" },
    Forces: { eyebrow: "33RD EXPEDITIONARY BATTALION // MUSTER", title: "Persistent Force Registry" },
    Campaigns: { eyebrow: `ACTIVE OPERATION // ${campaign.planetName.toUpperCase()}`, title: campaign.campaignName },
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
        </div>
        <div className="round-clock" aria-label={activeNav === "Campaigns" ? `Round ${campaign.round}, ${countdown} remaining` : "Persistent strategic layer; open Command for the authoritative clock"}>
          <Glyph name="clock" size={17} />
          {activeNav === "Campaigns" ? (
            <><div><span>ROUND {campaign.round}</span><strong>{countdown}</strong></div><small>{manualClock ? "UNTIMED" : `LOCK ${lockCountdown}`}</small></>
          ) : (
            <><div><span>STRATEGIC LAYER</span><strong>ASYNC</strong></div><small>SEE COMMAND<br />FOR CLOCK</small></>
          )}
        </div>
        <div className={`connection-pill ${activeNav === "Campaigns" ? connection.toLowerCase() : ""}`}>
          <i /> {activeNav === "Campaigns" ? connection === "LIVE" ? "CAMPAIGN LIVE" : connection : "PERSISTENT WORLD"}
        </div>
      </header>

      <nav className="rail" aria-label="Primary">
        {navigation.map(([icon, label]) => (
          <button
            className={activeNav === label ? "active" : ""}
            key={label}
            onClick={() => {
              if (label === "Reports") {
                setNotice({ tone: "info", message: "Strategic reports remain deferred; use the Battalion activity feed and operation briefings in this checkpoint." });
                return;
              }
              navigate(label);
            }}
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
      ) : (
      <main className="operations-layout">
        <aside className="left-panel panel">
          <div className="panel-heading">
            <div><span className="eyebrow">BATTLEGROUP HAMMER</span><h2>Deployed forces</h2></div>
            <span className="readiness-count">{ownSubmitted}/{ownUnits.length}</span>
          </div>
          <div className="readiness-bar"><i style={{ width: `${ownUnits.length ? ownSubmitted / ownUnits.length * 100 : 0}%` }} /></div>
          <div className="panel-filter-row"><button className="active">MY UNITS</button><button>ALLIED</button></div>
          <div className="unit-roster">
            {ownUnits.map((unit) => {
              const order = ordersForRound.find((candidate) => candidate.unitId === unit.id);
              const selected = unit.id === selectedUnit?.id;
              return (
                <button className={`unit-card ${selected ? "selected" : ""}`} key={unit.id} onClick={() => selectUnit(unit)}>
                  <span className="unit-monogram">{unit.callsign.slice(0, 2)}</span>
                  <span className="unit-card-body">
                    <strong>{unit.callsign}</strong>
                    <small>{definitionLabel(unit)}</small>
                    <i className="health-track"><b style={{ width: `${unit.currentHealth / unit.stats.maxHealth * 100}%` }} /></i>
                  </span>
                  <span className={`order-state ${order ? order.lifecycle.toLowerCase() : "awaiting"}`}>
                    {order ? order.orderType : "AWAITING"}
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
            <div><span className="eyebrow">TACTICAL FEED</span><strong>SECTOR K-17 // GRID 04</strong></div>
            <div className="map-tools"><button className="active">SURFACE</button><button>INTEL</button><button>SUPPLY</button></div>
            <span className="map-version">STATE v{campaign.version}</span>
          </div>
          <HexMap
            campaign={campaign}
            selectedUnitId={selectedUnit?.id}
            draftedRoute={draftedRoute}
            draftedFacing={draftedFacing}
            targetUnitId={targetUnitId}
            onMapClick={planDestination}
            onHover={(coord, unit) => setHovered({ coord, unit })}
          />
          <div className="hover-inspector">
            <span>{hovered.coord ? `${hovered.coord.q}.${hovered.coord.r}` : "--.--"}</span>
            <strong>{hovered.unit?.callsign ?? campaign.map.find((hex) => hovered.coord && coordinatesEqual(hex.coord, hovered.coord))?.terrainId.replace("terrain-", "").toUpperCase() ?? "NO CONTACT"}</strong>
            <small>{hovered.unit ? definitionLabel(hovered.unit) : "SELECT A HEX FOR INTEL"}</small>
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
                  <button onClick={() => setScheduledRound(Math.max(campaign.round, scheduledRound - 1))}>−</button>
                  <span>ROUND <b>{scheduledRound}</b>{scheduledRound > campaign.round && <small>SCHEDULED</small>}</span>
                  <button onClick={() => setScheduledRound(Math.min(campaign.round + 8, scheduledRound + 1))}>+</button>
                </div>
                <div className="order-types">
                  {selectedDefinition.allowedOrders.map((type) => {
                    const definition = getOrderTypeDefinition(type as OrderType);
                    return (
                    <button
                      className={orderType === type ? "active" : ""}
                      key={type}
                      disabled={!definition.executable}
                      title={definition.executable ? undefined : "Catalogued for a later deterministic resolver phase"}
                      onClick={() => {
                        setOrderType(type as OrderType);
                        if (type === "HOLD") setDraftedRoute([{ ...selectedUnit.position }]);
                        if (type === "RUSH") setTargetUnitId(undefined);
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
                {!routeResult.legal && <p className="validation danger">{routeResult.reason}</p>}
                <div className="facing-control" aria-label="Final facing">
                  {FACING_LABELS.map((facing, index) => (
                    <button className={draftedFacing === index ? "active" : ""} key={facing} onClick={() => setDraftedFacing(index as Facing)}>{facing}</button>
                  ))}
                </div>
              </section>

              <section className="composer-step">
                <header><b>03</b><div><strong>Attack action</strong><small>Optional standard engagement</small></div></header>
                {selectedUnit.weapons.length > 0 ? (
                  <>
                    <label className="field-label" htmlFor="weapon">WEAPON</label>
                    <select id="weapon" value={selectedWeapon?.id ?? ""} onChange={(event) => setSelectedWeaponId(event.target.value)} disabled={orderType === "RUSH"}>
                      {selectedUnit.weapons.map((weapon) => <option value={weapon.id} key={weapon.id}>{weapon.name} · D{weapon.damage.sides} · R{weapon.range} · AP{weapon.armorPiercing}</option>)}
                    </select>
                    <div className={`target-card ${targetUnit ? "acquired" : ""}`}>
                      <Glyph name="target" size={18} />
                      {targetUnit ? <div><strong>{targetUnit.callsign}</strong><small>{definitionLabel(targetUnit)} · RANGE {targetRange}</small></div> : <div><strong>NO TARGET</strong><small>Click a visible hostile on the map</small></div>}
                      {targetUnit && <button onClick={() => setTargetUnitId(undefined)}>CLEAR</button>}
                    </div>
                    {targetOutOfRange && <p className="validation danger">Target is beyond the selected weapon's range.</p>}
                    {orderType === "RUSH" && <p className="validation">Rush doubles received damage and forbids attacks.</p>}
                  </>
                ) : <p className="validation">This unit has no active weapon profile. Use support actions in a later slice.</p>}
              </section>

              <div className="order-summary-card">
                <span>AUTO-GENERATED ORDER</span>
                <p><b>{selectedUnit.callsign}</b> will <b>{orderType.replaceAll("_", " ")}</b> to hex <b>{draftedRoute.at(-1)?.q}.{draftedRoute.at(-1)?.r}</b>, face <b>{FACING_LABELS[draftedFacing]}</b>{targetUnit ? <> and engage <b>{targetUnit.callsign}</b> with <b>{selectedWeapon?.name}</b></> : ""}.</p>
              </div>
              <div className="composer-actions">
                <button className="secondary" disabled={busy || locked} onClick={() => void submitOrder("DRAFT")}>SAVE DRAFT</button>
                <button className="primary" disabled={busy || !canSubmit} onClick={() => void submitOrder("SUBMITTED")}>{busy ? "TRANSMITTING…" : currentOrder ? "UPDATE ORDER" : "SUBMIT ORDER"}</button>
              </div>
            </>
          ) : <div className="empty-panel">No owned deployment is available.</div>}

          <details className="operator-drawer">
            <summary>DEVELOPMENT CLOCK CONTROLS</summary>
            <div>
              {(["manual", "1m", "5m", "30m", "24h"] as const).map((preset) => (
                <button key={preset} disabled={busy} onClick={() => void runCommand("/clock", { method: "PATCH", body: JSON.stringify({ preset }) }, `Round clock set to ${preset}.`)}>{preset.toUpperCase()}</button>
              ))}
              <button disabled={busy || campaign.phase === "PAUSED"} onClick={() => void runCommand("/pause", { method: "POST", body: "{}" }, "Campaign clock paused.")}>PAUSE</button>
              <button disabled={busy || campaign.phase !== "PAUSED"} onClick={() => void runCommand("/resume", { method: "POST", body: "{}" }, "Campaign clock resumed.")}>RESUME</button>
              <button className="resolve" disabled={busy || campaign.phase === "PAUSED"} onClick={() => void runCommand("/resolve", { method: "POST", body: "{}", headers: { "x-expected-round": String(campaign.round) } }, `Round ${campaign.round} resolved.`)}>RESOLVE NOW</button>
            </div>
          </details>
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
