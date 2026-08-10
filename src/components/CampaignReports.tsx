import { useEffect, useMemo, useState } from "react";
import type { CampaignEvent, CampaignView, ResolutionRecord } from "../../packages/domain/src";
import { Glyph } from "./Glyph";
import {
  CAMPAIGN_REPORT_GROUPS,
  campaignReportGroup,
  describeCampaignReportEvent,
  summarizeCampaignReport,
} from "../campaign/reports";

interface CampaignReportResponse {
  resolution: Omit<ResolutionRecord, "seed">;
  events: CampaignEvent[];
}

interface CampaignReportsProps {
  campaign: CampaignView;
  campaignId: string;
  demoUser?: string;
  onReturnToCampaign: () => void;
}

async function reportError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Report request failed (${response.status}).`;
  } catch {
    return `Report request failed (${response.status}).`;
  }
}

function eventTime(event: CampaignEvent): string {
  return new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function CampaignReports({ campaign, campaignId, demoUser, onReturnToCampaign }: CampaignReportsProps) {
  const resolvedRounds = useMemo(() => {
    const scenarioStart = campaign.scenarioPolicy?.startRound ?? 1;
    const rounds = new Set(
      campaign.events
        .filter((event) => event.type === "ROUND_FINISHED" && event.round >= scenarioStart)
        .map((event) => event.round),
    );
    const outcome = (campaign as CampaignView & { outcome?: { round?: number } }).outcome;
    if (typeof outcome?.round === "number") rounds.add(outcome.round);
    return [...rounds].sort((left, right) => left - right);
  }, [campaign]);
  const [selectedRound, setSelectedRound] = useState<number>();
  const activeRound = selectedRound !== undefined && resolvedRounds.includes(selectedRound)
    ? selectedRound
    : resolvedRounds.at(-1);
  const [result, setResult] = useState<{
    round: number;
    report?: CampaignReportResponse;
    error?: string;
  }>();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (activeRound === undefined) return;
    const controller = new AbortController();
    fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/reports/${activeRound}`, {
      headers: demoUser ? { "x-demo-user": demoUser } : undefined,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await reportError(response));
        return response.json() as Promise<CampaignReportResponse>;
      })
      .then((next) => setResult({
        round: activeRound,
        report: {
          resolution: next.resolution,
          events: [...next.events].sort((left, right) => left.sequence - right.sequence),
        },
      }))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          round: activeRound,
          error: reason instanceof Error ? reason.message : "Campaign report is unavailable.",
        });
      });
    return () => controller.abort();
  }, [activeRound, campaignId, demoUser, reload]);

  const report = result && result.round === activeRound ? result.report : undefined;
  const error = result && result.round === activeRound ? result.error : undefined;
  const loading = activeRound !== undefined && result?.round !== activeRound;

  const names = useMemo(
    () => new Map(campaign.deployments.map((deployment) => [deployment.id, deployment.callsign])),
    [campaign.deployments],
  );
  const metrics = useMemo(() => summarizeCampaignReport(report?.events ?? []), [report]);
  const groupedEvents = useMemo(
    () => new Map(CAMPAIGN_REPORT_GROUPS.map((group) => [
      group,
      report?.events.filter((event) => campaignReportGroup(event) === group) ?? [],
    ])),
    [report],
  );
  const terminalEvent = report?.events.find((event) => ["CAMPAIGN_COMPLETED", "CAMPAIGN_FAILED"].includes(String(event.type)));
  const terminalVictory = String(terminalEvent?.type) === "CAMPAIGN_COMPLETED";

  return (
    <main className="reports-page">
      <section className="reports-hero">
        <div>
          <span className="eyebrow">AFTER-ACTION ARCHIVE // AUTHORITATIVE EVENTS</span>
          <h2>{campaign.campaignName}</h2>
          <p>Review movement, combat rolls, losses, support actions, and objective changes recorded by the round resolver.</p>
        </div>
        <button onClick={onReturnToCampaign}><Glyph name="target" size={16} /> RETURN TO CAMPAIGN</button>
      </section>

      {resolvedRounds.length === 0 ? (
        <section className="reports-empty panel">
          <Glyph name="reports" size={34} />
          <span className="eyebrow">NO RESOLVED ROUNDS</span>
          <h3>Submit orders and resolve round {campaign.round}</h3>
          <p>The first after-action report will appear here as soon as campaign command completes the round.</p>
          <button onClick={onReturnToCampaign}>OPEN ORDER COMPOSER</button>
        </section>
      ) : (
        <>
          <nav className="report-rounds panel" aria-label="Resolved campaign rounds">
            <span className="eyebrow">ROUND ARCHIVE</span>
            <div>
              {resolvedRounds.map((round) => (
                  <button className={activeRound === round ? "active" : ""} key={round} onClick={() => setSelectedRound(round)}>
                  <small>ROUND</small><strong>{round}</strong>
                </button>
              ))}
            </div>
          </nav>

          {loading ? (
            <section className="reports-loading panel" role="status">RECONSTRUCTING ROUND {activeRound}…</section>
          ) : error ? (
            <section className="reports-error panel" role="alert">
              <strong>REPORT LINK UNAVAILABLE</strong><p>{error}</p><button onClick={() => { setResult(undefined); setReload((value) => value + 1); }}>RETRY</button>
            </section>
          ) : report ? (
            <>
              {terminalEvent && (
                <section className={`campaign-outcome ${terminalVictory ? "victory" : "defeat"}`}>
                  <span>{terminalVictory ? "MISSION ACCOMPLISHED" : "MISSION FAILED"}</span>
                  <strong>{describeCampaignReportEvent(terminalEvent, names)}</strong>
                </section>
              )}

              <section className="report-metrics panel" aria-label={`Round ${activeRound} summary`}>
                <div><small>ORDERS RESOLVED</small><strong>{metrics.acceptedOrders}</strong><span>{metrics.rejectedOrders} REJECTED</span></div>
                <div><small>UNITS MOVED</small><strong>{metrics.movements}</strong><span>POSITION CHANGES</span></div>
                <div><small>ATTACKS</small><strong>{metrics.attacks}</strong><span>{metrics.diceRolls} ROLLS</span></div>
                <div><small>DAMAGE</small><strong>{metrics.damage}</strong><span>{metrics.destroyed} DESTROYED</span></div>
                <div><small>OBJECTIVES</small><strong>{metrics.objectiveChanges}</strong><span>CONTROL CHANGES</span></div>
                <div><small>EVENT LOG</small><strong>{report.events.length}</strong><span>ROUND {report.resolution.round}</span></div>
              </section>

              <section className="report-objectives panel">
                <header><span className="eyebrow">MISSION STATE</span><strong>OBJECTIVE CONTROL</strong></header>
                <div>
                  {campaign.objectives.map((objective) => (
                    <article className={objective.owner.toLowerCase()} key={objective.id}>
                      <i />
                      <span><strong>{objective.name}</strong><small>{objective.description}</small></span>
                      <b>{objective.owner}</b>
                    </article>
                  ))}
                </div>
              </section>

              <section className="report-groups">
                {CAMPAIGN_REPORT_GROUPS.map((group) => {
                  const events = groupedEvents.get(group) ?? [];
                  if (events.length === 0) return null;
                  return (
                    <article className="report-group panel" key={group}>
                      <header><span>{group}</span><b>{events.length}</b></header>
                      <div>
                        {events.map((event) => (
                          <div key={event.eventId}>
                            <time>{eventTime(event)}</time>
                            <i className={String(event.type).toLowerCase()} />
                            <span><strong>{String(event.type).replaceAll("_", " ")}</strong><p>{describeCampaignReportEvent(event, names)}</p></span>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </section>

              <details className="report-timeline panel">
                <summary>FULL ORDERED EVENT LOG <span>{report.events.length} EVENTS</span></summary>
                <ol>
                  {report.events.map((event) => (
                    <li key={event.eventId}><b>{String(event.sequence).padStart(3, "0")}</b><span>{String(event.type).replaceAll("_", " ")}<small>{describeCampaignReportEvent(event, names)}</small></span></li>
                  ))}
                </ol>
              </details>
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
