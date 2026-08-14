import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ModuleView, ShipCapacityView, StrategicDataMode, StrategicSnapshot } from "../../strategic/model";
import { EquipmentIcon } from "../EquipmentVisual";
import { UnitPortrait } from "../UnitVisual";
import { ShipSprite, shipClassKey } from "./ShipSprite";

const DEMO_HEADERS = import.meta.env.DEV ? { "x-demo-user": "demo-user" } : undefined;
const JSON_HEADERS = { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) };

interface ShipViewProps {
  snapshot: StrategicSnapshot;
  mode: StrategicDataMode;
  onNotice: (notice: { tone: "info" | "success" | "danger"; message: string }) => void;
  onShipChanged: () => Promise<void>;
}

type ShipTab = "OVERVIEW" | "SYSTEMS" | "LOGISTICS";
type ShipIconName = "anchor" | "box" | "flight" | "module" | "repair" | "route" | "shield" | "supply" | "troops";
type CapabilityGroup = "TRANSPORT" | "FLIGHT OPERATIONS" | "MAINTENANCE" | "ARMOURY";

interface CapabilityPresentation {
  label: string;
  description: string;
  group: CapabilityGroup;
  icon: ShipIconName;
}

const CAPABILITY_COPY: Record<string, CapabilityPresentation> = {
  CARRY_INFANTRY: { label: "Infantry berths", description: "Embark infantry formations for task-force deployment.", group: "TRANSPORT", icon: "troops" },
  CARRY_LIGHT_VEHICLE: { label: "Light vehicle bay", description: "Carry light vehicles between strategic locations.", group: "TRANSPORT", icon: "box" },
  CARRY_HEAVY_VEHICLE: { label: "Heavy vehicle bay", description: "Embark tanks and other heavy ground vehicles.", group: "TRANSPORT", icon: "box" },
  CARRY_MECH: { label: "Mech berths", description: "Secure and transport combat mechs aboard ship.", group: "TRANSPORT", icon: "box" },
  CARRY_VTOL: { label: "VTOL berths", description: "Embark atmospheric aircraft and their support crews.", group: "TRANSPORT", icon: "flight" },
  CARRY_AEROSPACE: { label: "Aerospace berths", description: "Carry aerospace craft with task-force operations.", group: "TRANSPORT", icon: "flight" },
  LAND_VTOL: { label: "VTOL recovery", description: "Receive and launch VTOL aircraft from the ship.", group: "FLIGHT OPERATIONS", icon: "flight" },
  LAND_AEROSPACE: { label: "Aerospace recovery", description: "Receive and launch aerospace craft from the flight deck.", group: "FLIGHT OPERATIONS", icon: "flight" },
  REPAIR_VEHICLE: { label: "Vehicle workshop", description: "Support repairs to embarked ground vehicles.", group: "MAINTENANCE", icon: "repair" },
  REPAIR_MECH: { label: "Mech workshop", description: "Support repairs to embarked combat mechs.", group: "MAINTENANCE", icon: "repair" },
  REPAIR_AEROSPACE: { label: "Aircraft workshop", description: "Support repairs to embarked flight assets.", group: "MAINTENANCE", icon: "repair" },
  REARM_INFANTRY: { label: "Infantry armoury", description: "Replenish infantry ammunition and field equipment.", group: "ARMOURY", icon: "shield" },
  REARM_AEROSPACE: { label: "Aircraft ordnance", description: "Replenish aerospace ammunition and ordnance.", group: "ARMOURY", icon: "flight" },
  CHANGE_INFANTRY_LOADOUT: { label: "Infantry loadouts", description: "Prepare alternate infantry equipment packages aboard ship.", group: "ARMOURY", icon: "shield" },
  REFIT_MECH: { label: "Mech refit", description: "Prepare supported mech loadout changes aboard ship.", group: "MAINTENANCE", icon: "repair" },
};

const CAPABILITY_GROUPS: CapabilityGroup[] = ["TRANSPORT", "FLIGHT OPERATIONS", "MAINTENANCE", "ARMOURY"];

