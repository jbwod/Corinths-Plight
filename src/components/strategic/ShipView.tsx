import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ModuleView, StrategicDataMode, StrategicSnapshot } from "../../strategic/model";
import { EquipmentIcon } from "../EquipmentVisual";

const DEMO_HEADERS = import.meta.env.DEV ? { "x-demo-user": "demo-user" } : undefined;
const JSON_HEADERS = { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) };

interface ShipViewProps {
  snapshot: StrategicSnapshot;
  mode: StrategicDataMode;
  onNotice: (notice: { tone: "info" | "success" | "danger"; message: string }) => void;
  onShipChanged: () => Promise<void>;
}

type ShipTab = "BRIDGE" | "MODULES" | "LOGISTICS";

function moduleSlots(modules: ModuleView[], slotType: ModuleView["slotType"], total: number): Array<ModuleView | undefined> {
  const matching = modules.filter((module) => module.slotType === slotType);
  return Array.from({ length: Math.max(total, matching.length) }, (_, index) => matching.find((module) => module.slotIndex === index) ?? matching.find((module) => module.slotIndex < 0 && matching.indexOf(module) === index));
}

function supplyValue(value: boolean | null): string {
  if (value === null) return "NOT REPORTED";
  return value ? "AVAILABLE" : "UNAVAILABLE";
}

function ShipIdentityDialog({
  ship,
  onClose,
  onSaved,
}: {
  ship: StrategicSnapshot["ship"];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
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
        body: JSON.stringify({
          commandId: `ship-identity-${crypto.randomUUID()}`,
          expectedVersion: ship.version,
          name,
          registry,
        }),
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
          <div><span className="eyebrow">PRIMARY SHIP RECORD</span><h2 id="ship-identity-title">Edit ship identity</h2></div>
          <button type="button" aria-label="Close ship identity editor" onClick={onClose}>×</button>
        </header>
        <section>
          <div className="ship-silhouette compact" aria-hidden="true"><i /><b>CSV</b></div>
          <div className="identity-fields">
            <label>SHIP NAME<input autoFocus required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>REGISTRY<input required minLength={2} maxLength={24} pattern="[A-Z0-9][A-Z0-9-]{1,23}" value={registry} onChange={(event) => setRegistry(event.target.value.toUpperCase())} /></label>
          </div>
          <p>The hull, installed modules, supply, location and combat state are unchanged. This identity event remains visible in Battalion activity.</p>
        </section>
        <footer>
          <div>{error && <p role="alert">{error}</p>}<small>SHIP STATE VERSION {ship.version}</small></div>
          <button type="button" onClick={onClose}>CANCEL</button>
          <button className="primary" type="submit" disabled={busy || unchanged}>{busy ? "SAVING…" : "SAVE IDENTITY"}</button>
        </footer>
      </form>
    </dialog>
  );
}

