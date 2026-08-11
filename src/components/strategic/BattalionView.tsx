import { useMemo, useState } from "react";
import type { BattalionMemberView, RankView, StrategicDataMode, StrategicSnapshot } from "../../strategic/model";
import { BattalionRecruitmentPanel } from "../BattalionRecruitmentPanel";

const DEMO_HEADERS = import.meta.env.DEV ? { "x-demo-user": "demo-user" } : undefined;
const JSON_HEADERS = { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) };

interface BattalionViewProps {
  snapshot: StrategicSnapshot;
  mode: StrategicDataMode;
  onNotice: (notice: { tone: "info" | "success" | "danger"; message: string }) => void;
}

type BattalionTab = "ORGANISATION" | "MEMBERS" | "RANKS" | "RECRUITMENT";

interface RankDraft {
  id?: string;
  version?: number;
  name: string;
  sortOrder: number;
  permissions: string[];
}

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
  const [confirmRemovalId, setConfirmRemovalId] = useState<string>();
  const [confirmRankDeleteId, setConfirmRankDeleteId] = useState<string>();
  const [memberMutationBusy, setMemberMutationBusy] = useState(false);
  const [rankMutationBusy, setRankMutationBusy] = useState(false);
  const [memberRankDrafts, setMemberRankDrafts] = useState<Record<string, string>>({});
  const [rankDraft, setRankDraft] = useState<RankDraft>({
    name: "",
    sortOrder: Math.max(0, ...snapshot.ranks.map((rank) => rank.precedence)) + 1,
    permissions: [],
  });
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

  const canRemoveMembers = mode === "LIVE" && snapshot.battalion.permissions.includes("MEMBER_REMOVE");
  const canManageRanks = mode === "LIVE" && snapshot.battalion.permissions.includes("RANK_MANAGE");
  const hasMemberAdministration = canRemoveMembers || canManageRanks;

  async function mutation(path: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = await response.json() as { error?: { message?: string } };
      throw new Error(payload.error?.message ?? `Battalion command failed (${response.status}).`);
    }
  }

  async function removeMember(member: BattalionMemberView) {
    if (confirmRemovalId !== member.userId) {
      setConfirmRemovalId(member.userId);
      onNotice({ tone: "info", message: `Confirm removal of ${member.callsign}. Operational assignments must be cleared first.` });
      return;
    }
    setMemberMutationBusy(true);
    try {
      await mutation("/api/onboarding/battalions/members/remove", {
        commandId: `remove-member-${crypto.randomUUID()}`,
        targetUserId: member.userId,
        expectedMembershipRevision: member.membershipRevision,
      });
      onNotice({ tone: "success", message: `${member.callsign} was removed from the Battalion.` });
      window.location.reload();
    } catch (caught) {
      onNotice({ tone: "danger", message: caught instanceof Error ? caught.message : "Member removal failed." });
      setConfirmRemovalId(undefined);
    } finally {
      setMemberMutationBusy(false);
    }
  }

  function editRank(rank?: RankView) {
    setConfirmRankDeleteId(undefined);
    setRankDraft(rank ? {
      id: rank.id,
      version: rank.version,
      name: rank.name,
      sortOrder: rank.precedence,
      permissions: [...rank.permissions],
    } : {
      name: "",
      sortOrder: Math.max(0, ...snapshot.ranks.map((item) => item.precedence)) + 1,
      permissions: [],
    });
  }

  function toggleRankPermission(permission: string) {
    setRankDraft((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission].sort(),
    }));
  }

  async function saveRank() {
    setRankMutationBusy(true);
    try {
      const commandId = `rank-save-${crypto.randomUUID()}`;
      const common = {
        commandId,
        name: rankDraft.name,
        sortOrder: rankDraft.sortOrder,
        permissions: rankDraft.permissions,
      };
      await mutation(
        rankDraft.id ? `/api/battalions/current/ranks/${rankDraft.id}/update` : "/api/battalions/current/ranks",
        rankDraft.id ? { ...common, expectedVersion: rankDraft.version } : common,
      );
      onNotice({ tone: "success", message: rankDraft.id ? "Rank authority updated." : "Rank created." });
      window.location.reload();
    } catch (caught) {
      onNotice({ tone: "danger", message: caught instanceof Error ? caught.message : "Rank update failed." });
    } finally {
      setRankMutationBusy(false);
    }
  }

  async function deleteRank(rank: RankView) {
    if (confirmRankDeleteId !== rank.id) {
      setConfirmRankDeleteId(rank.id);
      onNotice({ tone: "info", message: `Confirm deletion of ${rank.name}. Only unused ranks can be deleted.` });
      return;
    }
    setRankMutationBusy(true);
    try {
      await mutation(`/api/battalions/current/ranks/${rank.id}/delete`, {
        commandId: `rank-delete-${crypto.randomUUID()}`,
        expectedVersion: rank.version,
      });
      onNotice({ tone: "success", message: `${rank.name} was deleted.` });
      window.location.reload();
    } catch (caught) {
      onNotice({ tone: "danger", message: caught instanceof Error ? caught.message : "Rank deletion failed." });
      setConfirmRankDeleteId(undefined);
    } finally {
      setRankMutationBusy(false);
    }
  }

  async function assignMemberRank(member: BattalionMemberView) {
    const rank = snapshot.ranks.find((item) => item.id === (memberRankDrafts[member.userId] ?? member.rankId));
    if (!rank || rank.id === member.rankId) return;
    setMemberMutationBusy(true);
    try {
      await mutation("/api/battalions/current/members/rank", {
        commandId: `member-rank-${crypto.randomUUID()}`,
        targetUserId: member.userId,
        rankId: rank.id,
        expectedMembershipRevision: member.membershipRevision,
        expectedRankVersion: rank.version,
      });
      onNotice({ tone: "success", message: `${member.callsign} was assigned ${rank.name}.` });
      window.location.reload();
    } catch (caught) {
      onNotice({ tone: "danger", message: caught instanceof Error ? caught.message : "Rank assignment failed." });
    } finally {
      setMemberMutationBusy(false);
    }
  }

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
        {(["ORGANISATION", "MEMBERS", "RANKS", "RECRUITMENT"] as const).map((value) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "active" : ""}
            key={value}
            onClick={() => setTab(value)}
          >{value}</button>
        ))}
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
          <div className={`member-table ${hasMemberAdministration ? "has-administration" : ""}`} role="table" aria-label="Battalion members">
            <div role="row" className="member-table-head"><span role="columnheader">PLAYER</span><span role="columnheader">RANK</span><span role="columnheader">FORMATION</span><span role="columnheader">STATUS</span><span role="columnheader">LAST ACTIVE</span>{hasMemberAdministration && <span role="columnheader">ADMIN</span>}</div>
            {filteredMembers.map((member) => {
              const groups = snapshot.battlegroups.filter((group) => member.battlegroupIds.includes(group.id));
              return (
                <div role="row" className="member-row" key={member.id}>
                  <span role="cell" className="member-identity"><i>{initials(member.callsign)}</i><b>{member.callsign}</b><small>{member.displayName}</small></span>
                  <span role="cell" className="member-rank-cell">
                    {canManageRanks && member.status === "ACTIVE"
                      ? <select aria-label={`Rank for ${member.callsign}`} value={memberRankDrafts[member.userId] ?? member.rankId} onChange={(event) => setMemberRankDrafts((current) => ({ ...current, [member.userId]: event.target.value }))}>{snapshot.ranks.map((rank) => <option key={rank.id} value={rank.id}>{rank.name}</option>)}</select>
                      : member.rankName}
                  </span>
                  <span role="cell">{groups.map((group) => group.callsign).join(", ") || "COMMAND / UNASSIGNED"}</span>
                  <span role="cell"><b className={`status-chip state-${member.status.toLowerCase()}`}>{member.status}</b></span>
                  <span role="cell">{relativeActivity(member.lastActiveAt)}</span>
                  {hasMemberAdministration && <span role="cell" className="member-action-cell">
                    {canManageRanks && member.status === "ACTIVE" && (memberRankDrafts[member.userId] ?? member.rankId) !== member.rankId
                      && <button disabled={memberMutationBusy} onClick={() => void assignMemberRank(member)}>ASSIGN RANK</button>}
                    {canRemoveMembers && member.userId !== snapshot.profile.userId && member.commandRole === "PLAYER" && member.status === "ACTIVE"
                      ? <button className={confirmRemovalId === member.userId ? "danger" : ""} disabled={memberMutationBusy} onClick={() => void removeMember(member)}>{confirmRemovalId === member.userId ? "CONFIRM REMOVE" : "REMOVE"}</button>
                      : canRemoveMembers && <small>MEMBERSHIP PROTECTED</small>}
                  </span>}
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
            {canManageRanks ? <button className="primary" onClick={() => editRank()}>CREATE RANK</button> : <span>{snapshot.ranks.length} CONFIGURED RANKS</span>}
          </header>
          {canManageRanks && (
            <section className="rank-editor" aria-label="Rank editor">
              <header><div><span className="eyebrow">SERVER-AUTHORITATIVE ROLE</span><h3>{rankDraft.id ? `Edit ${rankDraft.name}` : "Create rank"}</h3></div>{rankDraft.id && <button onClick={() => editRank()}>CANCEL EDIT</button>}</header>
              <div className="rank-editor-fields">
                <label>RANK NAME<input value={rankDraft.name} maxLength={48} onChange={(event) => setRankDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                <label>ORDER<input type="number" min={1} max={999} value={rankDraft.sortOrder} onChange={(event) => setRankDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))} /></label>
              </div>
              <fieldset><legend>ACTIVE GAMEPLAY PERMISSIONS</legend><div className="rank-permission-grid">{snapshot.permissionDefinitions.map((definition) => <label key={definition.permission}><input type="checkbox" checked={rankDraft.permissions.includes(definition.permission)} onChange={() => toggleRankPermission(definition.permission)} /><span><b>{definition.permission.replaceAll("_", " ")}</b><small>{definition.description}</small></span></label>)}</div></fieldset>
              <button className="primary" disabled={rankMutationBusy || rankDraft.name.trim().length < 2} onClick={() => void saveRank()}>{rankMutationBusy ? "SAVING…" : rankDraft.id ? "SAVE RANK" : "CREATE RANK"}</button>
            </section>
          )}
          <div className="rank-grid">
            {snapshot.ranks.map((rank, index) => (
              <article key={rank.id}>
                <header><b>{String(index + 1).padStart(2, "0")}</b><div><small>PRECEDENCE {rank.precedence} · REV {rank.version}</small><h3>{rank.name}</h3></div><span>{rank.memberCount} MEMBERS</span></header>
                <div className="permission-list">
                  {rank.permissions.length ? rank.permissions.map((permission) => <span key={permission}>{permission.replaceAll("_", " ")}</span>) : <p>No permissions assigned.</p>}
                </div>
                {canManageRanks && <footer><button onClick={() => editRank(rank)}>EDIT</button><button className={confirmRankDeleteId === rank.id ? "danger" : ""} disabled={rankMutationBusy || rank.memberCount > 0} onClick={() => void deleteRank(rank)}>{rank.memberCount > 0 ? "IN USE" : confirmRankDeleteId === rank.id ? "CONFIRM DELETE" : "DELETE"}</button></footer>}
              </article>
            ))}
          </div>
          <p className="boundary-note"><strong>Server authority:</strong> Rank names are presentation only. The Worker validates exact permission keys and explicit delegation for every protected action.</p>
        </section>
      )}

      {tab === "RECRUITMENT" && <BattalionRecruitmentPanel />}
    </div>
  );
}
