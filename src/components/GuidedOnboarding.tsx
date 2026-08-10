import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type {
  AuthUserDto,
  BattalionAccessPolicy,
  BattalionDirectoryEntryDto,
  OnboardingStatusDto,
} from "../../packages/domain/src";
import brandMark from "../../app/static/img/brand-icon.gif";

type BattalionMode = "DIRECTORY" | "CODE" | "CREATE";

const tourStops = [
  { key: "COMMAND", title: "Command", copy: "Your operational summary: current Battalion, primary ship, forces, operations, and actionable warnings." },
  { key: "GALACTIC", title: "Galactic", copy: "The strategic map connects locations, Task Forces, Battlegroups, and operations without inventing unpublished travel costs." },
  { key: "BATTALION", title: "Battalion", copy: "Organisation, members, ranks, permissions, recruitment, and persistent formations live here." },
  { key: "SHIP", title: "Ship", copy: "Inspect the Battalion flagship, installed modules, cargo, facilities, and strategic supply." },
  { key: "FORCES", title: "Forces", copy: "Your named units retain equipment, damage, service history, status effects, and location between campaigns." },
  { key: "DEPLOYMENT", title: "Deployment", copy: "Server-authoritative readiness checks validate lift, locations, equipment, and campaign permission." },
  { key: "CAMPAIGNS", title: "Campaigns", copy: "Plan simultaneous tactical orders on the battlefield; unsupported rules remain visibly blocked." },
] as const;

