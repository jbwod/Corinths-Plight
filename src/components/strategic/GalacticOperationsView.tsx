import { useEffect, useMemo, useState } from "react";
import type {
  OperationView,
  StrategicDataMode,
  StrategicNodeView,
  StrategicSnapshot,
} from "../../strategic/model";
import { resolveStrategicMap, submitStrategicOrder } from "../../strategic/api";
import type { StrategicView } from "../StrategicWorkspace";

interface GalacticOperationsViewProps {
  snapshot: StrategicSnapshot;
  mode: StrategicDataMode;
  onNavigate: (view: StrategicView | "Forces" | "Campaigns" | "Deployment") => void;
  onNotice: (notice: { tone: "info" | "success" | "danger"; message: string }) => void;
  onRequestOperationDetail: (operationId: string) => Promise<void>;
  onStrategicChanged: () => Promise<void>;
}

type OperationsTab = "MAP" | "BOARD";
type MapPresentation = "VISUAL" | "LIST";
type MapScale = "PLANET" | "SYSTEM";
type MapFilter = "OPERATIONS" | "FRIENDLY_FORCES" | "SUPPLY" | "ROUTES";

const statusOrder = ["ACTIVE", "MUSTERING", "ANNOUNCED", "AVAILABLE", "RESOLVED", "FAILED", "CANCELLED"];

function operationAtNode(operations: OperationView[], node: StrategicNodeView): OperationView[] {
  return operations.filter((operation) => operation.nodeId === node.id || node.operationIds.includes(operation.id));
}

function routeLabel(value: number | null): string {
  return value === null ? "BALANCE REQUIRED" : `${value} STRATEGIC ROUND${value === 1 ? "" : "S"}`;
}

const systemNodeTypes = new Set(["ORBIT", "PLANET", "STATION", "JUMP_POINT"]);

function isSystemNode(node: StrategicNodeView): boolean {
  return systemNodeTypes.has(node.type.toUpperCase());
}

function planetNodePosition(node: StrategicNodeView): { x: number; y: number } {
  if (node.type.toUpperCase() === "ORBIT") return { x: 13, y: 24 };
  return {
    x: Math.max(20, Math.min(80, 15 + node.x * .7)),
    y: Math.max(24, Math.min(80, 18 + node.y * .75)),
  };
}

function systemNodePosition(node: StrategicNodeView): { x: number; y: number } {
  switch (node.type.toUpperCase()) {
    case "ORBIT": return { x: 41, y: 26 };
    case "STATION": return { x: 62, y: 39 };
    case "PLANET": return { x: 76, y: 69 };
    case "JUMP_POINT": return { x: 88, y: 18 };
    default: return { x: node.x, y: node.y };
  }
}

function routePath(from: { x: number; y: number }, to: { x: number; y: number }, index: number, scale: MapScale): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const bend = scale === "PLANET" ? Math.min(6, distance * .12) * (index % 2 === 0 ? 1 : -1) : 0;
  const controlX = (from.x + to.x) / 2 - (dy / distance) * bend;
  const controlY = (from.y + to.y) / 2 + (dx / distance) * bend;
  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}

function MapShipIcon() {
  return <svg viewBox="0 0 32 18" aria-hidden="true"><path d="M2 11h5l4-6h9l3 3h6v3h-6l-3 3h-9l-4-2H2v-1Zm10-4-2 3h10l-2-3h-6Z" /></svg>;
}

function PlanetProjection() {
  return (
    <svg className="planet-projection" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="corinth-ocean" cx="38%" cy="30%" r="70%">
          <stop offset="0" stopColor="#5ba09a" />
          <stop offset=".48" stopColor="#285d5d" />
          <stop offset=".82" stopColor="#102f34" />
          <stop offset="1" stopColor="#061416" />
        </radialGradient>
        <radialGradient id="corinth-shade" cx="33%" cy="27%" r="72%">
          <stop offset=".54" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".78" />
        </radialGradient>
        <clipPath id="corinth-sphere"><circle cx="50" cy="50" r="38" /></clipPath>
        <filter id="corinth-noise" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency=".055" numOctaves="4" seed="17" />
          <feColorMatrix values=".2 0 0 0 .3  0 .45 0 0 .42  0 0 .42 0 .4  0 0 0 .28 0" />
        </filter>
      </defs>
      <circle className="planet-orbit-ring outer" cx="50" cy="50" r="46" />
      <circle className="planet-orbit-ring" cx="50" cy="50" r="42" />
      <circle className="planet-atmosphere" cx="50" cy="50" r="39.5" />
      <g clipPath="url(#corinth-sphere)">
        <circle cx="50" cy="50" r="38" fill="url(#corinth-ocean)" />
        <rect x="10" y="10" width="80" height="80" filter="url(#corinth-noise)" opacity=".42" />
        <g className="planet-surface-drift">
          <g className="planet-landmass">
            <path d="M22 25 31 18l11 2 6 7-2 8-8 4-2 8-8 3-9-7-2-10 5-8Z" />
            <path d="m49 14 12 3 8 8-3 8-8 3-1 8-7 5-6-6 3-8-2-9 4-12Z" />
            <path d="m61 48 13-4 10 7 2 12-8 13-12 5-7-8 2-9-6-7 6-9Z" />
            <path d="m25 56 10-5 9 4 2 11-7 13-10 5-8-8 1-11 3-9Z" />
          </g>
          <g className="planet-grid-lines">
            <ellipse cx="50" cy="50" rx="38" ry="13" />
            <ellipse cx="50" cy="50" rx="38" ry="27" />
            <ellipse cx="50" cy="50" rx="17" ry="38" />
            <ellipse cx="50" cy="50" rx="30" ry="38" />
          </g>
        </g>
        <rect className="planet-scan-sweep" x="12" y="18" width="76" height="10" />
        <circle cx="50" cy="50" r="38" fill="url(#corinth-shade)" />
      </g>
      <path className="planet-scan-mark" d="M10 50h5m70 0h5M50 10v5m0 70v5" />
    </svg>
  );
}

