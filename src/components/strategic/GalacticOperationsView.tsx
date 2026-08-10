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
type MapFilter = "OPERATIONS" | "FRIENDLY_FORCES" | "SUPPLY" | "ROUTES";

const statusOrder = ["ACTIVE", "MUSTERING", "ANNOUNCED", "AVAILABLE", "RESOLVED", "FAILED", "CANCELLED"];

function operationAtNode(operations: OperationView[], node: StrategicNodeView): OperationView[] {
  return operations.filter((operation) => operation.nodeId === node.id || node.operationIds.includes(operation.id));
}

function routeLabel(value: number | null): string {
  return value === null ? "BALANCE REQUIRED" : `${value} STRATEGIC ROUND${value === 1 ? "" : "S"}`;
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
  const [selectedNodeId, setSelectedNodeId] = useState(snapshot.map.nodes[0]?.id ?? "");
  const [selectedOperationId, setSelectedOperationId] = useState(snapshot.operations[0]?.id ?? "");
  const [filters, setFilters] = useState<Set<MapFilter>>(new Set(["OPERATIONS", "FRIENDLY_FORCES", "SUPPLY", "ROUTES"]));
  const [selectedFormationId, setSelectedFormationId] = useState(snapshot.map.formations[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);

  const nodeById = useMemo(() => new Map(snapshot.map.nodes.map((node) => [node.id, node])), [snapshot.map.nodes]);
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
  const selectedFormation = formationsAtSelectedNode.find((formation) => formation.id === selectedFormationId)
    ?? formationsAtSelectedNode[0];
  const supportCapability = selectedOperation?.recommendedCapabilities.find((capability) =>
    selectedFormation?.capabilities.includes(capability),
  );
  const canCreateOrders = mode === "LIVE" && snapshot.map.viewerPermissions.includes("STRATEGIC_ORDER_CREATE");
  const canApproveOrders = mode === "LIVE" && snapshot.map.viewerPermissions.includes("STRATEGIC_ORDER_APPROVE");

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
            <section>
              <span className="eyebrow">THEATRE SCOPE</span>
              <button className="scope-row active" type="button"><i />HELION SYSTEM<small>CORINTH</small></button>
              <button className="scope-row child active" type="button"><i />{snapshot.map.name}<small>{snapshot.map.nodes.length} NODES</small></button>
            </section>
            <section>
              <span className="eyebrow">MAP FILTERS</span>
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
              <strong>STRATEGIC SCALE</strong>
              <p>Markers represent Task Forces and Battlegroups. Individual squads remain in Forces or tactical campaigns.</p>
            </section>
          </aside>

          <div className="strategic-map-stage panel-frame">
            <div className="strategic-map-toolbar">
              <div><span className="eyebrow">NODE-AND-ROUTE PROJECTION</span><strong>CORINTH // SURFACE & ORBIT</strong></div>
              <div className="map-presentation-switch">
                <button type="button" className={presentation === "VISUAL" ? "active" : ""} onClick={() => setPresentation("VISUAL")}>MAP</button>
                <button type="button" className={presentation === "LIST" ? "active" : ""} onClick={() => setPresentation("LIST")}>ACCESSIBLE LIST</button>
              </div>
            </div>

            <div className={`strategic-map-visual ${presentation === "LIST" ? "presentation-hidden" : ""}`}>
              <svg viewBox="0 0 100 100" role="img" aria-labelledby="strategic-map-title strategic-map-description" preserveAspectRatio="none">
                <title id="strategic-map-title">Corinth strategic node and route map</title>
                <desc id="strategic-map-description">A graph of orbital, base, city, junction, and surface-region nodes. Use the accessible list to inspect the same data without the visual map.</desc>
                {filters.has("ROUTES") && snapshot.map.routes.map((route) => {
                  const from = nodeById.get(route.fromNodeId);
                  const to = nodeById.get(route.toNodeId);
                  if (!from || !to) return null;
                  return <line key={route.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`route-${route.status.toLowerCase()}`} />;
                })}
                {snapshot.map.formations.flatMap((formation) => formation.routeNodeIds.slice(0, -1).map((nodeId, index) => {
                  const from = nodeById.get(nodeId);
                  const to = nodeById.get(formation.routeNodeIds[index + 1]);
                  if (!from || !to) return null;
                  return <line key={`${formation.id}:plan:${nodeId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="planned-route" />;
                }))}
              </svg>
              {snapshot.map.nodes.map((node) => {
                const operations = operationAtNode(snapshot.operations, node);
                const formations = snapshot.map.formations.filter((formation) => formation.nodeId === node.id);
                return (
                  <button
                    type="button"
                    className={`strategic-node node-${node.control.toLowerCase()} ${selectedNode?.id === node.id ? "selected" : ""}`}
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    aria-label={`${node.name}, ${node.control.toLowerCase()} ${node.type.toLowerCase()}, ${operations.length} operations, ${formations.length} formations`}
                    onClick={() => selectNode(node)}
                    key={node.id}
                  >
                    <i />
                    <span><b>{node.name}</b><small>{node.type.replaceAll("_", " ")}</small></span>
                    {filters.has("OPERATIONS") && operations.length > 0 && <em>{operations.length}</em>}
                    {filters.has("SUPPLY") && node.supplyAvailable && <strong>S</strong>}
                    {filters.has("FRIENDLY_FORCES") && formations.length > 0 && <div className="node-formations">{formations.map((formation) => <mark className={formation.kind.toLowerCase()} key={formation.id}>{formation.kind === "TASK_FORCE" ? "TF" : "BG"}</mark>)}</div>}
                  </button>
                );
              })}
              <div className="strategic-map-coordinate-readout">GRAPH ROUTES · PIXEL DISTANCE DOES NOT DETERMINE TRAVEL</div>
            </div>

            <div className={`strategic-node-list ${presentation === "VISUAL" ? "list-collapsed" : ""}`} aria-label="Strategic nodes list">
              {snapshot.map.nodes.map((node) => {
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
                  <b className={`control-badge ${selectedNode.control.toLowerCase()}`}>{selectedNode.control} CONTROL</b>
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
                    {formationsAtSelectedNode.map((formation) => <article key={formation.id}><i>{formation.kind === "TASK_FORCE" ? "TF" : "BG"}</i><span><b>{formation.name}</b><small>{formation.status.replaceAll("_", " ")}</small><p>{formation.intention ?? "No published intention"}</p></span></article>)}
                    {!formationsAtSelectedNode.length && <p className="strategic-empty-copy">No friendly formation is projected here.</p>}
                  </div>
                </section>
                <section>
                  <div className="inspector-section-title"><span>CONNECTED ROUTES</span><b>{routesAtSelectedNode.length}</b></div>
                  <div className="route-inspector-list">
                    {routesAtSelectedNode.map((route) => {
                      const otherId = route.fromNodeId === selectedNode.id ? route.toNodeId : route.fromNodeId;
                      const requiredProfile = selectedFormation?.kind === "TASK_FORCE" ? "TASK_FORCE" : "GROUND_BATTLEGROUP";
                      const canMove = Boolean(selectedFormation && ["READY", "RECOVERING"].includes(selectedFormation.status) && selectedFormation.routeNodeIds.length === 0 && route.status === "OPEN" && route.travelRounds !== null && route.movementProfiles.includes(requiredProfile) && !selectedFormation.carrierTaskForceId);
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
                    {selectedFormation?.kind === "BATTLEGROUP" && selectedFormation.status === "EMBARKED" && selectedFormation.carrierTaskForceId && (
                      <button type="button" disabled={!canCreateOrders || submitting} onClick={() => void submitOrder({
                        type: "DISEMBARK_BATTLEGROUP",
                        battlegroupId: selectedFormation.id,
                        carrierTaskForceId: selectedFormation.carrierTaskForceId,
                      })}>DISEMBARK</button>
                    )}
                    {selectedFormation?.kind === "TASK_FORCE" && (
                      <button type="button" disabled={!canCreateOrders || submitting} onClick={() => void submitOrder({
                        type: "RESUPPLY_TASK_FORCE",
                        taskForceId: selectedFormation.id,
                      })}>CONSUME LARGE SUPPLY</button>
                    )}
                    {selectedOperation && supportCapability && ["ACTIVE", "MUSTERING"].includes(selectedOperation.status) && (
                      <button type="button" disabled={!canCreateOrders || submitting} onClick={() => void submitOrder({
                        type: "SUPPORT_CAMPAIGN",
                        operationId: selectedOperation.id,
                        capability: supportCapability,
                      })}>SUPPORT {selectedOperation.name.toUpperCase()}</button>
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
                  <p>The deployment planner validates one Battlegroup package, locks exact persistent loadouts, creates the tactical presence, closes its carrier assignment, and marks this operation active in one commit.</p>
                  <button type="button" disabled={!selectedOperation.campaignId || !["MUSTERING", "ACTIVE"].includes(selectedOperation.status)} onClick={() => {
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
