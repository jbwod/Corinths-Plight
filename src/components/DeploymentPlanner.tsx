import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeploymentMethodId, EffectiveUnit } from "../../packages/domain/src";
import { Glyph } from "./Glyph";

const DEMO_USER = "demo-user";
const headers = import.meta.env.DEV ? { "x-demo-user": DEMO_USER } : undefined;

type Unit = { unitId: string; callsign: string; name: string; definitionId: string; status: string; locationState: string };
type Loadout = { unitId: string; unitVersion: number; loadout: { id: string; revision: number; status: string }; effectiveUnit: EffectiveUnit | null; validation: { valid: boolean; errors: Array<{ code: string; message: string }> } };
type Method = { id: DeploymentMethodId; name: string; implementation_status: string };
type Zone = { id: string; hex: { q: number; r: number }; allowedMethods: DeploymentMethodId[]; environment: string[] };
type Context = { campaignId: string; battalionId: string; canCommit: boolean; methods: Method[]; insertionZones: Zone[] };
type PlanResponse = { planId: string; campaignId?: string; revision: number; status: string; validation: { valid: boolean; errors: Array<{ code: string; message: string; entityId?: string }>; warnings: Array<{ code: string; message: string }> } };
type CampaignOption = { campaignId: string; name: string; status: string; scenarioAvailable: boolean };

function collection(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["forces", "units", "items"]) if (Array.isArray(record[key])) return record[key];
  }
  return [];
}

async function message(response: Response): Promise<string> {
  try { return ((await response.json()) as { error?: { message?: string } }).error?.message ?? `Request failed (${response.status}).`; }
  catch { return `Request failed (${response.status}).`; }
}