function SystemProjection() {
  return (
    <svg className="system-projection" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="helion-star" cx="42%" cy="38%" r="60%">
          <stop offset="0" stopColor="#fff1b5" />
          <stop offset=".35" stopColor="#d2b66f" />
          <stop offset="1" stopColor="#614d1f" stopOpacity=".18" />
        </radialGradient>
        <pattern id="system-stars" width="17" height="19" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="5" r=".25" fill="#9ec8c3" />
          <circle cx="13" cy="15" r=".18" fill="#d9e8e6" />
        </pattern>
      </defs>
      <rect width="100" height="100" fill="url(#system-stars)" />
      <circle className="system-orbit" cx="20" cy="52" r="21" />
      <circle className="system-orbit" cx="20" cy="52" r="39" />
      <circle className="system-orbit" cx="20" cy="52" r="59" />
      <circle className="system-star" cx="20" cy="52" r="6" fill="url(#helion-star)" />
      <path className="system-axis" d="M5 52h90M20 5v90" />
    </svg>
  );
}

export function GalacticOperationsView({
  snapshot,
  mode,
  onNavigate,
  onNotice,
  onRequestOperationDetail,
  onStrategicChanged,
}: GalacticOperationsViewProps) {
  const [tab, setTab] = useState<OperationsTab>("MAP");
  const [presentation, setPresentation] = useState<MapPresentation>("VISUAL");
  const [mapScale, setMapScale] = useState<MapScale>("PLANET");
  const [selectedNodeId, setSelectedNodeId] = useState(snapshot.map.nodes[0]?.id ?? "");
  const [selectedOperationId, setSelectedOperationId] = useState(snapshot.operations[0]?.id ?? "");
  const [filters, setFilters] = useState<Set<MapFilter>>(new Set(["OPERATIONS", "FRIENDLY_FORCES", "SUPPLY", "ROUTES"]));
  const [selectedFormationId, setSelectedFormationId] = useState(snapshot.map.formations[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);

  const nodeById = useMemo(() => new Map(snapshot.map.nodes.map((node) => [node.id, node])), [snapshot.map.nodes]);
  const primaryTaskForce = snapshot.map.formations.find((formation) =>
    formation.kind === "TASK_FORCE" &&
    (formation.id === snapshot.ship.taskForce.id || formation.name === snapshot.ship.taskForce.name),
  );
  const currentShipNodeId = primaryTaskForce?.nodeId
    ?? snapshot.map.nodes.find((node) => node.name === snapshot.ship.taskForce.location)?.id
    ?? "";
  const planetaryNodes = snapshot.map.nodes.filter((node) => !isSystemNode(node) || node.type.toUpperCase() === "ORBIT");
  const systemNodes = snapshot.map.nodes.filter(isSystemNode);
  const visibleNodes = mapScale === "PLANET" ? planetaryNodes : systemNodes;
  const selectedNode = nodeById.get(selectedNodeId) ?? snapshot.map.nodes[0];
  const selectedOperation = snapshot.operations.find((operation) => operation.id === selectedOperationId)
    ?? (selectedNode ? operationAtNode(snapshot.operations, selectedNode)[0] : undefined)
    ?? snapshot.operations[0];
  const routesAtSelectedNode = selectedNode
    ? snapshot.map.routes.filter((route) => route.fromNodeId === selectedNode.id || route.toNodeId === selectedNode.id)
    : [];
  const formationsAtSelectedNode = selectedNode
    ? snapshot.map.formations.filter((formation) => formation.nodeId === selectedNode.id)
    : [];
  const selectedFormation = snapshot.map.formations.find((formation) => formation.id === selectedFormationId)
    ?? formationsAtSelectedNode[0];
  const deploymentCandidates = snapshot.map.formations.filter((formation) =>
    formation.kind === "BATTLEGROUP" &&
    ["READY", "EMBARKED", "RECOVERING"].includes(formation.status) &&
    formation.routeNodeIds.length === 0,
  );
  const embarkCarrier = selectedFormation?.kind === "BATTLEGROUP" && !selectedFormation.carrierTaskForceId
    ? formationsAtSelectedNode.find((formation) =>
        formation.kind === "TASK_FORCE" &&
        formation.routeNodeIds.length === 0 &&
        ["READY", "RECOVERING"].includes(formation.status)
      )
    : undefined;
  const supportCapability = selectedOperation?.recommendedCapabilities.find((capability) =>
    selectedFormation?.capabilities.includes(capability),
  );
  const canCreateOrders = mode === "LIVE" && snapshot.map.viewerPermissions.includes("STRATEGIC_ORDER_CREATE");
  const canApproveOrders = mode === "LIVE" && snapshot.map.viewerPermissions.includes("STRATEGIC_ORDER_APPROVE");
  const formationNode = selectedFormation ? nodeById.get(selectedFormation.nodeId) : undefined;
  const operationNode = selectedOperation ? nodeById.get(selectedOperation.nodeId) : undefined;
  const carrierAtOperationPlanet = Boolean(
    selectedFormation?.carrierTaskForceId &&
    formationNode?.planetLocationId &&
    operationNode?.planetLocationId &&
    formationNode.planetLocationId === operationNode.planetLocationId,
  );
  const canAuthoriseDeployment = Boolean(
    selectedFormation?.kind === "BATTLEGROUP" &&
    selectedOperation &&
    selectedOperation.status === "MUSTERING" &&
    ["READY", "EMBARKED", "RECOVERING"].includes(selectedFormation.status) &&
    !selectedFormation.routeNodeIds.length &&
    (selectedFormation.nodeId === selectedOperation.nodeId || carrierAtOperationPlanet),
  );
  const selectedTaskForceSupply = selectedFormation?.kind === "TASK_FORCE" ? selectedFormation.supply : undefined;
  const requiredSupplyRound = snapshot.clock.round + 1;
  const canResupplyTaskForce = Boolean(
    selectedFormation?.kind === "TASK_FORCE" &&
    selectedTaskForceSupply?.largeCurrent !== null &&
    selectedTaskForceSupply?.largeCurrent !== undefined &&
    selectedTaskForceSupply.largeCurrent > 0 &&
    (selectedTaskForceSupply.suppliedThroughRound ?? -1) < requiredSupplyRound,
  );

  useEffect(() => {
    if (selectedOperationId) void onRequestOperationDetail(selectedOperationId);
  }, [onRequestOperationDetail, selectedOperationId]);

  function selectNode(node: StrategicNodeView) {
    setSelectedNodeId(node.id);
    const formation = snapshot.map.formations.find((candidate) => candidate.nodeId === node.id);
    if (formation) setSelectedFormationId(formation.id);
    const operation = operationAtNode(snapshot.operations, node)[0];
    if (operation) setSelectedOperationId(operation.id);
  }

  function selectOperation(operation: OperationView) {
    setSelectedOperationId(operation.id);
    if (operation.nodeId) setSelectedNodeId(operation.nodeId);
  }

  function toggleFilter(filter: MapFilter) {
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }

  function explainOrderBlocker() {
    const hasPermission = snapshot.map.viewerPermissions.includes("STRATEGIC_ORDER_CREATE");
    const hasUnknownTravel = routesAtSelectedNode.some((route) => route.travelRounds === null);
    const reason = mode === "SHOWCASE"
      ? "Strategic orders are disabled in the local showcase."
      : !hasPermission
        ? "Your active Battalion authority does not include STRATEGIC_ORDER_CREATE."
        : hasUnknownTravel
          ? "No strategic order can be submitted while the selected route has a balance-required travel duration."
          : "Strategic order submission remains disabled until the live permission, map-version, and idempotency contract passes end-to-end verification.";
    onNotice({ tone: "info", message: reason });
  }

  async function submitOrder(intent: Record<string, unknown>, destinationNodeId?: string) {
    if (!selectedFormation || !canCreateOrders || submitting) return;
    setSubmitting(true);
    const result = await submitStrategicOrder({
      commandId: crypto.randomUUID(),
      expectedMapVersion: snapshot.map.version,
      expectedFormationVersion: selectedFormation.version,
      mapId: snapshot.map.id,
      formation: { kind: selectedFormation.kind, id: selectedFormation.id },
      destinationNodeId,
      intent,
    });
    onNotice({
      tone: result.ok ? "success" : "danger",
      message: result.ok ? `${selectedFormation.name}: order submitted for strategic round ${snapshot.clock.round}.` : result.message,
    });
    if (result.ok) await onStrategicChanged();
    setSubmitting(false);
  }

  async function resolveRound() {
    if (!canApproveOrders || submitting) return;
    setSubmitting(true);
    const result = await resolveStrategicMap(snapshot.map.id, {
      commandId: crypto.randomUUID(),
      expectedMapVersion: snapshot.map.version,
      expectedRound: snapshot.clock.round,
    });
    onNotice({
      tone: result.ok ? "success" : "danger",
      message: result.ok ? `Strategic round ${snapshot.clock.round} resolved. The theatre has advanced.` : result.message,
    });
    if (result.ok) await onStrategicChanged();
    setSubmitting(false);
  }

  function changeMapScale(nextScale: MapScale) {
    setMapScale(nextScale);
    setPresentation("VISUAL");
    const candidates = nextScale === "PLANET" ? planetaryNodes : systemNodes;
    if (!candidates.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(candidates.find((node) => node.id === currentShipNodeId)?.id ?? candidates[0]?.id ?? "");
    }
  }

  function renderMapNode(node: StrategicNodeView, position: { x: number; y: number }) {
    const operations = operationAtNode(snapshot.operations, node);
    const formations = snapshot.map.formations.filter((formation) => formation.nodeId === node.id);
    const shipHere = node.id === currentShipNodeId;
    return (
      <button
        type="button"
        className={`strategic-node node-${node.control.toLowerCase()} ${selectedNode?.id === node.id ? "selected" : ""} ${shipHere ? "current-ship-node" : ""}`}
        style={{ left: `${position.x}%`, top: `${position.y}%` }}
        aria-label={`${node.name}, ${node.control.toLowerCase()} ${node.type.toLowerCase()}, ${operations.length} operations, ${formations.length} formations${shipHere ? ", your ship is here" : ""}`}
        onClick={() => selectNode(node)}
        key={node.id}
      >
        <i />
        <span><b>{node.name}</b><small>{node.type.replaceAll("_", " ")}</small></span>
        {shipHere && <u className="current-ship-flag"><MapShipIcon />YOUR SHIP</u>}
        {filters.has("OPERATIONS") && operations.length > 0 && <em>{operations.length}</em>}
        {filters.has("SUPPLY") && node.supplyAvailable && <strong>S</strong>}
        {filters.has("FRIENDLY_FORCES") && formations.length > 0 && <div className="node-formations">{formations.map((formation) => <mark className={formation.kind.toLowerCase()} key={formation.id}>{formation.kind === "TASK_FORCE" ? "TF" : "BG"}</mark>)}</div>}
      </button>
    );
  }

  return (
    <div className="galactic-workspace">
      <header className="operations-commandbar">
        <div>
          <span className="eyebrow">GALACTIC OPERATIONS // {snapshot.map.scope.replaceAll("_", " ")}</span>
          <h1>{snapshot.map.name}</h1>
          <p>{snapshot.ship.taskForce.name} at {snapshot.ship.taskForce.location} · Strategic round {snapshot.clock.round}</p>
        </div>
        <div className="operations-tab-switch" role="tablist" aria-label="Galactic operations modes">
          <button type="button" role="tab" aria-selected={tab === "MAP"} className={tab === "MAP" ? "active" : ""} onClick={() => setTab("MAP")}>COMMAND MAP</button>
          <button type="button" role="tab" aria-selected={tab === "BOARD"} className={tab === "BOARD" ? "active" : ""} onClick={() => setTab("BOARD")}>OPERATIONS BOARD</button>
        </div>
        <div className="map-version-block"><span>MAP VERSION</span><b>v{snapshot.map.version}</b><small>{snapshot.map.id}</small></div>
      </header>

      {tab === "MAP" ? (
        <section className="galactic-map-layout" role="tabpanel">
          <aside className="strategic-map-sidebar panel-frame">
            <section className="galactic-theatre-summary">
              <span className="eyebrow">ACTIVE THEATRE</span>
              <h2>CORINTH</h2>
              <p>{snapshot.map.name}</p>
              <dl>
                <div><dt>VISIBLE OPERATIONS</dt><dd>{snapshot.operations.length}</dd></div>
                <div><dt>FRIENDLY FORMATIONS</dt><dd>{snapshot.map.formations.length}</dd></div>
                <div><dt>STRATEGIC ROUND</dt><dd>{snapshot.clock.round}</dd></div>
              </dl>
              <div className="galactic-control-summary">
                <i className="contested" /><span><b>CONTESTED WORLD</b><small>{snapshot.map.nodes.filter((node) => node.control === "CONTESTED").length} contested regions</small></span>
              </div>
            </section>
            <section>
              <span className="eyebrow">DISPLAY SCALE</span>
              <div className="galactic-scale-list">
                <button className={mapScale === "PLANET" ? "active" : ""} type="button" aria-pressed={mapScale === "PLANET"} onClick={() => changeMapScale("PLANET")}><i className="planet" /><span><b>PLANET</b><small>Surface and high orbit</small></span></button>
                <button className={mapScale === "SYSTEM" ? "active" : ""} type="button" aria-pressed={mapScale === "SYSTEM"} onClick={() => changeMapScale("SYSTEM")}><i className="system" /><span><b>HELION SYSTEM</b><small>Worlds, relay, jump point</small></span></button>
              </div>
            </section>
            <section>
              <span className="eyebrow">TACTICAL OVERLAYS</span>
              <div className="strategic-filter-list">
                {(["OPERATIONS", "FRIENDLY_FORCES", "SUPPLY", "ROUTES"] as const).map((filter) => (
                  <button type="button" className={filters.has(filter) ? "active" : ""} aria-pressed={filters.has(filter)} onClick={() => toggleFilter(filter)} key={filter}><i />{filter.replaceAll("_", " ")}</button>
                ))}
              </div>
            </section>
            <section className="strategic-legend">
              <span className="eyebrow">CONTROL</span>
              <div><i className="friendly" />Friendly</div>
              <div><i className="contested" />Contested</div>
              <div><i className="hostile" />Hostile</div>
              <div><i className="unknown" />Unknown</div>
            </section>
            <section className="map-boundary-card">
              <strong>YOUR SHIP</strong>
              <p>{snapshot.ship.name} is currently at <b>{snapshot.ship.taskForce.location}</b> with {snapshot.ship.taskForce.name}.</p>
            </section>
          </aside>

          <div className="strategic-map-stage panel-frame">
            <div className="strategic-map-toolbar">
              <div><span className="eyebrow">{mapScale === "PLANET" ? "PLANETARY COMMAND DISPLAY" : "SYSTEM NAVIGATION DISPLAY"}</span><strong>{mapScale === "PLANET" ? "CORINTH // SURFACE & HIGH ORBIT" : "HELION // LOCAL SYSTEM"}</strong></div>
              <div className="map-presentation-switch">
                <button type="button" className={presentation === "VISUAL" ? "active" : ""} onClick={() => setPresentation("VISUAL")}>DISPLAY</button>
                <button type="button" className={presentation === "LIST" ? "active" : ""} onClick={() => setPresentation("LIST")}>LOCATION LIST</button>
              </div>
            </div>

            <div className={`strategic-map-visual galactic-${mapScale.toLowerCase()}-view ${presentation === "LIST" ? "presentation-hidden" : ""}`}>
              <div className="map-projection-frame">
                {mapScale === "PLANET" ? <PlanetProjection /> : <SystemProjection />}
                <svg className="galactic-route-overlay" viewBox="0 0 100 100" role="img" aria-labelledby="strategic-map-title strategic-map-description" preserveAspectRatio="xMidYMid meet">
                  <title id="strategic-map-title">{mapScale === "PLANET" ? "Corinth planetary theatre" : "Helion system navigation"}</title>
                  <desc id="strategic-map-description">Select a strategic location to inspect its operations, formations, routes, and available orders.</desc>
                  <defs>
                    <marker id="route-arrow-open" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 6 3 0 6Z" /></marker>
                    <marker id="route-arrow-contested" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 6 3 0 6Z" /></marker>
                    <marker id="route-arrow-blocked" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 6 3 0 6Z" /></marker>
                  </defs>
                  {filters.has("ROUTES") && snapshot.map.routes.map((route, index) => {
                    const from = nodeById.get(route.fromNodeId);
                    const to = nodeById.get(route.toNodeId);
                    if (!from || !to || !visibleNodes.some((node) => node.id === from.id) || !visibleNodes.some((node) => node.id === to.id)) return null;
                    const fromPosition = mapScale === "PLANET" ? planetNodePosition(from) : systemNodePosition(from);
                    const toPosition = mapScale === "PLANET" ? planetNodePosition(to) : systemNodePosition(to);
                    const status = route.status.toLowerCase();
                    const selected = selectedNode?.id === from.id || selectedNode?.id === to.id;
                    const path = routePath(fromPosition, toPosition, index, mapScale);
                    return <g key={route.id} className={`galactic-route route-${status} ${selected ? "selected-route" : ""}`}>
                      <path className="route-underlay" d={path} />
                      <path className="route-flow" d={path} markerEnd={`url(#route-arrow-${status === "contested" ? "contested" : status === "blocked" || status === "locked" ? "blocked" : "open"})`} />
                    </g>;
                  })}
                  {snapshot.map.formations.flatMap((formation) => formation.routeNodeIds.slice(0, -1).map((nodeId, index) => {
                    const from = nodeById.get(nodeId);
                    const to = nodeById.get(formation.routeNodeIds[index + 1]);
                    if (!from || !to || !visibleNodes.some((node) => node.id === from.id) || !visibleNodes.some((node) => node.id === to.id)) return null;
                    const fromPosition = mapScale === "PLANET" ? planetNodePosition(from) : systemNodePosition(from);
                    const toPosition = mapScale === "PLANET" ? planetNodePosition(to) : systemNodePosition(to);
                    return <path key={`${formation.id}:plan:${nodeId}`} d={routePath(fromPosition, toPosition, index, mapScale)} className="planned-route" />;
                  }))}
                </svg>
                {mapScale === "SYSTEM" && <>
                  <div className="system-star-label"><b>HELION</b><small>LOCAL PRIMARY</small></div>
                  <button type="button" className="system-primary-world" onClick={() => changeMapScale("PLANET")}><i /><span><b>CORINTH</b><small>PRIMARY THEATRE</small></span></button>
                </>}
                {visibleNodes.map((node) => renderMapNode(node, mapScale === "PLANET" ? planetNodePosition(node) : systemNodePosition(node)))}
                <div className="galactic-map-status">
                  <span><i className={`control-${selectedNode?.control.toLowerCase()}`} />{selectedNode?.name ?? "No location selected"}</span>
                  <b>{mapScale === "PLANET" ? `${planetaryNodes.length} PLANETARY LOCATIONS` : `${systemNodes.length} SYSTEM LOCATIONS`}</b>
                </div>
              </div>
              <div className="strategic-map-coordinate-readout">ROUTE CONNECTIONS ARE AUTHORITATIVE · DISPLAY DISTANCE IS NOT TRAVEL TIME</div>
            </div>

            <div className={`strategic-node-list ${presentation === "VISUAL" ? "list-collapsed" : ""}`} aria-label="Strategic nodes list">
              {visibleNodes.map((node) => {
                const operations = operationAtNode(snapshot.operations, node);
                const formations = snapshot.map.formations.filter((formation) => formation.nodeId === node.id);
                const connected = snapshot.map.routes.filter((route) => route.fromNodeId === node.id || route.toNodeId === node.id);
                return (
                  <button type="button" className={selectedNode?.id === node.id ? "active" : ""} key={node.id} onClick={() => selectNode(node)}>
                    <i className={node.control.toLowerCase()} />
                    <span><strong>{node.name}</strong><small>{node.type.replaceAll("_", " ")} · {node.control}</small></span>
                    <span><b>{operations.length}</b><small>OPS</small></span>
                    <span><b>{formations.length}</b><small>FORCES</small></span>
                    <span><b>{connected.length}</b><small>ROUTES</small></span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="strategic-inspector panel-frame">
            {selectedNode ? (
              <>
                <header>
                  <span className="eyebrow">SELECTED LOCATION</span>
                  <h2>{selectedNode.name}</h2>
                  <p>{selectedNode.parentName ?? snapshot.map.name} · {selectedNode.type.replaceAll("_", " ")}</p>
                  <div className="selected-location-badges">
                    <b className={`control-badge ${selectedNode.control.toLowerCase()}`}>{selectedNode.control} CONTROL</b>
                    {selectedNode.id === currentShipNodeId && <b className="ship-here-badge"><MapShipIcon />{snapshot.ship.name} IS HERE</b>}
                  </div>
                </header>
                <section>
                  <div className="inspector-section-title"><span>VISIBLE OPERATIONS</span><b>{operationAtNode(snapshot.operations, selectedNode).length}</b></div>
                  <div className="mini-operation-list">
                    {operationAtNode(snapshot.operations, selectedNode).map((operation) => (
                      <button type="button" className={selectedOperation?.id === operation.id ? "active" : ""} key={operation.id} onClick={() => selectOperation(operation)}><i /><span><b>{operation.name}</b><small>{operation.status} · {operation.role}</small></span></button>
                    ))}
                    {!operationAtNode(snapshot.operations, selectedNode).length && <p className="strategic-empty-copy">No visible operation is attached to this node.</p>}
                  </div>
                </section>
                <section>
                  <div className="inspector-section-title"><span>FORMATIONS</span><b>{formationsAtSelectedNode.length}</b></div>
                  <div className="formation-intentions-list">
                    {formationsAtSelectedNode.map((formation) => <article key={formation.id}><i>{formation.kind === "TASK_FORCE" ? "TF" : "BG"}</i><span><b>{formation.name}</b><small>{formation.status.replaceAll("_", " ")}</small><p>{formation.kind === "TASK_FORCE" && formation.supply ? `Large Supply ${formation.supply.largeCurrent ?? "?"}/${formation.supply.largeCapacity ?? "?"} · ${formation.supply.suppliedThroughRound === null ? "UNSUPPLIED" : `SUPPLIED THROUGH R${formation.supply.suppliedThroughRound}`}` : formation.intention ?? "No published intention"}</p></span></article>)}
                    {!formationsAtSelectedNode.length && <p className="strategic-empty-copy">No friendly formation is projected here.</p>}
                  </div>
                </section>
                <section>
                  <div className="inspector-section-title"><span>CONNECTED ROUTES</span><b>{routesAtSelectedNode.length}</b></div>
                  <div className="route-inspector-list">
                    {routesAtSelectedNode.map((route) => {
                      const otherId = route.fromNodeId === selectedNode.id ? route.toNodeId : route.fromNodeId;
                      const requiredProfile = selectedFormation?.kind === "TASK_FORCE" ? "TASK_FORCE" : "GROUND_BATTLEGROUP";
                      const canMove = Boolean(selectedFormation && selectedFormation.nodeId === selectedNode.id && ["READY", "RECOVERING"].includes(selectedFormation.status) && selectedFormation.routeNodeIds.length === 0 && route.status === "OPEN" && route.travelRounds !== null && route.movementProfiles.includes(requiredProfile) && !selectedFormation.carrierTaskForceId);
                      return <div key={route.id}><i className={route.status.toLowerCase()} /><span><b>{nodeById.get(otherId)?.name ?? otherId}</b><small>{route.movementProfiles.join(" · ") || "PROFILE NOT REPORTED"}</small></span><strong>{routeLabel(route.travelRounds)}</strong>{canMove && <button type="button" disabled={!canCreateOrders || submitting} onClick={() => void submitOrder({ type: selectedFormation!.kind === "TASK_FORCE" ? "MOVE_TASK_FORCE" : "MOVE_BATTLEGROUP" }, otherId)}>MOVE</button>}</div>;
                    })}
                  </div>
                </section>
                <div className="strategic-order-block">
                  <label>
                    <span>ORDERED FORMATION</span>
                    <select
                      value={selectedFormation?.id ?? ""}
                      onChange={(event) => setSelectedFormationId(event.target.value)}
                      disabled={!canCreateOrders || submitting}
                    >
                      {formationsAtSelectedNode.map((formation) => (
                        <option key={formation.id} value={formation.id}>{formation.name} · {formation.status}</option>
                      ))}
                    </select>
                  </label>
                  <div className="strategic-order-actions">
                    {selectedFormation?.kind === "BATTLEGROUP" && embarkCarrier && ["READY", "RECOVERING", "FORMING"].includes(selectedFormation.status) && (
                      <button type="button" disabled={!canCreateOrders || submitting} onClick={() => void submitOrder({
                        type: "EMBARK_BATTLEGROUP",
                        battlegroupId: selectedFormation.id,
                        carrierTaskForceId: embarkCarrier.id,
                      })}>EMBARK {embarkCarrier.name.toUpperCase()}</button>
                    )}
                    {selectedFormation?.kind === "BATTLEGROUP" && selectedFormation.status === "EMBARKED" && selectedFormation.carrierTaskForceId && (
                      <button type="button" disabled={!canCreateOrders || submitting} onClick={() => void submitOrder({
                        type: "DISEMBARK_BATTLEGROUP",
                        battlegroupId: selectedFormation.id,
                        carrierTaskForceId: selectedFormation.carrierTaskForceId,
                      })}>DISEMBARK</button>
                    )}
                    {selectedFormation?.kind === "TASK_FORCE" && (
                      <div className="strategic-supply-order">
                        <span>
                          <small>LOGISTICS STATE</small>
                          <strong>{selectedTaskForceSupply?.largeCurrent ?? "?"}/{selectedTaskForceSupply?.largeCapacity ?? "?"} LARGE SUPPLY</strong>
                          <em>{selectedTaskForceSupply?.suppliedThroughRound === null || selectedTaskForceSupply?.suppliedThroughRound === undefined
                            ? "TASK FORCE UNSUPPLIED"
                            : `SUPPLIED THROUGH ROUND ${selectedTaskForceSupply.suppliedThroughRound}`}</em>
                        </span>
                        <button type="button" disabled={!canCreateOrders || submitting || !canResupplyTaskForce} onClick={() => void submitOrder({
                          type: "RESUPPLY_TASK_FORCE",
                          taskForceId: selectedFormation.id,
                        })}>{canResupplyTaskForce ? `SUPPLY THROUGH ROUND ${requiredSupplyRound}` : (selectedTaskForceSupply?.largeCurrent ?? 0) < 1 ? "NO LARGE SUPPLY" : `SUPPLIED THROUGH ROUND ${selectedTaskForceSupply?.suppliedThroughRound ?? requiredSupplyRound}`}</button>
                      </div>
                    )}
                    {selectedOperation && supportCapability && ["ACTIVE", "MUSTERING"].includes(selectedOperation.status) && (
                      <button type="button" disabled={!canCreateOrders || submitting} onClick={() => void submitOrder({
                        type: "SUPPORT_CAMPAIGN",
                        operationId: selectedOperation.id,
                        capability: supportCapability,
                      })}>SUPPORT {selectedOperation.name.toUpperCase()}</button>
                    )}
                    {canAuthoriseDeployment && (
                      <button type="button" disabled={!canCreateOrders || submitting} onClick={() => void submitOrder({
                        type: "DEPLOY_TO_CAMPAIGN",
                        battlegroupId: selectedFormation!.id,
                        operationId: selectedOperation!.id,
                        deploymentMethod: "STANDARD_LANDING",
                      })}>AUTHORISE {selectedFormation!.name.toUpperCase()} DEPLOYMENT</button>
                    )}
                    <button type="button" disabled={!canApproveOrders || submitting} onClick={() => void resolveRound()}>
                      RESOLVE ROUND {snapshot.clock.round}
                    </button>
                  </div>
                  {!canCreateOrders && <button type="button" onClick={explainOrderBlocker}>WHY ORDERS ARE UNAVAILABLE</button>}
                  <p>Orders use current map and formation versions. Unpublished route timing still blocks movement without guessing a travel value.</p>
                </div>
              </>
            ) : <p className="strategic-empty-copy">No strategic node is visible.</p>}
          </aside>
        </section>
      ) : (
        <section className="operations-board-layout" role="tabpanel">
          <div className="operations-board">
            {statusOrder.map((status) => {
              const operations = snapshot.operations.filter((operation) => operation.status === status);
              if (!operations.length) return null;
              return (
                <section key={status}>
                  <header><span>{status}</span><b>{operations.length}</b></header>
                  <div>
                    {operations.map((operation) => (
                      <button type="button" className={selectedOperation?.id === operation.id ? "selected" : ""} onClick={() => selectOperation(operation)} key={operation.id}>
                        <span className={`operation-sigil state-${operation.status.toLowerCase()}`}>{operation.name.split(" ").at(-1)?.slice(0, 2).toUpperCase()}</span>
                        <span><small>{operation.location}</small><strong>{operation.name}</strong><p>{operation.role}</p></span>
                        <span className="operation-assignment"><b>{operation.assignedBattlegroups.length || "—"}</b><small>BATTLEGROUPS</small></span>
                        <span className="operation-round"><b>{operation.tacticalRound ?? "—"}</b><small>TACTICAL ROUND</small></span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {!snapshot.operations.length && <p className="strategic-empty-copy">No operations are visible in this theatre.</p>}
          </div>

          <aside className="operation-briefing panel-frame">
            {selectedOperation ? (
              <>
                <header>
                  <span className="eyebrow">CAMPAIGN BRIEFING // AUDIENCE SAFE</span>
                  <h2>{selectedOperation.name}</h2>
                  <p>{selectedOperation.location} · {selectedOperation.role}</p>
                  <div><b className={`status-chip state-${selectedOperation.status.toLowerCase()}`}>{selectedOperation.status}</b><b className="implementation-chip">{selectedOperation.implementationStatus.replaceAll("_", " ")}</b></div>
                </header>
                <section><span className="eyebrow">STRATEGIC IMPORTANCE</span><p>{selectedOperation.strategicImportance}</p></section>
                <section><span className="eyebrow">OBJECTIVES</span><ol>{selectedOperation.objectives.length ? selectedOperation.objectives.map((objective) => <li key={objective}>{objective}</li>) : <li>Objectives not yet disclosed.</li>}</ol></section>
                <section><span className="eyebrow">RECOMMENDED CAPABILITIES</span><div className="capability-chips">{selectedOperation.recommendedCapabilities.length ? selectedOperation.recommendedCapabilities.map((capability) => <span key={capability}>{capability.replaceAll("_", " ")}</span>) : <span className="unknown">NO RECOMMENDATION PUBLISHED</span>}</div></section>
                <section className="briefing-facts">
                  <div><small>KNOWN ENEMY</small><strong>{selectedOperation.knownEnemy ?? "No audience-safe intelligence"}</strong></div>
                  <div><small>REINFORCEMENTS</small><strong>{selectedOperation.reinforcementState.replaceAll("_", " ")}</strong></div>
                  <div><small>ASSIGNED</small><strong>{selectedOperation.assignedBattlegroups.join(", ") || "UNASSIGNED"}</strong></div>
                  <div><small>ENVIRONMENT</small><strong>{selectedOperation.environment.join(" · ") || "No modifiers disclosed"}</strong></div>
                </section>
                <div className="deployment-boundary">
                  <strong>STRATEGIC → TACTICAL DEPLOYMENT LIVE</strong>
                  <p>First authorise a co-located Battlegroup and resolve the strategic round. The deployment planner then locks its exact persistent loadouts and creates the tactical presence.</p>
                  {selectedOperation.status === "MUSTERING" && (
                    <label>
                      <span>DEPLOYMENT FORMATION</span>
                      <select
                        value={deploymentCandidates.some((formation) => formation.id === selectedFormation?.id) ? selectedFormation!.id : ""}
                        onChange={(event) => setSelectedFormationId(event.target.value)}
                        disabled={!canCreateOrders || submitting || deploymentCandidates.length === 0}
                      >
                        <option value="">SELECT BATTLEGROUP</option>
                        {deploymentCandidates.map((formation) => (
                          <option key={formation.id} value={formation.id}>{formation.name} · {formation.status}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {canAuthoriseDeployment && (
                    <button type="button" disabled={!canCreateOrders || submitting} onClick={() => void submitOrder({
                      type: "DEPLOY_TO_CAMPAIGN",
                      battlegroupId: selectedFormation!.id,
                      operationId: selectedOperation.id,
                      deploymentMethod: "STANDARD_LANDING",
                    })}>AUTHORISE STANDARD LANDING</button>
                  )}
                  <button type="button" disabled={!selectedOperation.campaignId || selectedOperation.status !== "ACTIVE" || selectedOperation.assignedBattlegroups.length === 0} onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set("campaign", selectedOperation.campaignId!);
                    window.history.replaceState({}, "", url);
                    onNavigate("Deployment");
                  }}>PLAN TACTICAL DEPLOYMENT</button>
                </div>
              </>
            ) : <p className="strategic-empty-copy">Select an operation to read its briefing.</p>}
          </aside>
        </section>
      )}

      <footer className="operations-footer-note">
        <span>WORLD EFFECTS</span>
        <p>Committed deployments reserve their Battlegroup and terminal tactical results return survivors to recovery while applying authored node and route consequences.</p>
        <button type="button" onClick={() => onNavigate("Campaigns")}>OPEN EXISTING TACTICAL CAMPAIGN</button>
      </footer>
    </div>
  );
}