function commandId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string } };
    return payload.error?.message ?? `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

async function post(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<Record<string, unknown>>;
}

function BattalionCard({ battalion, busy, onJoin }: { battalion: BattalionDirectoryEntryDto; busy: boolean; onJoin: () => void }) {
  return (
    <article className="onboarding-battalion-card">
      <header>
        <span className={`onboarding-battalion-mark ${battalion.recruitmentKind.toLowerCase()}`}>{battalion.shortName?.slice(0, 3) || "BTN"}</span>
        <div><small>{battalion.recruitmentKind === "NPC" ? "SYSTEM BATTALION" : "PUBLIC BATTALION"}</small><h3>{battalion.name}</h3></div>
        <b>{battalion.openSpots} OPEN</b>
      </header>
      <p>{battalion.description}</p>
      <dl>
        <div><dt>CURRENT ENGAGEMENT</dt><dd>{battalion.engagementSummary}</dd></div>
        <div><dt>ACTIVE COMMANDERS</dt><dd>{battalion.memberCount} / {battalion.memberCapacity}</dd></div>
      </dl>
      {battalion.motto && <blockquote>“{battalion.motto}”</blockquote>}
      <button type="button" className="primary" disabled={busy || battalion.openSpots < 1} onClick={onJoin}>JOIN BATTALION</button>
    </article>
  );
}

export function GuidedOnboarding({ user, demo, children }: { user: AuthUserDto; demo: boolean; children: ReactNode }) {
  const retryCommands = useRef(new Map<string, { fingerprint: string; commandId: string }>());
  const [status, setStatus] = useState<OnboardingStatusDto>();
  const [loading, setLoading] = useState(!demo);
  const [loadError, setLoadError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [battalionMode, setBattalionMode] = useState<BattalionMode>(() => new URLSearchParams(window.location.search).has("invite") ? "CODE" : "DIRECTORY");
  const [inviteCode, setInviteCode] = useState(() => new URLSearchParams(window.location.search).get("invite") ?? "");
  const [battalionName, setBattalionName] = useState("");
  const [shortName, setShortName] = useState("");
  const [description, setDescription] = useState("");
  const [motto, setMotto] = useState("");
  const [accessPolicy, setAccessPolicy] = useState<BattalionAccessPolicy>("PRIVATE");
  const [engagement, setEngagement] = useState("");
  const [starterClass, setStarterClass] = useState<string>();
  const [unitName, setUnitName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [tourIndex, setTourIndex] = useState(0);

  function retryableCommand(key: string, payload: Record<string, unknown>): string {
    const fingerprint = JSON.stringify(payload);
    const existing = retryCommands.current.get(key);
    if (existing?.fingerprint === fingerprint) return existing.commandId;
    const next = { fingerprint, commandId: commandId(key.slice(0, 32)) };
    retryCommands.current.set(key, next);
    return next.commandId;
  }
  const [createdInviteCode, setCreatedInviteCode] = useState<string>();

  const load = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    setLoadError(undefined);
    try {
      const response = await fetch("/api/onboarding");
      if (!response.ok) throw new Error(await responseError(response));
      setStatus(await response.json() as OnboardingStatusDto);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Guided enlistment could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [demo]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function mutate(action: () => Promise<Record<string, unknown>>, success?: string) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await action();
      if (typeof result.inviteCode === "string") setCreatedInviteCode(result.inviteCode);
      if (success) setNotice(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The command could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function joinPublic(battalionId: string) {
    const payload = { battalionId };
    await mutate(() => post("/api/onboarding/battalions/join", { commandId: retryableCommand("join-battalion", payload), ...payload }), "Battalion assignment confirmed.");
  }

  async function joinByCode(event: FormEvent) {
    event.preventDefault();
    const payload = { inviteCode };
    await mutate(() => post("/api/onboarding/battalions/join", { commandId: retryableCommand("join-code", payload), ...payload }), "Private Battalion assignment confirmed.");
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: battalionName,
      shortName: shortName || undefined,
      description,
      motto,
      accessPolicy,
      engagementSummary: engagement,
    };
    await mutate(() => post("/api/onboarding/battalions", {
      commandId: retryableCommand("create-battalion", payload), ...payload,
    }), "Battalion charter commissioned.");
  }

  async function respond(invitationId: string, decision: "ACCEPT" | "DECLINE") {
    const payload = { invitationId, decision };
    await mutate(() => post("/api/onboarding/battalions/invites/respond", {
      commandId: retryableCommand(`respond-invite:${invitationId}`, payload), ...payload,
    }), decision === "ACCEPT" ? "Battalion assignment confirmed." : "Invitation declined.");
  }

  async function createStarter(event: FormEvent) {
    event.preventDefault();
    const definitionId = starterClass ?? status?.starterUnits[0]?.definitionId;
    if (!definitionId) return;
    const payload = { definitionId, name: unitName, callsign };
    await mutate(() => post("/api/onboarding/starter-unit", {
      commandId: retryableCommand("starter-unit", payload), ...payload,
    }), "Your first persistent unit has joined the force.");
  }

  async function finish() {
    if (!status?.progressRevision) return;
    setBusy(true);
    setError(undefined);
    try {
      const payload = { expectedRevision: status.progressRevision };
      await post("/api/onboarding/complete", {
        commandId: retryableCommand("complete-onboarding", payload), ...payload,
      });
      window.location.assign("/?view=command");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Onboarding could not be completed.");
      setBusy(false);
    }
  }

  if (demo) return children;
  if (loading) return <main className="auth-loading" aria-busy="true"><img src={brandMark} alt="" /><p>LOADING BATTALION ASSIGNMENT…</p></main>;
  if (loadError) return <main className="onboarding-error"><img src={brandMark} alt="" /><h1>Assignment link unavailable</h1><p>{loadError}</p><button className="primary" onClick={() => void load()}>RETRY</button></main>;
  if (!status?.required) return children;

  const stepNumber = status.step === "BATTALION" ? 1 : status.step === "UNIT" ? 2 : 3;
  const chosenStarter = starterClass ?? status.starterUnits[0]?.definitionId;

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header">
        <div className="onboarding-brand"><img src={brandMark} alt="" /><span><small>GUIDED ENLISTMENT</small><strong>CORINTH'S PLIGHT</strong></span></div>
        <div><small>COMMANDER</small><strong>{user.displayName}</strong></div>
      </header>
      <nav className="onboarding-progress" aria-label="Enlistment progress">
        {[[1, "Battalion"], [2, "First unit"], [3, "Command tour"]].map(([number, label]) => (
          <span key={String(label)} className={stepNumber === number ? "active" : stepNumber > Number(number) ? "complete" : ""}><b>{stepNumber > Number(number) ? "✓" : number}</b>{label}</span>
        ))}
      </nav>
      {error && <div className="onboarding-alert danger" role="alert">{error}</div>}
      {notice && <div className="onboarding-alert success" role="status">{notice}</div>}

      {status.step === "BATTALION" && (
        <section className="onboarding-stage">
          <header className="onboarding-stage-heading"><span className="eyebrow">STEP 01 // CHOOSE YOUR COMMAND</span><h1>Join the war with a Battalion.</h1><p>Join an open formation, use a private assignment code, or spend your one command charter to create a Battalion.</p></header>
          {status.invitations.length > 0 && <div className="onboarding-invites"><h2>Pending assignments</h2>{status.invitations.map((item) => <article key={item.invitationId}><div><small>{item.source} INVITATION</small><strong>{item.battalionName}</strong><p>{item.invitedBy}{item.message ? ` · ${item.message}` : ""}</p></div><button disabled={busy} className="primary" onClick={() => void respond(item.invitationId, "ACCEPT")}>ACCEPT</button><button disabled={busy} onClick={() => void respond(item.invitationId, "DECLINE")}>DECLINE</button></article>)}</div>}
          <div className="onboarding-mode-tabs" aria-label="Battalion assignment method">
            <button aria-pressed={battalionMode === "DIRECTORY"} className={battalionMode === "DIRECTORY" ? "active" : ""} onClick={() => setBattalionMode("DIRECTORY")}>OPEN BATTALIONS</button>
            <button aria-pressed={battalionMode === "CODE"} className={battalionMode === "CODE" ? "active" : ""} onClick={() => setBattalionMode("CODE")}>INVITE CODE</button>
            <button aria-pressed={battalionMode === "CREATE"} className={battalionMode === "CREATE" ? "active" : ""} onClick={() => setBattalionMode("CREATE")}>CREATE BATTALION</button>
          </div>
          {battalionMode === "DIRECTORY" && <div className="onboarding-battalion-grid">{status.publicBattalions.map((item) => <BattalionCard key={item.battalionId} battalion={item} busy={busy} onJoin={() => void joinPublic(item.battalionId)} />)}</div>}
          {battalionMode === "CODE" && <form className="onboarding-form compact" onSubmit={joinByCode}><span className="eyebrow">PRIVATE ASSIGNMENT</span><h2>Enter an invite code</h2><p>Codes are checked only by the server and do not reveal private Battalions when invalid.</p><label htmlFor="invite-code">INVITE CODE</label><input id="invite-code" value={inviteCode} minLength={8} maxLength={64} required onChange={(event) => setInviteCode(event.target.value.toUpperCase())} /><button className="primary" disabled={busy}>JOIN WITH CODE</button></form>}
          {battalionMode === "CREATE" && <form className="onboarding-form" onSubmit={create}><header><div><span className="eyebrow">COMMAND CHARTER</span><h2>Create a Battalion</h2></div><dl><div><dt>BALANCE</dt><dd>{status.charter.balance} REQ</dd></div><div><dt>CHARTER COST</dt><dd>{status.charter.creationCost} REQ</dd></div></dl></header><label htmlFor="battalion-name">BATTALION NAME</label><input id="battalion-name" required minLength={3} maxLength={80} value={battalionName} onChange={(event) => setBattalionName(event.target.value)} /><label htmlFor="battalion-short">SHORT NAME <small>OPTIONAL</small></label><input id="battalion-short" maxLength={8} value={shortName} onChange={(event) => setShortName(event.target.value.toUpperCase())} /><label htmlFor="battalion-description">DESCRIPTION</label><textarea id="battalion-description" required minLength={10} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /><label htmlFor="battalion-motto">MOTTO <small>OPTIONAL</small></label><input id="battalion-motto" maxLength={120} value={motto} onChange={(event) => setMotto(event.target.value)} /><fieldset><legend>RECRUITMENT</legend><label><input type="radio" name="access" checked={accessPolicy === "PRIVATE"} onChange={() => setAccessPolicy("PRIVATE")} /> PRIVATE · INVITE ONLY</label><label><input type="radio" name="access" checked={accessPolicy === "PUBLIC"} onChange={() => setAccessPolicy("PUBLIC")} /> PUBLIC · OPEN JOIN</label></fieldset><label htmlFor="engagement">CURRENT ENGAGEMENT {accessPolicy === "PRIVATE" && <small>OPTIONAL</small>}</label><input id="engagement" required={accessPolicy === "PUBLIC"} minLength={accessPolicy === "PUBLIC" ? 5 : undefined} maxLength={180} value={engagement} onChange={(event) => setEngagement(event.target.value)} placeholder="Where is this Battalion currently committed?" /><p className="boundary-note">The charter fee is application anti-spam policy. It does not publish a V5 unit price.</p><button className="primary" disabled={busy || !status.charter.canCreate}>{status.charter.alreadyUsed ? "CHARTER ALREADY USED" : "COMMISSION BATTALION · 100 REQ"}</button></form>}
        </section>
      )}

      {status.step === "UNIT" && (
        <section className="onboarding-stage">
          <header className="onboarding-stage-heading"><span className="eyebrow">STEP 02 // UNIT IDENTITY</span><h1>Name your first persistent unit.</h1><p>This one-time grant does not invent a class price. Its value remains marked balance-required until the rules publish one.</p></header>
          {createdInviteCode && <div className="onboarding-charter-code"><div><small>PRIVATE BATTALION CODE · SHOWN ONCE</small><strong>{createdInviteCode}</strong></div><button onClick={() => void navigator.clipboard.writeText(createdInviteCode)}>COPY CODE</button></div>}
          <form className="onboarding-unit-form" onSubmit={createStarter}>
            <div className="onboarding-starter-grid">{status.starterUnits.map((item) => <label key={item.definitionId} className={chosenStarter === item.definitionId ? "selected" : ""}><input type="radio" name="starter-class" value={item.definitionId} checked={chosenStarter === item.definitionId} onChange={() => setStarterClass(item.definitionId)} /><header><span>{item.category}</span><b>{item.name}</b></header><p>{item.summary}</p><dl><div><dt>{item.healthModel === "HITS" ? "HITS" : "FS"}</dt><dd>{item.maximumHealth}</dd></div><div><dt>ARMOUR</dt><dd>{item.armor}</dd></div><div><dt>SPEED</dt><dd>{item.speed}</dd></div></dl></label>)}</div>
            <div className="onboarding-unit-identity"><label htmlFor="unit-name">UNIT NAME</label><input id="unit-name" required minLength={2} maxLength={80} value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="e.g. First Light" /><label htmlFor="unit-callsign">CALLSIGN</label><input id="unit-callsign" required maxLength={7} pattern="[A-Z0-9][A-Z0-9-]{0,6}" value={callsign} onChange={(event) => setCallsign(event.target.value.toUpperCase())} placeholder="ROOK-1" /><button className="primary" disabled={busy || !chosenStarter}>CREATE FIRST UNIT</button></div>
          </form>
        </section>
      )}

      {status.step === "TOUR" && (
        <section className="onboarding-stage tour-stage">
          <header className="onboarding-stage-heading"><span className="eyebrow">STEP 03 // COMMAND ORIENTATION</span><h1>One war. Three scales of command.</h1><p>Move through the operational surfaces before entering the live interface.</p></header>
          <div className="onboarding-tour">
            <nav aria-label="Command interface tour">{tourStops.map((stop, index) => <button key={stop.key} className={tourIndex === index ? "active" : tourIndex > index ? "complete" : ""} onClick={() => setTourIndex(index)}><b>{String(index + 1).padStart(2, "0")}</b>{stop.title}</button>)}</nav>
            <article><span className="tour-watermark">{tourStops[tourIndex].key.slice(0, 2)}</span><small>INTERFACE SURFACE {String(tourIndex + 1).padStart(2, "0")}</small><h2>{tourStops[tourIndex].title}</h2><p>{tourStops[tourIndex].copy}</p><div className="tour-rule"><b>SERVER AUTHORITY</b><span>{tourIndex === 4 ? "Names and history persist; price, eligibility, loadout, and readiness are never client-authored." : "The interface projects authoritative state. Disabled or unresolved mechanics remain visibly blocked."}</span></div><footer>{tourIndex < tourStops.length - 1 ? <button className="primary" onClick={() => setTourIndex((value) => value + 1)}>NEXT SURFACE</button> : <button className="primary" disabled={busy} onClick={() => void finish()}>ENTER COMMAND INTERFACE</button>}<span>{tourIndex + 1} / {tourStops.length}</span></footer></article>
          </div>
        </section>
      )}
    </main>
  );
}