export function ShipView({ snapshot, mode, onNotice, onShipChanged }: ShipViewProps) {
  const [tab, setTab] = useState<ShipTab>("BRIDGE");
  const [identityOpen, setIdentityOpen] = useState(false);
  const ship = snapshot.ship;
  const externalSlots = moduleSlots(ship.modules, "EXTERNAL", ship.externalSlots);
  const internalSlots = moduleSlots(ship.modules, "INTERNAL", ship.internalSlots);
  const dualSlots = ship.modules.filter((module) => module.slotType === "EXTERNAL_INTERNAL");
  const supplyPercent = ship.supply.largeCurrent !== null && ship.supply.largeCapacity
    ? Math.max(0, Math.min(100, ship.supply.largeCurrent / ship.supply.largeCapacity * 100))
    : 0;
  const canConfigure = mode === "LIVE" && snapshot.battalion.permissions.includes("SHIP_CONFIGURE");

  const explainDeferred = (area: string) => onNotice({
    tone: "info",
    message: mode === "SHOWCASE"
      ? `${area} is disabled because this is the deterministic local showcase.`
      : `${area} remains read-only in this checkpoint. Server-validated ship purchase, slot claiming, refit cost, and module compatibility mutations are deferred.`,
  });

  if (mode === "LIVE" && !snapshot.battalion.permissions.includes("SHIP_VIEW")) {
    return (
      <div className="ship-workspace strategic-inline-auth">
        <span className="eyebrow">BATTALION PERMISSION REQUIRED</span>
        <h1>Ship records are restricted</h1>
        <p>Your active rank does not expose SHIP_VIEW. No ship identity, cargo, supply, modules, or embarked-unit data has been projected into this client.</p>
      </div>
    );
  }

  return (
    <div className="ship-workspace">
      <header className="strategic-hero ship-hero">
        <div className="ship-silhouette" aria-hidden="true"><i /><b>CSV</b></div>
        <div>
          <span className="eyebrow">PRIMARY BATTALION SHIP // {ship.registry}</span>
          <h1>{ship.name}</h1>
          <p>{ship.className}-class Orbital · {snapshot.battalion.name}</p>
          <div className="ship-hero-status"><b className={`status-chip state-${ship.status.toLowerCase()}`}>{ship.status.replaceAll("_", " ")}</b><span>{ship.location}</span><span>STATE v{ship.version}</span></div>
        </div>
        <div className="large-supply-gauge" aria-label={`${ship.supply.largeCurrent ?? "Unknown"} of ${ship.supply.largeCapacity ?? "unknown"} Large Supply`}>
          <span>LARGE SUPPLY</span>
          <strong>{ship.supply.largeCurrent ?? "—"}<small> / {ship.supply.largeCapacity ?? "—"}</small></strong>
          <i><b style={{ width: `${supplyPercent}%` }} /></i>
          <small>{ship.supply.suppliedUntilRound === null ? ship.supply.state : `SUPPLIED THROUGH ROUND ${ship.supply.suppliedUntilRound}`}</small>
        </div>
      </header>

      <div className="strategic-tabbar" role="tablist" aria-label="Ship sections">
        {(["BRIDGE", "MODULES", "LOGISTICS"] as const).map((value) => (
          <button type="button" role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)}>{value}</button>
        ))}
        {canConfigure && <button type="button" onClick={() => setIdentityOpen(true)}>EDIT SHIP IDENTITY</button>}
        <button type="button" className="deferred-action" onClick={() => explainDeferred("Ship module upgrades")}>MODULE UPGRADES · DEFERRED</button>
      </div>

      {tab === "BRIDGE" && (
        <section className="ship-bridge" role="tabpanel">
          <div className="bridge-grid">
            <article className="bridge-card navigation-card">
              <span className="eyebrow">NAVIGATION</span>
              <h2>{ship.taskForce.location}</h2>
              <p>{ship.taskForce.name} · {ship.taskForce.status.replaceAll("_", " ")}</p>
              <dl>
                <div><dt>CURRENT LOCATION</dt><dd>{ship.location}</dd></div>
                <div><dt>INTENTION</dt><dd>{ship.taskForce.intention ?? "No published strategic movement"}</dd></div>
                <div><dt>TRAVEL ETA</dt><dd>BALANCE REQUIRED</dd></div>
              </dl>
              <button type="button" onClick={() => explainDeferred("Task Force movement")}>MOVEMENT ORDERS · BLOCKED</button>
            </article>

            <article className="bridge-card readiness-card">
              <span className="eyebrow">FACILITY READINESS</span>
              <h2>{ship.capabilities.length} active capability records</h2>
              <div className="facility-list">
                {ship.capacities.map((capacity) => (
                  <div key={capacity.id} className={capacity.status.toLowerCase()}><i /><span><b>{capacity.label}</b><small>{capacity.source}</small></span><strong>{capacity.used !== null && capacity.total !== null ? `${capacity.used} / ${capacity.total}` : capacity.status}</strong></div>
                ))}
              </div>
            </article>

            <article className="bridge-card embarked-card">
              <span className="eyebrow">EMBARKED FORCES</span>
              <h2>{ship.embarkedUnits.length} units physically aboard</h2>
              <div className="embarked-unit-list">
                {ship.embarkedUnits.length ? ship.embarkedUnits.map((unit) => (
                  <div key={unit.id}><i>{unit.callsign.slice(0, 2)}</i><span><b>{unit.callsign}</b><small>{unit.className} · {unit.battlegroupName ?? "UNASSIGNED"}</small></span><strong>{unit.state.replaceAll("_", " ")}</strong></div>
                )) : <p className="strategic-empty-copy">No embarked units were returned by the ship service.</p>}
              </div>
            </article>

            <article className="bridge-card restrictions-card">
              <span className="eyebrow">IMPLEMENTATION BOUNDARY</span>
              <h2>Strategic home, not orbital combat</h2>
              <ul>
                <li><b>AVAILABLE</b> ship identity, location, modules, capacity, cargo, and supply read models</li>
                <li><b>PARTIAL</b> transport, repair, rearm, and deployment capabilities</li>
                <li><b>DEFERRED</b> purchase, refit, slot mutation, weapons, boarding, and fleet battles</li>
              </ul>
            </article>
          </div>
        </section>
      )}

      {tab === "MODULES" && (
        <section className="ship-modules-view" role="tabpanel">
          <header className="strategic-section-heading">
            <div><span className="eyebrow">RULESET-DEFINED SLOTS</span><h2>{ship.className} module plan</h2></div>
            <span>READ ONLY</span>
          </header>
          <div className="ship-slot-groups">
            <section>
              <header><span>EXTERNAL</span><b>{externalSlots.filter(Boolean).length} / {externalSlots.length}</b></header>
              <div className="ship-slot-row">
                {externalSlots.map((module, index) => (
                  <article className={module ? "occupied" : "empty"} key={`external-${index}`}>
                    {module && <EquipmentIcon definitionId={module.definitionId ?? module.id} label={module.name} className="ship-module-icon" />}
                    <small>EXTERNAL {String(index + 1).padStart(2, "0")}</small>
                    <strong>{module?.name ?? "EMPTY SLOT"}</strong>
                    <span>{module ? `${module.state} · ${module.implementationStatus.replaceAll("_", " ")}` : "No installed module"}</span>
                    {module && <div className="capability-chips">{module.capabilities.map((capability) => <i key={capability}>{capability.replaceAll("_", " ")}</i>)}</div>}
                  </article>
                ))}
              </div>
            </section>
            {dualSlots.length > 0 && (
              <section>
                <header><span>EXTERNAL + INTERNAL</span><b>{dualSlots.length} DUAL</b></header>
                <div className="ship-slot-row">
                  {dualSlots.map((module) => (
                    <article className="occupied" key={module.id}>
                      <EquipmentIcon definitionId={module.definitionId ?? module.id} label={module.name} className="ship-module-icon" />
                      <small>DUAL SLOT {String(module.slotIndex + 1).padStart(2, "0")}</small>
                      <strong>{module.name}</strong>
                      <span>{module.state} · {module.implementationStatus.replaceAll("_", " ")}</span>
                      <div className="capability-chips">{module.capabilities.map((capability) => <i key={capability}>{capability.replaceAll("_", " ")}</i>)}</div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <section>
              <header><span>INTERNAL</span><b>{internalSlots.filter(Boolean).length} / {internalSlots.length}</b></header>
              <div className="ship-slot-row internal">
                {internalSlots.map((module, index) => (
                  <article className={module ? "occupied" : "empty"} key={`internal-${index}`}>
                    {module && <EquipmentIcon definitionId={module.definitionId ?? module.id} label={module.name} className="ship-module-icon" />}
                    <small>INTERNAL {String(index + 1).padStart(2, "0")}</small>
                    <strong>{module?.name ?? "EMPTY SLOT"}</strong>
                    <span>{module ? `${module.state} · ${module.implementationStatus.replaceAll("_", " ")}` : "No installed module"}</span>
                    {module && <div className="capability-chips">{module.capabilities.map((capability) => <i key={capability}>{capability.replaceAll("_", " ")}</i>)}</div>}
                  </article>
                ))}
              </div>
            </section>
          </div>
          <p className="boundary-note"><strong>Compatibility boundary:</strong> Slot counts and module capabilities come from the pinned server catalogue. Empty slots are not free purchases, and this client does not calculate requisition cost or compatibility.</p>
        </section>
      )}

      {tab === "LOGISTICS" && (
        <section className="ship-logistics" role="tabpanel">
          <div className="supply-hierarchy" aria-label="Supply hierarchy">
            <article className="large"><small>STRATEGIC WAR CHEST</small><h2>Large Supply</h2><strong>{ship.supply.largeCurrent ?? "—"} / {ship.supply.largeCapacity ?? "—"}</strong><p>{ship.supply.state.replaceAll("_", " ")}{ship.supply.suppliedUntilRound !== null ? ` through strategic round ${ship.supply.suppliedUntilRound}` : ""}</p></article>
            <i aria-hidden="true" />
            <article><small>FOB / HQ LOGISTICS</small><h2>Medium Supply</h2><strong>{supplyValue(ship.supply.mediumAccess)}</strong><p>Access is enabled only while the Task Force is supplied and a compatible source exists.</p></article>
            <i aria-hidden="true" />
            <article><small>UNIT-LEVEL SUPPORT</small><h2>Small Supply</h2><strong>{supplyValue(ship.supply.smallAccess)}</strong><p>Ammunition, repair, medical, and construction remain distinct server-tracked resources.</p></article>
          </div>
          <div className="logistics-lower-grid">
            <article className="panel-frame">
              <header className="strategic-section-heading"><div><span className="eyebrow">MANIFEST</span><h2>Located cargo</h2></div><span>{ship.cargo.length} RECORDS</span></header>
              <div className="cargo-list">
                {ship.cargo.length ? ship.cargo.map((cargo) => <div key={cargo.id}><span><b>{cargo.label}</b><small>{cargo.location}</small></span><strong>{cargo.quantity ?? "ACCESS"}</strong><i>{cargo.supplySize ?? "CARGO"}</i></div>) : <p className="strategic-empty-copy">No cargo records were returned.</p>}
              </div>
            </article>
            <article className="panel-frame">
              <header className="strategic-section-heading"><div><span className="eyebrow">FACILITIES</span><h2>Support capabilities</h2></div></header>
              <div className="support-capability-grid">{ship.capabilities.map((capability) => <span key={capability}>{capability.replaceAll("_", " ")}</span>)}</div>
            </article>
          </div>
          <p className="boundary-note"><strong>Supply boundary:</strong> Large, Medium, and Small Supply are never collapsed into one pool. Transfers and consumption are disabled until an idempotent server mutation validates location, source, capacity, and expected version.</p>
        </section>
      )}
      {identityOpen && <ShipIdentityDialog ship={ship} onClose={() => setIdentityOpen(false)} onSaved={async () => {
        setIdentityOpen(false);
        onNotice({ tone: "success", message: "Primary ship identity saved to the persistent Battalion record." });
        await onShipChanged();
      }} />}
    </div>
  );
}
