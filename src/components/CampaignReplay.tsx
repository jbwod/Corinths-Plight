import { useEffect, useMemo, useState } from "react";
import type { AxialCoord, CampaignEvent } from "../../packages/domain/src";
import { buildCampaignReplayFrames, type CampaignReplayStartingState } from "../campaign/replay";
import { describeCampaignReportEvent } from "../campaign/reports";
import { resolveUnitVisual, TACTICAL_UNIT_GLYPH_PATHS } from "../unit-visuals";
import { TacticalUnitGlyph } from "./UnitVisual";

interface CampaignReplayProps {
  startingState: CampaignReplayStartingState;
  events: CampaignEvent[];
  names: ReadonlyMap<string, string>;
}

const HEX_RADIUS = 27;

function point(coord: AxialCoord): { x: number; y: number } {
  return { x: coord.q * 43, y: (coord.r + coord.q / 2) * 49 };
}

function hexPoints(coord: AxialCoord): string {
  const center = point(coord);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 3 * index;
    return `${center.x + Math.cos(angle) * HEX_RADIUS},${center.y + Math.sin(angle) * HEX_RADIUS}`;
  }).join(" ");
}

function deploymentColor(side: string): string {
  return side === "ALLIED" ? "#70d9cf" : side === "ENEMY" ? "#ef775b" : "#d7bb72";
}

