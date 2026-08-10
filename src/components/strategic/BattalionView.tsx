import { useMemo, useState } from "react";
import type { StrategicDataMode, StrategicSnapshot } from "../../strategic/model";

interface BattalionViewProps {
  snapshot: StrategicSnapshot;
  mode: StrategicDataMode;
  onNotice: (notice: { tone: "info" | "success" | "danger"; message: string }) => void;
}

type BattalionTab = "ORGANISATION" | "MEMBERS" | "RANKS";

function initials(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "--";
}

function relativeActivity(value: number | null): string {
  if (!value) return "Activity unavailable";
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000));
  if (minutes < 1) return "Active now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function BattalionView({ snapshot, mode, onNotice }: BattalionViewProps) {
  const [tab, setTab] = useState<BattalionTab>("ORGANISATION");
  const [memberFilter, setMemberFilter] = useState("");
  const commandMembers = useMemo(
    () => snapshot.members.filter((member) => member.battlegroupIds.length === 0).slice(0, 3),
    [snapshot.members],
  );
  const filteredMembers = useMemo(() => {
    const query = memberFilter.trim().toLowerCase();
    if (!query) return snapshot.members;
    return snapshot.members.filter((member) =>
      [member.callsign, member.displayName, member.rankName, member.status].some((value) => value.toLowerCase().includes(query)),
    );
  }, [memberFilter, snapshot.members]);

  const explainDeferred = () => onNotice({
    tone: "info",
    message: mode === "SHOWCASE"
      ? "Battalion changes are disabled in the local showcase."
      : "Invite, rank, and Battalion configuration mutations remain deferred until the production identity workflow is complete.",
  });

  return (
    <div className="battalion-workspace">
      <header className="strategic-hero battalion-hero">
        <div className="battalion-insignia" aria-hidden="true">33</div>
        <div>
          <span className="eyebrow">BATTALION // {snapshot.battalion.status}</span>
          <h1>{snapshot.battalion.name}</h1>
          <p>{snapshot.battalion.description}</p>
          {snapshot.battalion.motto && <blockquote>“{snapshot.battalion.motto}”</blockquote>}
        </div>
        <dl className="battalion-self-card">
          <div><dt>YOUR CALLSIGN</dt><dd>{snapshot.profile.callsign}</dd></div>
          <div><dt>YOUR RANK</dt><dd>{snapshot.battalion.currentUserRank}</dd></div>
          <div><dt>VISIBLE PERMISSIONS</dt><dd>{snapshot.battalion.permissions.length}</dd></div>
        </dl>
      </header>

      <div className="strategic-tabbar" role="tablist" aria-label="Battalion sections">
        {(["ORGANISATION", "MEMBERS", "RANKS"] as const).map((value) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "active" : ""}
            key={value}
            onClick={() => setTab(value)}
          >{value}</button>
        ))}
        <button type="button" className="deferred-action" onClick={explainDeferred}>INVITES / CONFIGURATION · DEFERRED</button>
      </div>

      {tab === "ORGANISATION" && (
        <section className="organisation-view" role="tabpanel">
          <header className="strategic-section-heading">
            <div><span className="eyebrow">DATA-DRIVEN STRUCTURE</span><h2>Command and Battlegroups</h2></div>
            <span>{snapshot.battlegroups.length} FORMATIONS</span>
          </header>
          <div className="organisation-command-node">
            <span className="formation-symbol command">HQ</span>
            <div><small>BATTALION COMMAND</small><strong>{snapshot.battalion.name}</strong><p>{commandMembers.map((member) => `${member.rankName} ${member.callsign}`).join(" · ") || "No command assignment visible"}</p></div>
          </div>
          <div className="organisation-branches">
            {snapshot.battlegroups.map((group) => {
              const members = snapshot.members.filter((member) => member.battlegroupIds.includes(group.id));
              return (
                <article key={group.id} className="formation-card">
                  <header>
                    <span className="formation-symbol">{initials(group.callsign)}</span>
                    <div><small>BATTLEGROUP</small><h3>{group.name}</h3></div>
                    <b className={`status-chip state-${group.status.toLowerCase()}`}>{group.status.replaceAll("_", " ")}</b>
                  </header>
                  <dl>
                    <div><dt>TAC-COM / COMMANDER</dt><dd>{group.commanderCallsign ?? "UNASSIGNED"}</dd></div>
                    <div><dt>LOCATION</dt><dd>{group.currentLocation}</dd></div>
                    <div><dt>OPERATION</dt><dd>{group.currentOperation ?? "RESERVE"}</dd></div>
                    <div><dt>STRENGTH</dt><dd>{group.unitCount} UNITS · {group.memberCount} MEMBERS</dd></div>
                  </dl>
                  <div className="capability-chips" aria-label={`${group.name} capabilities`}>
                    {group.capabilities.length ? group.capabilities.map((capability) => <span key={capability}>{capability.replaceAll("_", " ")}</span>) : <span className="unknown">CAPABILITIES PENDING</span>}
                  </div>
                  <div className="formation-members">
                    {members.length ? members.map((member) => <span key={member.id}><i>{initials(member.callsign)}</i>{member.callsign}<small>{member.rankName}</small></span>) : <p>No member assignments are visible.</p>}
                  </div>
                  {group.intention && <p className="formation-intention"><b>INTENTION</b>{group.intention}</p>}
                </article>
              );
            })}
          </div>
          <p className="boundary-note"><strong>Ownership boundary:</strong> Battlegroup assignment does not transfer ownership of player units. Order delegation is explicit and is not inferred from rank or commander title.</p>
        </section>
      )}

      {tab === "MEMBERS" && (
        <section className="members-view" role="tabpanel">
          <header className="strategic-section-heading members-heading">
            <div><span className="eyebrow">ACTIVE MEMBERSHIP</span><h2>Personnel registry</h2></div>
            <label>FILTER MEMBERS<input value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)} placeholder="Callsign or rank" /></label>
          </header>
          <div className="member-table" role="table" aria-label="Battalion members">
            <div role="row" className="member-table-head"><span role="columnheader">PLAYER</span><span role="columnheader">RANK</span><span role="columnheader">FORMATION</span><span role="columnheader">STATUS</span><span role="columnheader">LAST ACTIVE</span></div>
            {filteredMembers.map((member) => {
              const groups = snapshot.battlegroups.filter((group) => member.battlegroupIds.includes(group.id));
              return (
                <div role="row" className="member-row" key={member.id}>
                  <span role="cell" className="member-identity"><i>{initials(member.callsign)}</i><b>{member.callsign}</b><small>{member.displayName}</small></span>
                  <span role="cell">{member.rankName}</span>
                  <span role="cell">{groups.map((group) => group.callsign).join(", ") || "COMMAND / UNASSIGNED"}</span>
                  <span role="cell"><b className={`status-chip state-${member.status.toLowerCase()}`}>{member.status}</b></span>
                  <span role="cell">{relativeActivity(member.lastActiveAt)}</span>
                </div>
              );
            })}
            {!filteredMembers.length && <p className="strategic-empty-copy">No members match this filter.</p>}
          </div>
          <p className="boundary-note"><strong>Privacy boundary:</strong> Public callsigns and profile names are shown. Email addresses and authentication-provider identifiers are never part of this view.</p>
        </section>
      )}

      {tab === "RANKS" && (
        <section className="ranks-view" role="tabpanel">
          <header className="strategic-section-heading">
            <div><span className="eyebrow">RANK → PERMISSIONS</span><h2>Authority matrix</h2></div>
            <span>{snapshot.ranks.length} CONFIGURED RANKS</span>
          </header>
          <div className="rank-grid">
            {snapshot.ranks.map((rank, index) => (
              <article key={rank.id}>
                <header><b>{String(index + 1).padStart(2, "0")}</b><div><small>PRECEDENCE {rank.precedence}</small><h3>{rank.name}</h3></div><span>{rank.memberCount} MEMBERS</span></header>
                <div className="permission-list">
                  {rank.permissions.length ? rank.permissions.map((permission) => <span key={permission}>{permission.replaceAll("_", " ")}</span>) : <p>No permissions assigned.</p>}
                </div>
              </article>
            ))}
          </div>
          <p className="boundary-note"><strong>Server authority:</strong> Rank names are presentation only. The Worker validates exact permission keys and explicit delegation for every protected action.</p>
        </section>
      )}
    </div>
  );
}
