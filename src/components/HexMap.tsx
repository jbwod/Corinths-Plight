import { useEffect, useMemo, useRef, useState } from "react";
import type { AxialCoord, CampaignDeployment, CampaignView } from "../../packages/domain/src";
import { coordKey, FACING_LABELS, getUnitClass } from "../../packages/rules-engine/src";

interface HexMapProps {
  campaign: CampaignView;
  selectedUnitId?: string;
  draftedRoute: AxialCoord[];
  draftedFacing: number;
  targetUnitId?: string;
  targetHex?: AxialCoord;
  onMapClick: (coord: AxialCoord, unit?: CampaignDeployment) => void;
  onHover: (coord?: AxialCoord, unit?: CampaignDeployment) => void;
}

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

const HEX_SIZE = 39;
const SQRT_THREE = Math.sqrt(3);

function axialToWorld({ q, r }: AxialCoord) {
  return { x: HEX_SIZE * 1.5 * q, y: HEX_SIZE * SQRT_THREE * (r + q / 2) };
}

function cubeRound(q: number, r: number): AxialCoord {
  let x = Math.round(q);
  let z = Math.round(r);
  const y = Math.round(-q - r);
  const xDiff = Math.abs(x - q);
  const yDiff = Math.abs(y + q + r);
  const zDiff = Math.abs(z - r);
  if (xDiff > yDiff && xDiff > zDiff) x = -y - z;
  else if (yDiff <= zDiff) z = -x - y;
  return { q: x, r: z };
}

function worldToAxial(x: number, y: number): AxialCoord {
  const q = (2 / 3) * (x / HEX_SIZE);
  const r = (-1 / 3) * (x / HEX_SIZE) + (SQRT_THREE / 3) * (y / HEX_SIZE);
  return cubeRound(q, r);
}

function polygon(ctx: CanvasRenderingContext2D, point: { x: number; y: number }, inset = 0) {
  ctx.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 3) * index;
    const radius = HEX_SIZE - inset;
    const x = point.x + Math.cos(angle) * radius;
    const y = point.y + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const terrainFill: Record<string, string> = {
  "terrain-open": "#19272a",
  "terrain-forest": "#173029",
  "terrain-ridge": "#34312b",
  "terrain-marsh": "#283331",
};

function unitCode(deployment: CampaignDeployment): string {
  let category = "";
  let definitionTags: string[] = [];
  try {
    const definition = getUnitClass(deployment.definitionId);
    category = definition.category;
    definitionTags = definition.tags;
  } catch {
    // Fog-safe contacts and future rulesets may not expose a local definition.
  }
  const tags = new Set([
    ...definitionTags,
    ...deployment.weapons.flatMap((weapon) => weapon.tags),
    ...(deployment.abilities ?? []).map((ability) => ability.abilityId.toUpperCase()),
    ...(deployment.movementProfile ? [deployment.movementProfile.mode] : []),
  ]);
  if (tags.has("MEDICAL")) return "MED";
  if (tags.has("BUILDER") || tags.has("ENGINEER")) return "ENG";
  if (tags.has("STEALTH")) return "SF";
  if (tags.has("LOGISTICS")) return "LOG";
  if (tags.has("INDIRECT") || tags.has("INDIRECT_FIRE") || category === "ARTILLERY") return "ART";
  if (tags.has("BOMBER")) return "BMB";
  if (tags.has("AEROSPACE_INTERCEPTOR") || tags.has("FORWARD_ARC")) return "FTR";
  if (tags.has("VTOL")) return "VTL";
  if (tags.has("AEROSPACE") || category === "AEROSPACE") return tags.has("TRANSPORT") ? "HAT" : "AIR";
  if (tags.has("MECH") || category === "MECH") return "MCH";
  if (category === "ARMOUR" || tags.has("VEHICLE") || deployment.durabilityProfile?.model === "HITS") return tags.has("HEAVY") || tags.has("ANTI_ARMOUR") ? "MBT" : "AFV";
  if (category === "INFANTRY" || tags.has("PERSONNEL")) return deployment.side === "ENEMY" ? "BIO" : "INF";
  return deployment.side === "ENEMY" ? "UNK" : "UNIT";
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  width: number,
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - 0.55) * 10, to.y - Math.sin(angle - 0.55) * 10);
  ctx.lineTo(to.x - Math.cos(angle + 0.55) * 10, to.y - Math.sin(angle + 0.55) * 10);
  ctx.closePath();
  ctx.fill();
}