export function CampaignReplay({ startingState, events, names }: CampaignReplayProps) {
  const frames = useMemo(() => buildCampaignReplayFrames(startingState, events), [events, startingState]);
  const [frameIndex, setFrameIndex] = useState(frames.length - 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const activeIndex = Math.min(frameIndex, frames.length - 1);
  const frame = frames[activeIndex]!;

  useEffect(() => {
    // A newly selected report opens at its resolved state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrameIndex(frames.length - 1);
    setPlaying(false);
  }, [frames]);

  useEffect(() => {
    if (!playing) return;
    if (activeIndex >= frames.length - 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setFrameIndex((index) => Math.min(frames.length - 1, index + 1)), 900 / speed);
    return () => window.clearTimeout(timer);
  }, [activeIndex, frames.length, playing, speed]);

  const points = startingState.map.map((hex) => point(hex.coord));
  const minX = Math.min(...points.map((item) => item.x)) - 55;
  const maxX = Math.max(...points.map((item) => item.x)) + 55;
  const minY = Math.min(...points.map((item) => item.y)) - 55;
  const maxY = Math.max(...points.map((item) => item.y)) + 55;
  const actor = frame.actorId ? frame.deployments.find((unit) => unit.id === frame.actorId) : undefined;
  const target = frame.targetId ? frame.deployments.find((unit) => unit.id === frame.targetId) : undefined;
  const interactionTarget = target?.position ?? frame.targetHex;
  const currentDescription = frame.event
    ? describeCampaignReportEvent(frame.event, names)
    : `Round ${startingState.round} locked battlefield snapshot.`;

  function playFromCurrent(): void {
    if (activeIndex >= frames.length - 1) setFrameIndex(0);
    setPlaying(true);
  }

  return (
    <section className="campaign-replay panel" aria-label={`Round ${startingState.round} event playback`}>
      <header>
        <div><span className="eyebrow">TACTICAL RECONSTRUCTION</span><h3>Round {startingState.round} playback</h3></div>
        <div className="replay-position"><small>EVENT</small><strong>{activeIndex} / {frames.length - 1}</strong></div>
      </header>
      <div className="replay-layout">
        <div className="replay-map-shell">
          <svg
            viewBox={`${minX} ${minY} ${Math.max(1, maxX - minX)} ${Math.max(1, maxY - minY)}`}
            role="img"
            aria-labelledby="replay-map-title replay-map-description"
          >
            <title id="replay-map-title">Round {startingState.round} tactical reconstruction</title>
            <desc id="replay-map-description">{currentDescription}</desc>
            {startingState.map.map((hex) => (
              <polygon
                className={`replay-hex visibility-${(hex.visibility ?? "UNKNOWN").toLowerCase()}`}
                key={`${hex.coord.q},${hex.coord.r}`}
                points={hexPoints(hex.coord)}
              />
            ))}
            {frame.objectives.map((objective) => {
              const center = point(objective.coord);
              return <rect className={`replay-objective ${objective.owner.toLowerCase()}`} key={objective.id} x={center.x - 9} y={center.y - 9} width="18" height="18" transform={`rotate(45 ${center.x} ${center.y})`} />;
            })}
            {frame.route && frame.route.length > 1 && (
              <polyline className="replay-route" points={frame.route.map((coord) => { const value = point(coord); return `${value.x},${value.y}`; }).join(" ")} />
            )}
            {actor && interactionTarget && (() => {
              const from = point(actor.position);
              const to = point(interactionTarget);
              return <line className="replay-interaction" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
            })()}
            {frame.deployments
              .filter((unit) => unit.locationState !== "EMBARKED")
              .map((unit) => {
                const center = point(unit.position);
                const highlighted = unit.id === frame.actorId || unit.id === frame.targetId;
                const ratio = Math.max(0, unit.currentHealth / unit.stats.maxHealth);
                const visual = resolveUnitVisual({
                  definitionId: unit.definitionId,
                  side: unit.side,
                  tags: [
                    ...unit.weapons.flatMap((weapon) => weapon.tags),
                    ...(unit.abilities ?? []).map((ability) => ability.abilityId),
                    ...(unit.movementProfile ? [unit.movementProfile.mode] : []),
                  ],
                });
                return (
                  <g className={`replay-unit ${unit.status === "DESTROYED" ? "destroyed" : ""} ${highlighted ? "highlighted" : ""}`} key={unit.id} transform={`translate(${center.x} ${center.y})`}>
                    <rect x="-17" y="-13" width="34" height="26" rx="3" fill="#071517" stroke={deploymentColor(unit.side)} />
                    <path className="replay-unit-glyph" d={TACTICAL_UNIT_GLYPH_PATHS[visual.tacticalGlyph]} transform="translate(-9 -11) scale(.56)" stroke={deploymentColor(unit.side)} />
                    <rect className="replay-health-track" x="-13" y="7" width="26" height="3" />
                    <rect className="replay-health-value" x="-13" y="7" width={26 * ratio} height="3" />
                    <text className="replay-unit-label" y="19" textAnchor="middle" fill={deploymentColor(unit.side)}>{unit.callsign.slice(0, 7)}</text>
                  </g>
                );
              })}
          </svg>
          <div className="replay-event-callout" role="status" aria-live="polite">
            <b>{frame.event ? String(frame.event.type).replaceAll("_", " ") : "ROUND LOCKED"}</b>
            <span>{currentDescription}</span>
          </div>
        </div>
        <div className="replay-unit-ledger" aria-label="Units at current playback step">
          <header>VISIBLE FORMATIONS</header>
          {frame.deployments.map((unit) => (
            <div className={unit.id === frame.actorId || unit.id === frame.targetId ? "active" : ""} key={unit.id}>
              <TacticalUnitGlyph
                kind={resolveUnitVisual({ definitionId: unit.definitionId, side: unit.side }).tacticalGlyph}
                className="replay-ledger-glyph"
              />
              <span><strong>{unit.callsign}</strong><small>HEX {unit.position.q}.{unit.position.r} · {unit.status}</small></span>
              <b>{unit.currentHealth}/{unit.stats.maxHealth}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="replay-controls">
        <button type="button" onClick={() => { setPlaying(false); setFrameIndex(0); }} aria-label="Restart playback">|◀</button>
        <button type="button" onClick={() => { setPlaying(false); setFrameIndex((index) => Math.max(0, index - 1)); }} aria-label="Previous event">◀</button>
        <button type="button" className="primary" onClick={() => playing ? setPlaying(false) : playFromCurrent()}>{playing ? "PAUSE" : "PLAY"}</button>
        <button type="button" onClick={() => { setPlaying(false); setFrameIndex((index) => Math.min(frames.length - 1, index + 1)); }} aria-label="Next event">▶</button>
        <button type="button" onClick={() => { setPlaying(false); setFrameIndex(frames.length - 1); }} aria-label="Show resolved state">▶|</button>
        <input
          type="range"
          min="0"
          max={frames.length - 1}
          value={activeIndex}
          aria-label="Playback event"
          onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }}
        />
        <button type="button" className="speed" onClick={() => setSpeed((value) => value === 1 ? 2 : 1)}>{speed}× SPEED</button>
      </div>
    </section>
  );
}
