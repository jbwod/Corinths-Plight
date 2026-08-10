import { useCallback, useEffect, useRef, useState } from "react";
import { loadOperationDetail, loadStrategicSnapshot } from "../strategic/api";
import { SHOWCASE_STRATEGIC_SNAPSHOT, type StrategicDataMode, type StrategicSnapshot } from "../strategic/model";
import { BattalionView } from "./strategic/BattalionView";
import { CommandView } from "./strategic/CommandView";
import { GalacticOperationsView } from "./strategic/GalacticOperationsView";
import { ShipView } from "./strategic/ShipView";

export type StrategicView = "Command" | "Battalion" | "Ship" | "Galactic";

interface StrategicWorkspaceProps {
  view: StrategicView;
  onNavigate: (view: StrategicView | "Forces" | "Campaigns" | "Deployment") => void;
  onNotice: (notice: { tone: "info" | "success" | "danger"; message: string }) => void;
}

function ModeBanner({ mode, issues }: { mode: StrategicDataMode; issues: string[] }) {
  if (mode === "LIVE") {
    return (
      <div className="strategic-mode-banner live" role="status">
        <i />
        <strong>Persistent world connected</strong>
        <span>Read models are scoped to your active Battalion and authenticated identity.{issues.length ? ` ${issues.length} optional projection${issues.length === 1 ? " was" : "s were"} unavailable or permission-limited.` : ""}</span>
      </div>
    );
  }
  return (
    <div className="strategic-mode-banner showcase" role="status">
      <i />
      <strong>Local showcase · read only</strong>
      <span>
        The strategic API is unavailable, so this deterministic Corinth fixture is being shown. No order, deployment,
        invite, rank, supply, or ship change can be submitted.
        {issues.length > 0 ? ` ${issues.length} service request${issues.length === 1 ? "" : "s"} did not complete.` : ""}
      </span>
    </div>
  );
}

export function StrategicWorkspace({ view, onNavigate, onNotice }: StrategicWorkspaceProps) {
  const pageRef = useRef<HTMLElement>(null);
  const [snapshot, setSnapshot] = useState<StrategicSnapshot>(SHOWCASE_STRATEGIC_SNAPSHOT);
  const [mode, setMode] = useState<StrategicDataMode>("LOADING");
  const [issues, setIssues] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setMode("LOADING");
    const result = await loadStrategicSnapshot();
    setSnapshot(result.snapshot);
    setIssues(result.issues);
    setMode(result.mode);
  }, []);

  useEffect(() => {
    let active = true;
    void loadStrategicSnapshot().then((result) => {
      if (!active) return;
      setSnapshot(result.snapshot);
      setIssues(result.issues);
      setMode(result.mode);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0, left: 0 });
  }, [view]);

  const requestOperationDetail = useCallback(async (operationId: string) => {
    if (mode !== "LIVE") return;
    const detail = await loadOperationDetail(operationId);
    if (!detail) return;
    setSnapshot((current) => ({
      ...current,
      operations: current.operations.map((operation) => operation.id === detail.id ? {
        ...operation,
        ...detail,
        location: operation.location,
        assignedBattlegroups: operation.assignedBattlegroups,
        strategicImportance: detail.strategicImportance === "Strategic briefing pending."
          ? operation.strategicImportance
          : detail.strategicImportance,
      } : operation),
    }));
  }, [mode]);

  if (mode === "LOADING") {
    return (
      <main className="strategic-page strategic-loading" aria-busy="true">
        <div className="strategic-loading-mark"><i /><i /><i /></div>
        <span className="eyebrow">PERSISTENT WORLD</span>
        <h1>Establishing strategic link</h1>
        <p>Loading your active Battalion, ship, operations, and theatre projection.</p>
      </main>
    );
  }

  if (mode === "AUTH_REQUIRED") {
    return (
      <main className="strategic-page strategic-auth-state">
        <span className="eyebrow">IDENTITY REQUIRED</span>
        <h1>Strategic records remain protected</h1>
        <p>The persistent-world service rejected this session. Sign in through the configured production identity path before Battalion data can be shown.</p>
        <button type="button" onClick={() => void refresh()}>RETRY SESSION</button>
      </main>
    );
  }

  if (mode === "ERROR") {
    return (
      <main className="strategic-page strategic-auth-state">
        <span className="eyebrow">PERSISTENT WORLD UNAVAILABLE</span>
        <h1>No local war state has been substituted</h1>
        <p>The authenticated strategic projection could not be loaded. Retry the live service; production never presents showcase formations or operations as persistent truth.</p>
        {issues.length > 0 && <small>{issues.join(" · ")}</small>}
        <button type="button" onClick={() => void refresh()}>RETRY STRATEGIC LINK</button>
      </main>
    );
  }

  if (mode === "NO_BATTALION") {
    return (
      <main className="strategic-page strategic-auth-state">
        <span className="eyebrow">FIRST STRATEGIC ASSIGNMENT</span>
        <h1>{snapshot.profile.callsign || "Player"}, you have no active Battalion</h1>
        <p>
          Your persistent identity and personal forces are intact. Join or create a Battalion before shared ships,
          Battlegroups, Task Forces, and strategic operations can be shown. Full invite and Battalion-creation flows
          remain deferred in this checkpoint.
        </p>
        <button type="button" onClick={() => onNavigate("Forces")}>OPEN PERSONAL FORCES</button>
      </main>
    );
  }

  return (
    <main ref={pageRef} className={`strategic-page strategic-view-${view.toLowerCase()}`}>
      <ModeBanner mode={mode} issues={issues} />
      {view === "Command" && <CommandView snapshot={snapshot} mode={mode} onNavigate={onNavigate} />}
      {view === "Battalion" && <BattalionView snapshot={snapshot} mode={mode} onNotice={onNotice} />}
      {view === "Ship" && <ShipView snapshot={snapshot} mode={mode} onNotice={onNotice} />}
      {view === "Galactic" && (
        <GalacticOperationsView
          snapshot={snapshot}
          mode={mode}
          onNavigate={onNavigate}
          onNotice={onNotice}
          onRequestOperationDetail={requestOperationDetail}
          onStrategicChanged={refresh}
        />
      )}
    </main>
  );
}
