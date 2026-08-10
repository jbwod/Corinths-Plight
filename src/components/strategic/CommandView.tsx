import { useEffect, useState } from "react";
import type { StrategicDataMode, StrategicSnapshot } from "../../strategic/model";
import type { StrategicView } from "../StrategicWorkspace";

interface CommandViewProps {
  snapshot: StrategicSnapshot;
  mode: StrategicDataMode;
  onNavigate: (view: StrategicView | "Forces" | "Campaigns") => void;
}

function countdown(target: number | null, now: number): string {
  if (target === null) return "MANUAL";
  const totalMinutes = Math.max(0, Math.ceil((target - now) / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}D ${hours}H`;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formattedTime(value: number): string {
  if (!value) return "Time unavailable";
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function CommandView({ snapshot, mode, onNavigate }: CommandViewProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeOperation = snapshot.operations.find((operation) => operation.status === "ACTIVE") ?? snapshot.operations[0];
  const awaitingOrders = snapshot.battlegroups.filter((group) => ["READY", "FORMING", "EMBARKED"].includes(group.status)).length;
  const canViewShip = mode !== "LIVE" || snapshot.battalion.permissions.includes("SHIP_VIEW");

  return (
    <div className="command-dashboard">
      <header className="strategic-hero command-hero">
        <div>
          <span className="eyebrow">COMMAND // {snapshot.battalion.shortName}</span>
          <h1>Welcome back, {snapshot.profile.callsign}</h1>
          <p>
            {snapshot.profile.rankName} · {snapshot.battalion.name}. Your persistent forces, shared ship, and current
            theatre are shown from one operational context.
          </p>
        </div>
        <div className="strategic-clock-card">
          <span>STRATEGIC ROUND</span>
          <strong>{snapshot.clock.round || "—"}</strong>
          <small>{snapshot.clock.mode === "PAUSED" ? "CLOCK PAUSED" : `NEXT TICK ${countdown(snapshot.clock.nextTickAt, now)}`}</small>
        </div>
      </header>

      <section className="command-context-grid" aria-label="Current command context">
        <article className="context-card ship-context">
          <header><span className="eyebrow">BATTALION SHIP</span>{canViewShip && <b className={`status-chip state-${snapshot.ship.status.toLowerCase()}`}>{snapshot.ship.status.replaceAll("_", " ")}</b>}</header>
          {canViewShip ? <>
            <h2>{snapshot.ship.name}</h2>
            <p>{snapshot.ship.className}-class · {snapshot.ship.registry}</p>
            <dl>
              <div><dt>LOCATION</dt><dd>{snapshot.ship.location}</dd></div>
              <div><dt>TASK FORCE</dt><dd>{snapshot.ship.taskForce.name}</dd></div>
              <div><dt>LARGE SUPPLY</dt><dd>{snapshot.ship.supply.largeCurrent ?? "—"} / {snapshot.ship.supply.largeCapacity ?? "—"}</dd></div>
            </dl>
            <button type="button" onClick={() => onNavigate("Ship")}>OPEN SHIP HOME</button>
          </> : <>
            <h2>Ship records restricted</h2>
            <p>Your active rank does not include SHIP_VIEW.</p>
            <div className="restricted-context-copy">The server has withheld ship, cargo, supply, module, and embarked-unit projections.</div>
            <button type="button" onClick={() => onNavigate("Ship")}>VIEW ACCESS REQUIREMENT</button>
          </>}
        </article>

        <article className="context-card operation-context">
          <header><span className="eyebrow">ACTIVE OPERATION</span>{activeOperation && <b className={`status-chip state-${activeOperation.status.toLowerCase()}`}>{activeOperation.status}</b>}</header>
          {activeOperation ? (
            <>
              <h2>{activeOperation.name}</h2>
              <p>{activeOperation.location} · {activeOperation.role}</p>
              <dl>
                <div><dt>TACTICAL ROUND</dt><dd>{activeOperation.tacticalRound ?? "NOT STARTED"}</dd></div>
                <div><dt>DEPLOYED</dt><dd>{activeOperation.assignedBattlegroups.join(", ") || "UNASSIGNED"}</dd></div>
                <div><dt>REINFORCEMENT</dt><dd>{activeOperation.reinforcementState.replaceAll("_", " ")}</dd></div>
              </dl>
              <button type="button" onClick={() => onNavigate("Galactic")}>VIEW OPERATIONS BOARD</button>
            </>
          ) : <p className="strategic-empty-copy">No operation is visible to this Battalion.</p>}
        </article>

        <article className="context-card taskforce-context">
          <header><span className="eyebrow">STRATEGIC INTENTION</span><b className="status-chip">{snapshot.ship.taskForce.status.replaceAll("_", " ")}</b></header>
          <h2>{snapshot.ship.taskForce.name}</h2>
          <p>{snapshot.ship.taskForce.intention ?? "No current intention has been published."}</p>
          <dl>
            <div><dt>CURRENT</dt><dd>{snapshot.ship.taskForce.location}</dd></div>
            <div><dt>FORMATION</dt><dd>TASK FORCE · ORBITAL / AEROSPACE</dd></div>
            <div><dt>GROUND ELEMENTS</dt><dd>{snapshot.battlegroups.length} BATTLEGROUPS</dd></div>
          </dl>
          <button type="button" onClick={() => onNavigate("Galactic")}>OPEN GALACTIC OPERATIONS</button>
        </article>
      </section>

      <section className="command-lower-grid">
        <article className="command-forces panel-frame">
          <header className="strategic-section-heading">
            <div><span className="eyebrow">YOUR FORCES</span><h2>Persistent force state</h2></div>
            <button type="button" onClick={() => onNavigate("Forces")}>OPEN REGISTRY</button>
          </header>
          <div className="command-metric-grid">
            <span><b>{snapshot.forces.active}</b><small>ACTIVE</small></span>
            <span><b>{snapshot.forces.deployed}</b><small>DEPLOYED</small></span>
            <span><b>{snapshot.forces.aboard}</b><small>ABOARD SHIP</small></span>
            <span><b>{snapshot.forces.available}</b><small>AVAILABLE</small></span>
            <span className="lost"><b>{snapshot.forces.lost}</b><small>LOST</small></span>
          </div>
          <div className="command-readiness-note">
            <i />
            <p><strong>{awaitingOrders} formation{awaitingOrders === 1 ? "" : "s"} awaiting strategic direction.</strong> Eligibility, route duration, transport capacity, and supply consequences remain server-authoritative.</p>
          </div>
        </article>

        <article className="command-activity panel-frame">
          <header className="strategic-section-heading">
            <div><span className="eyebrow">BATTALION ACTIVITY</span><h2>War record</h2></div>
            <button type="button" onClick={() => onNavigate("Battalion")}>BATTALION</button>
          </header>
          <div className="activity-feed">
            {snapshot.activity.length ? snapshot.activity.slice(0, 4).map((event) => (
              <div key={event.id}>
                <time dateTime={event.occurredAt ? new Date(event.occurredAt).toISOString() : undefined}>{formattedTime(event.occurredAt)}</time>
                <span><strong>{event.type.replaceAll("_", " ")}</strong>{event.summary}</span>
              </div>
            )) : <p className="strategic-empty-copy">No audience-safe strategic activity is available.</p>}
          </div>
        </article>
      </section>

      {mode === "SHOWCASE" && (
        <p className="showcase-footnote">
          Showcase values reproduce the Phase 3 Corinth fixture and examples. They are not a client-side rules source and cannot be changed here.
        </p>
      )}
    </div>
  );
}
