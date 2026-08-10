import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { BattalionAccessPolicy, OnboardingStatusDto } from "../../packages/domain/src";

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
    const response = await fetch("/api/onboarding");
    if (!response.ok) throw new Error(await errorMessage(response));
    const next = await response.json() as OnboardingStatusDto;
    setStatus(next);
    if (next.activeBattalion) {
      setAccessPolicy(next.activeBattalion.accessPolicy);
      setJoinEnabled(next.activeBattalion.joinEnabled);
      setEngagementSummary(next.activeBattalion.engagementSummary);
    }
  }, [setAccessPolicy, setEngagementSummary, setJoinEnabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch(() => undefined), 0);
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
        headers: { "content-type": "application/json" },
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
        headers: { "content-type": "application/json" },
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
        headers: { "content-type": "application/json" },
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

  const battalion = status?.activeBattalion;
  if (!battalion) return <section className="recruitment-empty"><h2>Recruitment unavailable</h2><p>No active Battalion recruitment context is available for this account.</p></section>;
  const canEdit = battalion.permissions.includes("BATTALION_EDIT");
  const canInvite = battalion.permissions.includes("MEMBER_INVITE");

  return (
    <section className="recruitment-console">
      <header className="strategic-section-heading"><div><span className="eyebrow">BATTALION RECRUITMENT</span><h2>Access and invitations</h2></div><span>{battalion.accessPolicy} · {battalion.joinEnabled ? "OPEN" : "CLOSED"}</span></header>
      {notice && <p className={`recruitment-notice ${notice.tone}`} role={notice.tone === "danger" ? "alert" : "status"}>{notice.message}</p>}
      <section className="recruitment-assignments">
          <header><small>YOUR BATTALION ASSIGNMENTS</small><h3>Join another active formation</h3><p>Membership is persistent. Joining here selects the new Battalion as your current operational context.</p></header>
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
            {status.publicBattalions.filter((item) => item.battalionId !== battalion.battalionId).map((item) => (
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
      <div className="recruitment-grid">
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
      </div>
      <p className="boundary-note"><strong>Privacy boundary:</strong> invitation email and identity records remain server-private. Public Battalion projections expose only profile and recruitment information.</p>
    </section>
  );
}