export function DeploymentPlanner({ onNotice }: { onNotice: (notice: { tone: "info" | "success" | "danger"; message: string }) => void }) {
  const [mode, setMode] = useState<"LOADING" | "LIVE" | "ERROR">("LOADING");
  const [units, setUnits] = useState<Unit[]>([]);
  const [loadouts, setLoadouts] = useState<Map<string, Loadout>>(new Map());
  const [context, setContext] = useState<Context>();
  const [selected, setSelected] = useState<string[]>([]);
  const [method, setMethod] = useState<DeploymentMethodId>("STANDARD_GROUND");
  const [zoneId, setZoneId] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [plan, setPlan] = useState<PlanResponse>();
  const [busy, setBusy] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [planId] = useState(() => `deployment-plan-${crypto.randomUUID()}`);

  const load = useCallback(async () => {
    try {
      const directoryResponse = await fetch("/api/campaigns", { headers });
      if (!directoryResponse.ok) throw new Error("Campaign directory is unavailable.");
      const directory = await directoryResponse.json() as { campaigns?: CampaignOption[] };
      const options = (directory.campaigns ?? []).filter((campaign) =>
        campaign.scenarioAvailable && ["RECRUITING", "ACTIVE", "PAUSED"].includes(campaign.status),
      );
      const selectedCampaignId = options.find((campaign) => campaign.campaignId === campaignId)?.campaignId
        ?? options[0]?.campaignId;
      if (!selectedCampaignId) throw new Error("Join an authored campaign before planning a deployment.");
      const [forcesResponse, contextResponse, plansResponse] = await Promise.all([
        fetch("/api/forces", { headers }),
        fetch(`/api/deployment-context?campaignId=${encodeURIComponent(selectedCampaignId)}`, { headers }),
        fetch("/api/deployment-plans", { headers }),
      ]);
      if (!forcesResponse.ok || !contextResponse.ok || !plansResponse.ok) throw new Error("Authoritative deployment APIs are unavailable.");
      const forcePayload: unknown = await forcesResponse.json();
      const nextUnits = collection(forcePayload).flatMap((value): Unit[] => {
        const item = value as Partial<Unit>;
        return item.unitId && item.callsign ? [{ unitId: item.unitId, callsign: item.callsign, name: item.name ?? item.callsign, definitionId: item.definitionId ?? "unit", status: item.status ?? "ACTIVE", locationState: item.locationState ?? "RESERVE" }] : [];
      }).filter((unit) => !["DESTROYED", "RETIRED", "DEPLOYED"].includes(unit.status));
      const nextLoadouts = new Map<string, Loadout>();
      await Promise.all(nextUnits.map(async (unit) => {
        const response = await fetch(`/api/forces/${encodeURIComponent(unit.unitId)}/loadout`, { headers });
        if (response.ok) nextLoadouts.set(unit.unitId, await response.json() as Loadout);
      }));
      const nextContext = await contextResponse.json() as Context;
      const plans = await plansResponse.json() as { plans?: Array<PlanResponse & { id?: string }> };
      const current = plans.plans?.find((candidate) => candidate.campaignId === selectedCampaignId && candidate.status !== "COMMITTED");
      setCampaigns(options);
      setCampaignId(selectedCampaignId);
      setUnits(nextUnits);
      setLoadouts(nextLoadouts);
      setContext(nextContext);
      setZoneId((currentValue) => currentValue || nextContext.insertionZones[0]?.id || "");
      if (current) setPlan({ ...current, planId: current.planId ?? current.id ?? planId });
      setMode("LIVE");
    } catch (error) {
      setMode("ERROR");
      onNotice({ tone: "danger", message: error instanceof Error ? error.message : "Deployment service is unavailable." });
    }
  }, [campaignId, onNotice, planId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const implementedMethods = context?.methods.filter((candidate) => candidate.implementation_status === "IMPLEMENTED") ?? [];
  const zones = context?.insertionZones.filter((zone) => zone.allowedMethods.includes(method)) ?? [];
  const transportRequired = method !== "STANDARD_GROUND";
  const carriers = useMemo(() => selected.flatMap((id) => {
    const effective = loadouts.get(id)?.effectiveUnit;
    return effective?.cargoProfile ? [{ id, callsign: units.find((unit) => unit.unitId === id)?.callsign ?? id, effective }] : [];
  }), [loadouts, selected, units]);
  const selectedUnits = selected.map((id) => ({ unit: units.find((unit) => unit.unitId === id)!, loadout: loadouts.get(id) })).filter((item) => item.unit && item.loadout);

  async function save() {
    if (mode !== "LIVE" || !context || !zoneId || selectedUnits.length === 0) return;
    setBusy(true);
    try {
      const carrier = transportRequired ? carriers.find((candidate) => candidate.id === carrierId) : undefined;
      if (transportRequired && !carrier) throw new Error("Select an authoritative transport from the force package.");
      const cargoUnits = carrier ? selectedUnits.filter((item) => item.unit.unitId !== carrier.id) : [];
      const response = await fetch("/api/deployment-plans", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedRevision: plan?.revision ?? 0,
          planId: plan?.planId ?? planId,
          campaignId,
          method,
          insertionZoneId: zoneId,
          route: method === "PARADROP" ? [{ q: -5, r: 2 }, zones.find((zone) => zone.id === zoneId)?.hex, { q: 2, r: -2 }].filter(Boolean) : [],
          units: selectedUnits.map(({ unit, loadout }) => ({ unitId: unit.unitId, loadoutId: loadout!.loadout.id, expectedUnitVersion: loadout!.unitVersion, expectedLoadoutRevision: loadout!.loadout.revision })),
          transports: carrier ? [{
            carrierUnitId: carrier.id,
            cargoProfileId: carrier.effective.cargoProfile!.id,
            cargo: cargoUnits.map(({ unit, loadout }) => ({ id: `cargo-${unit.unitId}`, kind: loadout!.effectiveUnit?.tags.includes("INFANTRY") ? "PERSONNEL" : "VEHICLE", quantity: 1, unitId: unit.unitId, tags: loadout!.effectiveUnit?.tags ?? [] })),
          }] : [],
        }),
      });
      if (!response.ok) throw new Error(await message(response));
      const next = await response.json() as PlanResponse;
      setPlan(next);
      onNotice({ tone: next.validation.valid ? "success" : "danger", message: next.validation.valid ? "Deployment package validated by the server." : "Deployment package saved with authoritative blockers." });
    } catch (error) { onNotice({ tone: "danger", message: error instanceof Error ? error.message : "Deployment plan failed." }); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!plan?.validation.valid || !context?.canCommit) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/deployment-plans/${encodeURIComponent(plan.planId)}/commit`, {
        method: "POST", headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedRevision: plan.revision }),
      });
      if (!response.ok) throw new Error(await message(response));
      const committed = await response.json() as { revision: number; status: string };
      setPlan((current) => current ? { ...current, revision: committed.revision, status: committed.status } : current);
      onNotice({ tone: "success", message: "Campaign loadouts locked and deployment snapshots committed." });
    } catch (error) { onNotice({ tone: "danger", message: error instanceof Error ? error.message : "Deployment commit failed." }); }
    finally { setBusy(false); }
  }

  return <main className="deployment-layout">
    <header className="deployment-commandbar">
      <div><span className="eyebrow">CAMPAIGN MUSTER CONTROL</span><h1>Deployment planner</h1><p>Force package, lift assignment and insertion are validated against pinned server rules.</p></div>
      <span className={`registry-mode ${mode.toLowerCase()}`}><i /> {mode === "LIVE" ? "PLANNER LIVE" : mode}</span>
      <div className="deployment-verdict"><small>PLAN STATE</small><strong>{plan?.status ?? "UNSAVED"}</strong><span>{plan?.validation.valid ? "ALL GATES SATISFIED" : `${plan?.validation.errors.length ?? 0} BLOCKERS`}</span></div>
    </header>
    {campaigns.length > 1 ? <label className="panel" style={{ padding: "1rem" }}>CAMPAIGN
      <select value={campaignId} onChange={(event) => { setCampaignId(event.target.value); setPlan(undefined); setSelected([]); }}>
        {campaigns.map((campaign) => <option key={campaign.campaignId} value={campaign.campaignId}>{campaign.name}</option>)}
      </select>
    </label> : null}
    <section className="deployment-steps panel">
      <article><b>01</b><div><strong>Force package</strong><small>Select persistent units and their locked revisions</small></div></article>
      <article><b>02</b><div><strong>Lift & capacity</strong><small>Assign rules-defined carrier manifests</small></div></article>
      <article><b>03</b><div><strong>Insertion</strong><small>Choose an open campaign zone and method</small></div></article>
    </section>
    <section className="deployment-force panel">
      <header><div><span className="eyebrow">STEP 01</span><h2>Available force</h2></div><b>{selected.length}/{units.length}</b></header>
      <div>{units.map((unit) => {
        const loadout = loadouts.get(unit.unitId);
        const checked = selected.includes(unit.unitId);
        return <label key={unit.unitId} className={checked ? "selected" : ""}><input type="checkbox" checked={checked} disabled={mode !== "LIVE" || !loadout?.validation.valid} onChange={() => setSelected((current) => checked ? current.filter((id) => id !== unit.unitId) : [...current, unit.unitId])} /><span><strong>{unit.callsign}</strong><small>{unit.name} · {unit.locationState.replaceAll("_", " ")}</small></span><b>{loadout?.validation.valid ? `v${loadout.unitVersion}/${loadout.loadout.revision}` : "BLOCKED"}</b></label>;
      })}</div>
    </section>
    <section className="deployment-lift panel">
      <header><div><span className="eyebrow">STEP 02</span><h2>Lift plan</h2></div></header>
      <label>INSERTION METHOD<select value={method} onChange={(event) => { setMethod(event.target.value as DeploymentMethodId); setCarrierId(""); }} disabled={mode !== "LIVE"}>{implementedMethods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {transportRequired ? <label>AUTHORITATIVE CARRIER<select value={carrierId} onChange={(event) => setCarrierId(event.target.value)}><option value="">Select transport…</option>{carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.callsign} · {carrier.effective.cargoProfile?.capacitySlotsQuarters ?? 0}/4 slots</option>)}</select></label> : <p>Ground deployment does not require a carrier manifest.</p>}
      <div className="lift-manifest">{selectedUnits.map(({ unit, loadout }) => <span key={unit.unitId}><Glyph name={unit.unitId === carrierId ? "ship" : "forces"} size={16} /><b>{unit.callsign}</b><small>{unit.unitId === carrierId ? "CARRIER" : loadout?.effectiveUnit?.tags.join(" · ")}</small></span>)}</div>
    </section>
    <section className="deployment-insertion panel">
      <header><div><span className="eyebrow">STEP 03</span><h2>Insertion zone</h2></div></header>
      <div className="insertion-zones">{zones.map((zone) => <button className={zoneId === zone.id ? "active" : ""} key={zone.id} onClick={() => setZoneId(zone.id)}><strong>{zone.hex.q}.{zone.hex.r}</strong><span>{zone.id.replaceAll("-", " ")}</span><small>{zone.environment.join(" · ") || "CLEAR"}</small></button>)}</div>
      {method === "PARADROP" && <p className="planner-warning">Drop hex is inserted into the submitted HAT route. Hazardous-drop deviation remains fail-closed.</p>}
    </section>
    <aside className="deployment-summary panel">
      <span className="eyebrow">AUTHORITATIVE VALIDATION</span><h2>{plan?.validation.valid ? "Ready for command" : "Deployment gates"}</h2>
      <div>{plan?.validation.errors.map((error) => <p className="blocked" key={`${error.code}:${error.entityId}`}><b>{error.code.replaceAll("_", " ")}</b>{error.message}</p>)}{plan?.validation.warnings.map((warning) => <p className="warning" key={warning.code}><b>{warning.code.replaceAll("_", " ")}</b>{warning.message}</p>)}</div>
      {!plan && <p>Select a package and ask the server to validate it.</p>}
      <button onClick={() => void save()} disabled={mode !== "LIVE" || busy || selectedUnits.length === 0 || !zoneId}>{busy ? "WORKING…" : plan ? "REVALIDATE PLAN" : "VALIDATE PLAN"}</button>
      <button className="primary" onClick={() => void commit()} disabled={mode !== "LIVE" || busy || !plan?.validation.valid || !context?.canCommit || plan.status === "COMMITTED"}>COMMIT DEPLOYMENT</button>
      <small>Commit locks each loadout, freezes ammo/cooldowns/effects, and reserves every selected unit exactly once.</small>
    </aside>
  </main>;
}