export function HexMap({
  campaign,
  selectedUnitId,
  draftedRoute,
  draftedFacing,
  targetUnitId,
  targetHex,
  onMapClick,
  onHover,
}: HexMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 900, height: 650, ratio: 1 });
  const [viewport, setViewport] = useState<Viewport>({ x: 450, y: 330, zoom: 1 });
  const [hovered, setHovered] = useState<AxialCoord>();

  const mapIndex = useMemo(() => new Map(campaign.map.map((hex) => [coordKey(hex.coord), hex])), [campaign.map]);
  const unitIndex = useMemo(() => {
    const result = new Map<string, CampaignDeployment[]>();
    for (const deployment of campaign.deployments.filter((candidate) => candidate.status !== "DESTROYED")) {
      const key = coordKey(deployment.position);
      result.set(key, [...(result.get(key) ?? []), deployment]);
    }
    return result;
  }, [campaign.deployments]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height, ratio });
      setViewport((current) =>
        current.x === 450 && current.y === 330
          ? { ...current, x: entry.contentRect.width / 2, y: entry.contentRect.height / 2 }
          : current,
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, Math.floor(size.width * size.ratio));
    canvas.height = Math.max(1, Math.floor(size.height * size.ratio));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    const background = ctx.createRadialGradient(size.width / 2, size.height / 2, 20, size.width / 2, size.height / 2, size.width);
    background.addColorStop(0, "#102326");
    background.addColorStop(1, "#061013");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size.width, size.height);

    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    for (const hex of campaign.map) {
      const point = axialToWorld(hex.coord);
      polygon(ctx, point, 1.2);
      ctx.fillStyle = terrainFill[hex.terrainId] ?? "#1d282b";
      ctx.globalAlpha = hex.visibility === "UNKNOWN" ? 0.19 : hex.visibility === "OBSERVED" ? 0.54 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = hex.visibility === "VISIBLE" ? "rgba(105,151,153,.38)" : "rgba(60,82,84,.24)";
      ctx.lineWidth = 1;
      ctx.stroke();

      if (hex.terrainId === "terrain-forest" && hex.visibility !== "UNKNOWN") {
        ctx.fillStyle = "rgba(72,132,101,.42)";
        for (const offset of [-14, 0, 14]) {
          ctx.beginPath();
          ctx.moveTo(point.x + offset, point.y - 12);
          ctx.lineTo(point.x + offset - 7, point.y + 4);
          ctx.lineTo(point.x + offset + 7, point.y + 4);
          ctx.closePath();
          ctx.fill();
        }
      }
      if (hex.terrainId === "terrain-ridge" && hex.visibility !== "UNKNOWN") {
        ctx.strokeStyle = "rgba(194,164,111,.45)";
        ctx.beginPath();
        ctx.moveTo(point.x - 24, point.y + 9);
        ctx.lineTo(point.x - 6, point.y - 11);
        ctx.lineTo(point.x + 5, point.y + 1);
        ctx.lineTo(point.x + 18, point.y - 15);
        ctx.lineTo(point.x + 27, point.y + 9);
        ctx.stroke();
      }
      if (hex.edges.roads.length > 0 && hex.visibility !== "UNKNOWN") {
        ctx.strokeStyle = "rgba(201,174,114,.55)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(point.x - 33, point.y);
        ctx.lineTo(point.x + 33, point.y);
        ctx.stroke();
      }
      if (hex.edges.rivers.length > 0 && hex.visibility !== "UNKNOWN") {
        ctx.strokeStyle = "rgba(66,151,166,.7)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y - 30);
        ctx.bezierCurveTo(point.x - 9, point.y - 10, point.x + 9, point.y + 10, point.x, point.y + 30);
        ctx.stroke();
      }
      if (hex.visibility === "UNKNOWN") {
        polygon(ctx, point, 2);
        ctx.fillStyle = "rgba(2,7,9,.73)";
        ctx.fill();
        ctx.strokeStyle = "rgba(91,112,113,.08)";
        ctx.beginPath();
        ctx.moveTo(point.x - 22, point.y + 21);
        ctx.lineTo(point.x + 22, point.y - 21);
        ctx.stroke();
      }
      if (viewport.zoom > 0.82 && hex.visibility !== "UNKNOWN") {
        ctx.fillStyle = "rgba(166,193,193,.38)";
        ctx.font = "8px ui-monospace, SFMono-Regular, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${hex.coord.q}.${hex.coord.r}`, point.x, point.y + 29);
      }
    }

    for (const objective of campaign.objectives) {
      const point = axialToWorld(objective.coord);
      const color = objective.owner === "ALLIED" ? "#70d6cc" : objective.owner === "ENEMY" ? "#e56f51" : "#d6b86d";
      ctx.strokeStyle = color;
      ctx.fillStyle = "rgba(5,14,16,.88)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point.x - 6, point.y);
      ctx.lineTo(point.x, point.y - 6);
      ctx.lineTo(point.x + 6, point.y);
      ctx.lineTo(point.x, point.y + 6);
      ctx.closePath();
      ctx.stroke();
    }

    for (const order of campaign.orders.filter((candidate) => candidate.round === campaign.round && candidate.route.length > 1)) {
      const points = order.route.map(axialToWorld);
      ctx.save();
      ctx.setLineDash([7, 7]);
      ctx.strokeStyle = order.submittedBy === campaign.viewer.userId ? "rgba(115,225,211,.8)" : "rgba(218,185,104,.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
      ctx.stroke();
      ctx.restore();
      if (points.length > 1) drawArrow(ctx, points.at(-2)!, points.at(-1)!, "rgba(218,185,104,.78)", 2);
    }

    if (draftedRoute.length > 1) {
      const points = draftedRoute.map(axialToWorld);
      ctx.save();
      ctx.shadowColor = "#79ebdd";
      ctx.shadowBlur = 10;
      ctx.strokeStyle = "#79ebdd";
      ctx.lineWidth = 3;
      ctx.beginPath();
      points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
      ctx.stroke();
      ctx.restore();
      drawArrow(ctx, points.at(-2)!, points.at(-1)!, "#79ebdd", 3);
    }

    if (targetHex && mapIndex.has(coordKey(targetHex))) {
      const point = axialToWorld(targetHex);
      ctx.save();
      ctx.strokeStyle = "#ff9a68";
      ctx.fillStyle = "rgba(255,122,78,.12)";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(point.x, point.y, HEX_SIZE * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    for (const [key, deployments] of unitIndex.entries()) {
      const hex = mapIndex.get(key);
      if (!hex || hex.visibility === "UNKNOWN") continue;
      const base = axialToWorld(hex.coord);
      deployments.forEach((deployment, index) => {
        const offset = deployments.length === 1 ? { x: 0, y: 0 } : { x: (index - (deployments.length - 1) / 2) * 19, y: index % 2 === 0 ? -3 : 6 };
        const point = { x: base.x + offset.x, y: base.y + offset.y };
        const allied = deployment.side === "ALLIED";
        const selected = deployment.id === selectedUnitId;
        const targeted = deployment.id === targetUnitId;
        ctx.save();
        if (selected || targeted) {
          ctx.shadowColor = selected ? "#79ebdd" : "#ff765d";
          ctx.shadowBlur = 14;
        }
        ctx.fillStyle = allied ? "#102c30" : "#321b19";
        ctx.strokeStyle = selected ? "#91fff0" : targeted ? "#ff8b72" : allied ? "#61c8c1" : "#d7654e";
        ctx.lineWidth = selected || targeted ? 3 : 2;
        ctx.beginPath();
        ctx.rect(point.x - 17, point.y - 13, 34, 26);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = allied ? "#b8efea" : "#ffc0aa";
        ctx.font = "bold 9px ui-monospace, SFMono-Regular, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(unitCode(deployment), point.x, point.y - 2);
        const healthRatio = deployment.currentHealth / deployment.stats.maxHealth;
        ctx.fillStyle = "rgba(0,0,0,.72)";
        ctx.fillRect(point.x - 13, point.y + 7, 26, 3);
        ctx.fillStyle = healthRatio > 0.5 ? "#77d4ad" : healthRatio > 0.25 ? "#d9b85d" : "#e16a51";
        ctx.fillRect(point.x - 13, point.y + 7, 26 * healthRatio, 3);

        const facing = deployment.id === selectedUnitId ? draftedFacing : deployment.facing;
        const angle = -Math.PI / 2 + (Math.PI / 3) * facing;
        ctx.strokeStyle = allied ? "#9ef7eb" : "#ff9e82";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(point.x + Math.cos(angle) * 16, point.y + Math.sin(angle) * 16);
        ctx.lineTo(point.x + Math.cos(angle) * 25, point.y + Math.sin(angle) * 25);
        ctx.stroke();
      });
    }

    if (hovered && mapIndex.has(coordKey(hovered))) {
      const point = axialToWorld(hovered);
      polygon(ctx, point, 1);
      ctx.strokeStyle = "rgba(255,226,153,.92)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(size.width / 2, size.height / 2, size.width * 0.25, size.width / 2, size.height / 2, size.width * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.48)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size.width, size.height);
  }, [campaign, draftedFacing, draftedRoute, hovered, mapIndex, selectedUnitId, size, targetHex, targetUnitId, unitIndex, viewport]);

  const screenToCoord = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (clientX - rect.left - viewport.x) / viewport.zoom;
    const y = (clientY - rect.top - viewport.y) / viewport.zoom;
    return worldToAxial(x, y);
  };

  return (
    <div className="map-canvas-shell" ref={containerRef}>
      <canvas
        ref={canvasRef}
        role="application"
        aria-label="Outpost K-17 tactical hex map. Drag to pan, wheel to zoom, and select a hex to issue orders."
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
        }}
        onPointerMove={(event) => {
          const coord = screenToCoord(event.clientX, event.clientY);
          if (!hovered || coord.q !== hovered.q || coord.r !== hovered.r) {
            setHovered(coord);
            onHover(coord, unitIndex.get(coordKey(coord))?.[0]);
          }
          if (!dragRef.current || event.buttons !== 1) return;
          const dx = event.clientX - dragRef.current.x;
          const dy = event.clientY - dragRef.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) dragRef.current.moved = true;
          setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
          dragRef.current.x = event.clientX;
          dragRef.current.y = event.clientY;
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (drag?.moved) return;
          const coord = screenToCoord(event.clientX, event.clientY);
          if (!mapIndex.has(coordKey(coord))) return;
          const units = unitIndex.get(coordKey(coord)) ?? [];
          const preferred =
            units.find((deployment) => deployment.ownerId === campaign.viewer.userId) ??
            units.find((deployment) => deployment.side === "ENEMY") ??
            units[0];
          onMapClick(coord, preferred);
        }}
        onPointerLeave={() => {
          setHovered(undefined);
          onHover();
          dragRef.current = null;
        }}
        onWheel={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const cursorX = event.clientX - rect.left;
          const cursorY = event.clientY - rect.top;
          setViewport((current) => {
            const nextZoom = Math.max(0.56, Math.min(2.2, current.zoom * (event.deltaY < 0 ? 1.1 : 0.9)));
            const scale = nextZoom / current.zoom;
            return {
              zoom: nextZoom,
              x: cursorX - (cursorX - current.x) * scale,
              y: cursorY - (cursorY - current.y) * scale,
            };
          });
        }}
        onKeyDown={(event) => {
          const amount = event.shiftKey ? 80 : 35;
          if (event.key === "ArrowLeft") setViewport((current) => ({ ...current, x: current.x + amount }));
          if (event.key === "ArrowRight") setViewport((current) => ({ ...current, x: current.x - amount }));
          if (event.key === "ArrowUp") setViewport((current) => ({ ...current, y: current.y + amount }));
          if (event.key === "ArrowDown") setViewport((current) => ({ ...current, y: current.y - amount }));
          if (event.key === "+" || event.key === "=") setViewport((current) => ({ ...current, zoom: Math.min(2.2, current.zoom * 1.1) }));
          if (event.key === "-") setViewport((current) => ({ ...current, zoom: Math.max(0.56, current.zoom * 0.9) }));
        }}
      />
      <div className="map-coordinates" aria-hidden="true">
        {hovered ? `HEX ${hovered.q}.${hovered.r}` : "TACTICAL GRID // K-17"}
      </div>
      <div className="map-zoom-controls">
        <button onClick={() => setViewport((current) => ({ ...current, zoom: Math.min(2.2, current.zoom * 1.15) }))} aria-label="Zoom in">+</button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <button onClick={() => setViewport((current) => ({ ...current, zoom: Math.max(0.56, current.zoom * 0.85) }))} aria-label="Zoom out">−</button>
      </div>
      <div className="map-facing-readout">FACING {FACING_LABELS[draftedFacing] ?? "N"}</div>
      <div className="map-legend">
        <span><i className="legend-chip allied" /> ALLIED</span>
        <span><i className="legend-chip enemy" /> HOSTILE</span>
        <span><i className="legend-chip intent" /> INTENT</span>
      </div>
    </div>
  );
}