function readable(value: string): string {
  return value
    .replace(/^capability[-_]/i, "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function capabilityPresentation(capability: string): CapabilityPresentation {
  const known = CAPABILITY_COPY[capability];
  if (known) return known;
  const label = readable(capability);
  if (/^(CARRY|TRANSPORT)/.test(capability)) return { label, description: `Provides ${label.toLowerCase()} capacity.`, group: "TRANSPORT", icon: "box" };
  if (/^(LAND|LAUNCH)/.test(capability)) return { label, description: `Supports ${label.toLowerCase()} aboard ship.`, group: "FLIGHT OPERATIONS", icon: "flight" };
  if (/^(REPAIR|REFIT)/.test(capability)) return { label, description: `Supports ${label.toLowerCase()} while embarked.`, group: "MAINTENANCE", icon: "repair" };
  return { label, description: `Provides ${label.toLowerCase()} support while aboard.`, group: "ARMOURY", icon: "shield" };
}

function friendlySource(source: string): string {
  return source.toLowerCase().includes("server-") ? "Provided by installed systems" : source;
}

function friendlyCapacityLabel(capacity: ShipCapacityView): string {
  const capabilityKey = capacity.label.trim().toUpperCase().replaceAll(" ", "_").replaceAll("-", "_");
  if (CAPABILITY_COPY[capabilityKey]) return CAPABILITY_COPY[capabilityKey].label;
  return readable(capacity.label);
}

function supplyAccess(value: boolean | null): { label: string; detail: string; tone: string } {
  if (value === null) return { label: "Not confirmed", detail: "No supply link has been reported.", tone: "unknown" };
  return value
    ? { label: "Available", detail: "Units can draw this supply while the task force remains supplied.", tone: "available" }
    : { label: "Unavailable", detail: "Restore the task-force supply link to regain access.", tone: "unavailable" };
}

function capacityValue(capacity: ShipCapacityView): { main: string; detail: string } {
  if (capacity.used !== null && capacity.total !== null) {
    const free = Math.max(0, capacity.total - capacity.used);
    return { main: `${free} free`, detail: `${capacity.used} of ${capacity.total} in use` };
  }
  if (capacity.total !== null) return { main: String(capacity.total), detail: "total capacity" };
  return { main: readable(capacity.status), detail: "capacity status" };
}

function moduleSlots(modules: ModuleView[], slotType: ModuleView["slotType"], total: number): Array<ModuleView | undefined> {
  const matching = modules.filter((module) => module.slotType === slotType);
  return Array.from({ length: Math.max(total, matching.length) }, (_, index) => matching.find((module) => module.slotIndex === index) ?? matching.find((module) => module.slotIndex < 0 && matching.indexOf(module) === index));
}

function ShipIcon({ name }: { name: ShipIconName }) {
  const paths: Record<ShipIconName, string> = {
    anchor: "M12 3v12m-4-8h8M5 13c1 5 4 7 7 7s6-2 7-7M9 4h6",
    box: "M4 7l8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4m-8 4v10",
    flight: "M3 14l7-3 3-7 2 1-1 7 6 3v2l-7-1-4 4-2-1 2-4-6 1v-2Z",
    module: "M5 5h14v14H5V5Zm4 0v-2m6 2v-2M9 21v-2m6 2v-2M5 9H3m2 6H3m18-6h-2m2 6h-2M9 9h6v6H9V9Z",
    repair: "M14 5a5 5 0 0 0-6 6L3 16l5 5 5-5a5 5 0 0 0 6-6l-3 2-3-3 1-4Z",
    route: "M5 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm14 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 7h3c4 0 5 2 5 5s1 5 3 5",
    shield: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Zm-3 9 2 2 4-5",
    supply: "M5 6h14v12H5V6Zm3 4h8m-4-4v12",
    troops: "M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20v-4c0-3 2-5 5-5s5 2 5 5v4m-2-8c1-1 3-1 5-1 3 0 5 2 5 5v4h-6",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function ShipSchematic({ shipClass, compact = false }: { shipClass: string; compact?: boolean }) {
  const classKey = shipClassKey(shipClass);
  return (
    <div className={`ship-schematic${compact ? " compact" : ""}`} data-ship-class={classKey} aria-hidden="true">
      <ShipSprite shipClass={shipClass} />
      <svg className="ship-schematic-overlay" viewBox="0 0 300 120">
        <path d="M12 95h276M26 91v8m31-6v4m31-4v4m31-6v8m31-6v4m31-4v4m31-6v8m31-6v4m31-4v4" />
        <path d="M18 28v-8h48m216 8v-8h-48M18 82v8h48m216-8v8h-48" />
        <circle cx="150" cy="95" r="3" />
      </svg>
    </div>
  );
}

function ShipIdentityDialog({ ship, onClose, onSaved }: { ship: StrategicSnapshot["ship"]; onClose: () => void; onSaved: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(ship.name);
  const [registry, setRegistry] = useState(ship.registry);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/ships/primary/identity", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ commandId: `ship-identity-${crypto.randomUUID()}`, expectedVersion: ship.version, name, registry }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? `Ship identity update failed (${response.status}).`);
      }
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ship identity could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const normalizedRegistry = registry.trim().toUpperCase();
  const unchanged = name.trim() === ship.name && normalizedRegistry === ship.registry;
  return (
    <dialog ref={ref} className="identity-dialog ship-identity-dialog" aria-labelledby="ship-identity-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <form onSubmit={(event) => void save(event)}>
        <header>
          <div><span className="eyebrow">SHIP IDENTITY</span><h2 id="ship-identity-title">Edit ship identity</h2></div>
          <button type="button" aria-label="Close ship identity editor" onClick={onClose}>×</button>
        </header>
        <section>
          <ShipSchematic shipClass={ship.className} compact />
          <div className="identity-fields">
            <label>SHIP NAME<input autoFocus required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>REGISTRY<input required minLength={2} maxLength={24} pattern="[A-Z0-9][A-Z0-9-]{1,23}" value={registry} onChange={(event) => setRegistry(event.target.value.toUpperCase())} /></label>
          </div>
          <p>Renaming the ship does not change its hull, systems, stores, location, or combat state.</p>
        </section>
        <footer>
          <div>{error && <p role="alert">{error}</p>}<small>SHIP RECORD v{ship.version}</small></div>
          <button type="button" onClick={onClose}>CANCEL</button>
          <button className="primary" type="submit" disabled={busy || unchanged}>{busy ? "SAVING…" : "SAVE IDENTITY"}</button>
        </footer>
      </form>
    </dialog>
  );
}

function ModuleCard({ module, slotLabel }: { module?: ModuleView; slotLabel: string }) {
  if (!module) {
    return (
      <article className="ship-system-card empty">
        <span className="ship-system-empty-icon"><ShipIcon name="module" /></span>
        <div><small>{slotLabel}</small><h3>Open mount</h3><p>No ship system is fitted here.</p></div>
      </article>
    );
  }
  return (
    <article className={`ship-system-card state-${module.state.toLowerCase()}`}>
      <EquipmentIcon definitionId={module.definitionId ?? module.id} label={module.name} className="ship-module-icon" decorative={false} />
      <div className="ship-system-copy">
        <small>{slotLabel}</small>
        <h3>{module.name}</h3>
        <span className={`ship-system-state state-${module.state.toLowerCase()}`}>{readable(module.state)}</span>
      </div>
      <div className="ship-system-services" aria-label={`${module.name} services`}>
        {module.capabilities.length
          ? module.capabilities.map((capability) => <span key={capability}>{capabilityPresentation(capability).label}</span>)
          : <span className="muted">No active services</span>}
      </div>
    </article>
  );
}

export function ShipView({ snapshot, mode, onNotice, onShipChanged }: ShipViewProps) {
  const [tab, setTab] = useState<ShipTab>("OVERVIEW");
  const [identityOpen, setIdentityOpen] = useState(false);
  const ship = snapshot.ship;
  const externalSlots = moduleSlots(ship.modules, "EXTERNAL", ship.externalSlots);
  const internalSlots = moduleSlots(ship.modules, "INTERNAL", ship.internalSlots);
  const dualSlots = ship.modules.filter((module) => module.slotType === "EXTERNAL_INTERNAL");
  const supplyPercent = ship.supply.largeCurrent !== null && ship.supply.largeCapacity
    ? Math.max(0, Math.min(100, ship.supply.largeCurrent / ship.supply.largeCapacity * 100))
    : 0;
  const operationalModules = ship.modules.filter((module) => module.state === "OPERATIONAL").length;
  const unavailableCapacity = ship.capacities.filter((capacity) => ["FULL", "UNAVAILABLE"].includes(capacity.status));
  const canConfigure = mode === "LIVE" && snapshot.battalion.permissions.includes("SHIP_CONFIGURE");
  const supplyState = readable(ship.supply.state);
  const readinessLabel = unavailableCapacity.length || ship.supply.state === "UNSUPPLIED" ? "Attention needed" : "Ready for operations";

  const explainDeferred = (area: string) => onNotice({
    tone: "info",
    message: mode === "SHOWCASE"
      ? `${area} is unavailable in preview mode.`
      : `${area} is not available from the ship screen yet. Installed systems and compatibility remain read-only for now.`,
  });

  if (mode === "LIVE" && !snapshot.battalion.permissions.includes("SHIP_VIEW")) {
    return (
      <div className="ship-workspace strategic-inline-auth">
        <span className="eyebrow">SHIP ACCESS REQUIRED</span>
        <h1>Ship records are restricted</h1>
        <p>Your current Battalion role cannot view the shared ship. Ask a Battalion commander to review your permissions.</p>
      </div>
    );
  }

  const capabilityGroups = CAPABILITY_GROUPS.map((group) => ({
    group,
    items: ship.capabilities.map(capabilityPresentation).filter((capability) => capability.group === group),
  })).filter((entry) => entry.items.length);
  const mediumSupply = supplyAccess(ship.supply.mediumAccess);
  const smallSupply = supplyAccess(ship.supply.smallAccess);
  const storedCargo = ship.cargo.filter((cargo) => cargo.kind !== "UNIT");

  return (
    <div className="ship-workspace">
      <header className="ship-command-hero">
        <div className="ship-command-visual"><ShipSchematic shipClass={ship.className} /><span>{ship.className.toUpperCase()} CLASS // SIDE PROFILE</span></div>
        <div className="ship-command-identity">
          <span className="eyebrow">BATTALION FLAGSHIP // {ship.registry}</span>
          <h1>{ship.name}</h1>
          <p>{ship.className}-class orbital vessel of {snapshot.battalion.name}</p>
          <div className="ship-command-tags">
            <span className={`status-chip state-${ship.status.toLowerCase()}`}>{readable(ship.status)}</span>
            <span><ShipIcon name="anchor" />{ship.location}</span>
            <span><ShipIcon name="route" />{ship.taskForce.name}</span>
          </div>
        </div>
        <aside className="ship-readiness-summary" aria-label="Ship readiness summary">
          <small>SHIP READINESS</small>
          <strong>{readinessLabel}</strong>
          <div><span><b>{operationalModules}</b> of {ship.modules.length}<small>systems online</small></span><span><b>{ship.embarkedUnits.length}</b><small>units aboard</small></span></div>
          <p><i className={ship.supply.state === "UNSUPPLIED" ? "warning" : ""} />{supplyState}{ship.supply.suppliedUntilRound !== null ? ` through round ${ship.supply.suppliedUntilRound}` : ""}</p>
        </aside>
      </header>

      <nav className="ship-section-nav" aria-label="Ship sections">
        {([
          ["OVERVIEW", "Overview"],
          ["SYSTEMS", "Systems"],
          ["LOGISTICS", "Cargo & supply"],
        ] as const).map(([value, label]) => (
          <button type="button" aria-current={tab === value ? "page" : undefined} className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)}>{label}</button>
        ))}
        {canConfigure && <button type="button" className="ship-identity-action" onClick={() => setIdentityOpen(true)}>EDIT SHIP IDENTITY</button>}
      </nav>

      {tab === "OVERVIEW" && (
        <section className="ship-overview" aria-label="Ship overview">
          <div className="ship-overview-main">
            <article className="ship-mission-card">
              <header><span className="ship-card-icon"><ShipIcon name="route" /></span><div><small>CURRENT ASSIGNMENT</small><h2>{ship.taskForce.location}</h2></div><span className={`status-chip state-${ship.taskForce.status.toLowerCase()}`}>{readable(ship.taskForce.status)}</span></header>
              <div className="ship-mission-route"><span>{ship.location}</span><i /><span>{ship.taskForce.location}</span></div>
              <blockquote>{ship.taskForce.intention ?? "No standing task-force intention has been published."}</blockquote>
              <button type="button" onClick={() => explainDeferred("Task-force movement orders")}>ABOUT MOVEMENT ORDERS</button>
            </article>

            <section className="ship-service-section">
              <header><div><span className="eyebrow">WHAT THIS SHIP ENABLES</span><h2>Services available to your forces</h2></div><p>Installed systems determine what can embark, launch, rearm, and repair.</p></header>
              <div className="ship-service-groups">
                {capabilityGroups.length ? capabilityGroups.map(({ group, items }) => (
                  <article key={group}>
                    <header><ShipIcon name={items[0]?.icon ?? "module"} /><h3>{group}</h3><span>{items.length}</span></header>
                    {items.map((item) => <div key={item.label}><ShipIcon name={item.icon} /><span><b>{item.label}</b><small>{item.description}</small></span></div>)}
                  </article>
                )) : <div className="ship-empty-state"><ShipIcon name="module" /><h3>No support systems online</h3><p>Install or repair a ship module to provide force support.</p></div>}
              </div>
            </section>
          </div>

          <aside className="ship-overview-side">
            <article className="ship-capacity-panel">
              <header><div><span className="eyebrow">EMBARKATION</span><h2>Available capacity</h2></div><ShipIcon name="box" /></header>
              <div>
                {ship.capacities.length ? ship.capacities.map((capacity) => {
                  const value = capacityValue(capacity);
                  return <section key={capacity.id} className={`state-${capacity.status.toLowerCase()}`}><i /><span><b>{friendlyCapacityLabel(capacity)}</b><small>{friendlySource(capacity.source)}</small></span><strong>{value.main}<small>{value.detail}</small></strong></section>;
                }) : <div className="ship-empty-state compact"><p>No transport capacity is currently available.</p></div>}
              </div>
            </article>

            <article className="ship-aboard-panel">
              <header><div><span className="eyebrow">FORCES ABOARD</span><h2>{ship.embarkedUnits.length ? `${ship.embarkedUnits.length} embarked units` : "No units aboard"}</h2></div><ShipIcon name="troops" /></header>
              <div className="ship-aboard-list">
                {ship.embarkedUnits.length ? ship.embarkedUnits.map((unit) => (
                  <div key={unit.id}>
                    {unit.definitionId
                      ? <UnitPortrait definitionId={unit.definitionId} label={unit.className} className="ship-embarked-portrait" />
                      : <i>{unit.callsign.slice(0, 2)}</i>}
                    <span><b>{unit.callsign}</b><small>{unit.className}</small><em>{unit.battlegroupName ?? "Unassigned reserve"}</em></span>
                    <strong>{readable(unit.state)}</strong>
                  </div>
                )) : <div className="ship-empty-state compact"><p>Assign a unit to a Battlegroup and embark it from the Forces screen.</p></div>}
              </div>
            </article>
          </aside>
        </section>
      )}

      {tab === "SYSTEMS" && (
        <section className="ship-systems" aria-label="Installed ship systems">
          <header className="ship-page-heading">
            <div><span className="eyebrow">INSTALLED SYSTEMS</span><h2>{ship.className} loadout</h2><p>Every module below changes the services available to embarked forces.</p></div>
            <button type="button" onClick={() => explainDeferred("Ship refitting")}>REFIT AVAILABILITY</button>
          </header>
          <div className="ship-system-groups">
            <section>
              <header><span><ShipIcon name="module" />EXTERNAL MOUNTS</span><b>{externalSlots.filter(Boolean).length} of {externalSlots.length} fitted</b></header>
              <div>{externalSlots.map((module, index) => <ModuleCard module={module} slotLabel={`External mount ${index + 1}`} key={`external-${index}`} />)}</div>
            </section>
            {dualSlots.length > 0 && <section>
              <header><span><ShipIcon name="module" />THROUGH-HULL SYSTEMS</span><b>{dualSlots.length} fitted</b></header>
              <div>{dualSlots.map((module) => <ModuleCard module={module} slotLabel={`Through-hull mount ${module.slotIndex + 1}`} key={module.id} />)}</div>
            </section>}
            <section>
              <header><span><ShipIcon name="module" />INTERNAL SYSTEMS</span><b>{internalSlots.filter(Boolean).length} of {internalSlots.length} fitted</b></header>
              <div>{internalSlots.map((module, index) => <ModuleCard module={module} slotLabel={`Internal bay ${index + 1}`} key={`internal-${index}`} />)}</div>
            </section>
          </div>
          <p className="ship-availability-note"><ShipIcon name="module" /><span><strong>Loadout planning is read-only.</strong> The server provides installed modules and compatibility. Purchasing, removing, and refitting modules will appear here when those commands are available.</span></p>
        </section>
      )}

      {tab === "LOGISTICS" && (
        <section className="ship-logistics" aria-label="Ship cargo and supply">
          <header className="ship-page-heading">
            <div><span className="eyebrow">SHIP LOGISTICS</span><h2>Stores and support</h2><p>Supply keeps the task force operational; cargo is the material physically aboard this ship.</p></div>
          </header>
          <div className="ship-supply-summary">
            <article className="ship-large-supply">
              <span className="ship-card-icon"><ShipIcon name="supply" /></span>
              <div><small>STRATEGIC SUPPLY</small><h3>Large Supply</h3><p>Powers task-force movement and sustained strategic operations.</p></div>
              <strong>{ship.supply.largeCurrent ?? "—"}<small> / {ship.supply.largeCapacity ?? "—"}</small></strong>
              <div className="ship-supply-meter" role="meter" aria-label="Large Supply" aria-valuemin={0} aria-valuemax={ship.supply.largeCapacity ?? 0} aria-valuenow={ship.supply.largeCurrent ?? 0}><i style={{ transform: `scaleX(${supplyPercent / 100})` }} /></div>
              <footer>{ship.supply.suppliedUntilRound !== null ? `Task force supplied through round ${ship.supply.suppliedUntilRound}` : supplyState}</footer>
            </article>
            <article className={`ship-supply-access ${mediumSupply.tone}`}><ShipIcon name="supply" /><div><small>BASE SUPPORT</small><h3>Medium Supply</h3><p>{mediumSupply.detail}</p></div><strong>{mediumSupply.label}</strong></article>
            <article className={`ship-supply-access ${smallSupply.tone}`}><ShipIcon name="repair" /><div><small>FIELD SUPPORT</small><h3>Small Supply</h3><p>{smallSupply.detail}</p></div><strong>{smallSupply.label}</strong></article>
          </div>

          <div className="ship-logistics-grid">
            <article className="ship-cargo-panel">
              <header><div><span className="eyebrow">CARGO ABOARD</span><h2>Ship stores</h2><p>Supplies and equipment currently carried by {ship.name}.</p></div><strong>{storedCargo.length} {storedCargo.length === 1 ? "item" : "items"}</strong></header>
              <div className="ship-cargo-list">
                {storedCargo.length ? storedCargo.map((cargo) => (
                  <div key={cargo.id}>
                    <span className={`ship-cargo-icon size-${cargo.supplySize?.toLowerCase() ?? "cargo"}`}><ShipIcon name={cargo.supplySize ? "supply" : "box"} /></span>
                    <span><b>{cargo.label}</b><small>{cargo.location.replace(`${ship.name} · `, "")}</small></span>
                    <strong>{cargo.quantity ?? "Access"}<small>{cargo.quantity === null ? "linked service" : cargo.supplySize ? `${readable(cargo.supplySize)} supply` : "units"}</small></strong>
                  </div>
                )) : <div className="ship-empty-state"><ShipIcon name="box" /><h3>No loose cargo recorded</h3><p>Embarked units are listed on Overview. Transferred supplies and equipment will appear here.</p></div>}
              </div>
            </article>

            <article className="ship-support-panel">
              <header><div><span className="eyebrow">SUPPORT DECKS</span><h2>Services aboard</h2><p>Provided by operational modules installed on this ship.</p></div><strong>{ship.capabilities.length}</strong></header>
              <div>
                {ship.capabilities.length ? ship.capabilities.map((capability) => {
                  const item = capabilityPresentation(capability);
                  return <section key={capability}><span><ShipIcon name={item.icon} /></span><div><b>{item.label}</b><small>{item.description}</small></div></section>;
                }) : <div className="ship-empty-state compact"><p>No support services are currently online.</p></div>}
              </div>
            </article>
          </div>
        </section>
      )}

      {identityOpen && <ShipIdentityDialog ship={ship} onClose={() => setIdentityOpen(false)} onSaved={async () => {
        setIdentityOpen(false);
        onNotice({ tone: "success", message: "Ship identity saved." });
        await onShipChanged();
      }} />}
    </div>
  );
}
