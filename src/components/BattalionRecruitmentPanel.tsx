import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { BattalionAccessPolicy, OnboardingStatusDto } from "../../packages/domain/src";

const DEMO_HEADERS = import.meta.env.DEV ? { "x-demo-user": "demo-user" } : undefined;
const JSON_HEADERS = { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) };

function commandId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string } };
    return payload.error?.message ?? `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

export function BattalionRecruitmentPanel() {
  const retryCommands = useRef(new Map<string, { fingerprint: string; commandId: string }>());
  const [status, setStatus] = useState<OnboardingStatusDto>();
  const [accessPolicy, setAccessPolicy] = useState<BattalionAccessPolicy>("PRIVATE");
  const [joinEnabled, setJoinEnabled] = useState(true);
  const [engagementSummary, setEngagementSummary] = useState("");
  const [targetType, setTargetType] = useState<"USERNAME" | "EMAIL">("USERNAME");
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const [assignmentCode, setAssignmentCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string }>();

  function retryableCommand(key: string, payload: Record<string, unknown>): string {
    const fingerprint = JSON.stringify(payload);
    const existing = retryCommands.current.get(key);
    if (existing?.fingerprint === fingerprint) return existing.commandId;
    const next = { fingerprint, commandId: commandId(key.slice(0, 32)) };
    retryCommands.current.set(key, next);
    return next.commandId;
  }

  const load = useCallback(async () => {
    const response = await fetch("/api/onboarding", { headers: DEMO_HEADERS });
    if (!response.ok) throw new Error(await errorMessage(response));
    const next = await response.json() as OnboardingStatusDto;
    setLoadError(undefined);
    setStatus(next);
    if (next.activeBattalion) {
      setAccessPolicy(next.activeBattalion.accessPolicy);
      setJoinEnabled(next.activeBattalion.joinEnabled);
      setEngagementSummary(next.activeBattalion.engagementSummary);
    }
  }, [setAccessPolicy, setEngagementSummary, setJoinEnabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((caught) => {
      setLoadError(caught instanceof Error ? caught.message : "Battalion assignments could not be loaded.");
    }), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!status?.activeBattalion) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const payload = {
        expectedRevision: status.activeBattalion.settingsRevision,
        accessPolicy,
        joinEnabled,
        engagementSummary,
      };
      const response = await fetch("/api/onboarding/battalions/settings", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          commandId: retryableCommand("recruitment-settings", payload),
          ...payload,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      retryCommands.current.delete("recruitment-settings");
      await load();
      setNotice({ tone: "success", message: "Recruitment settings committed." });
    } catch (caught) {
      setNotice({ tone: "danger", message: caught instanceof Error ? caught.message : "Recruitment settings could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(undefined);
    try {
      const payload = { targetType, target, message };
      const response = await fetch("/api/onboarding/battalions/invites", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ commandId: retryableCommand("battalion-invite", payload), ...payload }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      retryCommands.current.delete("battalion-invite");
      setTarget("");
      setMessage("");
      setNotice({ tone: "success", message: "Invitation saved and sent by email." });
    } catch (caught) {
      setNotice({ tone: "danger", message: caught instanceof Error ? caught.message : "Invitation could not be sent." });
    } finally {
      setBusy(false);
    }
  }

  async function assignment(
    key: string,
    path: string,
    payload: Record<string, unknown>,
    success: string,
    refreshContext = false,
  ) {
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ commandId: retryableCommand(key, payload), ...payload }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      retryCommands.current.delete(key);
      if (refreshContext) {
        window.location.reload();
        return;
      }
      await load();
      setNotice({ tone: "success", message: success });
    } catch (caught) {
      setNotice({ tone: "danger", message: caught instanceof Error ? caught.message : "Battalion assignment could not be updated." });
    } finally {
      setBusy(false);
    }
  }

  async function joinWithCode(event: FormEvent) {
    event.preventDefault();
    const payload = { inviteCode: assignmentCode };
    await assignment("assignment-code", "/api/onboarding/battalions/join", payload, "Battalion assignment confirmed.", true);
  }

  async function switchAssignment(battalionId: string) {
    if (!status) return;
    await assignment(
      `assignment-switch:${battalionId}`,
      "/api/onboarding/battalions/current",
      { battalionId, expectedSelectionRevision: status.activeBattalionRevision },
      "Active Battalion context switched.",
      true,
    );
  }

  if (!status) return <section className="recruitment-empty"><h2>{loadError ? "Assignments unavailable" : "Loading assignments"}</h2><p>{loadError ?? "Reading your persistent Battalion memberships."}</p></section>;
  const battalion = status.activeBattalion;
  const canEdit = battalion?.permissions.includes("BATTALION_EDIT") ?? false;
  const canInvite = battalion?.permissions.includes("MEMBER_INVITE") ?? false;
  const existingAssignments = new Set(status.battalionAssignments.map((item) => item.battalionId));

  return (
    <section className="recruitment-console">
      <header className="strategic-section-heading"><div><span className="eyebrow">BATTALION RECRUITMENT</span><h2>Assignments, access and invitations</h2></div><span>{battalion ? `${battalion.accessPolicy} · ${battalion.joinEnabled ? "OPEN" : "CLOSED"}` : "ASSIGNMENT ONLY"}</span></header>
      {notice && <p className={`recruitment-notice ${notice.tone}`} role={notice.tone === "danger" ? "alert" : "status"}>{notice.message}</p>}
      <section className="recruitment-assignments">
          <header><small>YOUR BATTALION ASSIGNMENTS</small><h3>Select your command context</h3><p>Membership is persistent. Switching changes the Battalion shown across Command, Forces, Operations, and Ship surfaces without leaving another formation.</p></header>
          <div className="recruitment-membership-list">
            {status.battalionAssignments.map((item) => (
              <article className={item.current ? "current" : ""} key={item.battalionId}>
                <div>
                  <small>{item.shortName ?? "BATTALION"} · {item.commandRole.replaceAll("_", " ")}</small>
                  <strong>{item.name}</strong>
                  <p>{item.rankName} · membership revision {item.membershipRevision}</p>
                </div>
                {item.current
                  ? <span className="recruitment-current-marker">CURRENT</span>
                  : <button className="primary" disabled={busy} onClick={() => void switchAssignment(item.battalionId)}>SWITCH</button>}
              </article>
            ))}
          </div>
          <header className="recruitment-join-heading"><small>NEW ASSIGNMENT</small><h3>Join another active formation</h3></header>
          {status.invitations.length > 0 && <div className="recruitment-invitation-list">{status.invitations.map((item) => (
            <article key={item.invitationId}>
              <div><small>{item.source} INVITATION</small><strong>{item.battalionName}</strong><p>{item.invitedBy}{item.message ? ` · ${item.message}` : ""}</p></div>
              <button className="primary" disabled={busy} onClick={() => void assignment(
                `assignment-accept:${item.invitationId}`,
                "/api/onboarding/battalions/invites/respond",
                { invitationId: item.invitationId, decision: "ACCEPT" },
                "Battalion assignment accepted.",
                true,
              )}>ACCEPT</button>
              <button disabled={busy} onClick={() => void assignment(
                `assignment-decline:${item.invitationId}`,
                "/api/onboarding/battalions/invites/respond",
                { invitationId: item.invitationId, decision: "DECLINE" },
                "Invitation declined.",
              )}>DECLINE</button>
            </article>
          ))}</div>}
          <div className="recruitment-directory">
            {status.publicBattalions.filter((item) => !existingAssignments.has(item.battalionId)).map((item) => (
              <article key={item.battalionId}><div><small>{item.recruitmentKind} · {item.openSpots} OPEN</small><strong>{item.name}</strong><p>{item.engagementSummary}</p></div><button disabled={busy} onClick={() => void assignment(
                `assignment-public:${item.battalionId}`,
                "/api/onboarding/battalions/join",
                { battalionId: item.battalionId },
                "Battalion assignment confirmed.",
                true,
              )}>JOIN</button></article>
            ))}
          </div>
          <form className="recruitment-code-form" onSubmit={joinWithCode}>
            <label htmlFor="assignment-code">PRIVATE INVITE CODE</label>
            <input id="assignment-code" required minLength={8} maxLength={64} value={assignmentCode} onChange={(event) => setAssignmentCode(event.target.value.toUpperCase())} />
            <button disabled={busy}>JOIN WITH CODE</button>
          </form>
      </section>
      {battalion ? <div className="recruitment-grid">
        <form onSubmit={saveSettings}>
          <header><small>DIRECTORY POLICY</small><h3>Public access</h3></header>
          <fieldset disabled={!canEdit || busy}>
            <legend>VISIBILITY</legend>
            <label><input type="radio" checked={accessPolicy === "PUBLIC"} onChange={() => setAccessPolicy("PUBLIC")} /> PUBLIC · OPEN DIRECTORY</label>
            <label><input type="radio" checked={accessPolicy === "PRIVATE"} onChange={() => setAccessPolicy("PRIVATE")} /> PRIVATE · INVITATION ONLY</label>
          </fieldset>
          <label htmlFor="recruitment-engagement">CURRENT ENGAGEMENT</label>
          <input id="recruitment-engagement" disabled={!canEdit || busy} required={accessPolicy === "PUBLIC"} minLength={accessPolicy === "PUBLIC" ? 5 : undefined} maxLength={180} value={engagementSummary} onChange={(event) => setEngagementSummary(event.target.value)} />
          <label className="recruitment-toggle"><input type="checkbox" disabled={!canEdit || busy} checked={joinEnabled} onChange={(event) => setJoinEnabled(event.target.checked)} /> ACCEPT NEW COMMANDERS</label>
          <button className="primary" disabled={!canEdit || busy}>SAVE RECRUITMENT SETTINGS</button>
          {!canEdit && <p className="boundary-note">Your current rank does not grant BATTALION_EDIT.</p>}
        </form>
        <form onSubmit={invite}>
          <header><small>TARGETED INVITATION</small><h3>Invite a commander</h3></header>
          <fieldset disabled={!canInvite || busy}>
            <legend>LOOKUP</legend>
            <label><input type="radio" checked={targetType === "USERNAME"} onChange={() => setTargetType("USERNAME")} /> USERNAME</label>
            <label><input type="radio" checked={targetType === "EMAIL"} onChange={() => setTargetType("EMAIL")} /> EMAIL</label>
          </fieldset>
          <label htmlFor="recruitment-target">{targetType}</label>
          <input id="recruitment-target" disabled={!canInvite || busy} type={targetType === "EMAIL" ? "email" : "text"} required value={target} onChange={(event) => setTarget(event.target.value.toLowerCase())} />
          <label htmlFor="recruitment-message">MESSAGE <small>OPTIONAL</small></label>
          <textarea id="recruitment-message" disabled={!canInvite || busy} maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} />
          <button className="primary" disabled={!canInvite || busy}>SAVE AND EMAIL INVITATION</button>
          {!canInvite && <p className="boundary-note">Your current rank does not grant MEMBER_INVITE.</p>}
        </form>
      </div> : <p className="boundary-note"><strong>Recruitment settings unavailable:</strong> the selected Battalion has no published recruitment policy. You can still switch an existing membership or join an open formation.</p>}
      <p className="boundary-note"><strong>Privacy boundary:</strong> invitation email and identity records remain server-private. Public Battalion projections expose only profile and recruitment information.</p>
    </section>
  );
}
