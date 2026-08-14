import { useEffect, useMemo, useRef, useState } from "react";
import type { AxialCoord, CampaignDeployment, CampaignMarkerDto, CampaignView, UnitOrder } from "../../packages/domain/src";
import { coordKey, FACING_LABELS, HEX_DIRECTIONS, INFANTRY_GARRISON_BUILDING } from "../../packages/rules-engine/src";
import { findTacticalSprite, resolveUnitVisual, TACTICAL_UNIT_GLYPH_PATHS } from "../unit-visuals";
import {
  stableDeploymentOrder,
  tacticalFormationLayout,
  tacticalFormationScale,
  tacticalSpriteGroupFrame,
  tacticalSpriteGroupLayout,
  tacticalSpriteFrame,
  tacticalSpriteMotion,
  tacticalSpriteState,
  type TacticalSpriteState,
} from "../tactical-visuals";
import {
  axialToTacticalWorld,
  clampTacticalZoom,
  fitTacticalMapViewport,
  tacticalMapBounds,
  tacticalWorldToAxial,
  TACTICAL_HEX_SIZE,
  type TacticalMapViewport,
} from "../tactical-map-geometry";
import {
  connectedTerrainDirections,
  exposedMapDirections,
  tacticalTerrainLabel,
  tacticalTerrainSeed,
  tacticalTerrainStyle,
  tacticalTerrainVisualProfile,
  tacticalWaterRings,
  terrainBoundaryDirections,
  type TacticalTerrainStyle,
  type TacticalWaterDepth,
} from "../tactical-terrain";
import { tacticalObjectiveAriaLabel, tacticalObjectiveVisual } from "../tactical-objectives";

interface HexMapProps {
  campaign: CampaignView;
  markers: CampaignMarkerDto[];
  layer: TacticalMapLayer;
  selectedUnitId?: string;
  draftedRoute: AxialCoord[];
  draftedFacing: number;
  targetUnitId?: string;
  targetHex?: AxialCoord;
  onMapClick: (coord: AxialCoord, unit?: CampaignDeployment) => void;
  onRemoveMarker: (markerId: string) => void;
  onHover: (coord?: AxialCoord, unit?: CampaignDeployment) => void;
}

export type TacticalMapLayer = "SURFACE" | "INTEL" | "SUPPLY";

const HEX_SIZE = TACTICAL_HEX_SIZE;
const SPRITE_FRAME_SIZE = 256;
const MARKER_COLORS = { PING: "#f1c96b", MOVE: "#65d6e8", ATTACK: "#ff765d", DEFEND: "#7e9ff2", SUPPORT: "#75d89b" } as const;
const ALLIED_COMMAND_COLORS = ["#67ddd2", "#79a9ff", "#dfbd70", "#8ed47c", "#c18af0", "#ec91b2"] as const;
const WATER_FILL: Readonly<Record<TacticalWaterDepth, string>> = {
  1: "rgba(27, 63, 65, .94)",
  2: "rgba(16, 45, 50, .91)",
  3: "rgba(9, 31, 37, .88)",
};
const WATER_STROKE: Readonly<Record<TacticalWaterDepth, string>> = {
  1: "rgba(109, 158, 154, .3)",
  2: "rgba(79, 129, 135, .22)",
  3: "rgba(55, 101, 112, .16)",
};

type IntentVisualKind = "MANEUVER" | "ASSAULT" | "SUPPORT" | "FORTIFY" | "HOLD";
type IntentScope = "ALL" | "MINE" | "ALLIES";

interface IntentVisual {
  kind: IntentVisualKind;
  color: string;
  glyph: string;
  dash: number[];
}

const INTENT_VISUALS: Record<IntentVisualKind, IntentVisual> = {
  MANEUVER: { kind: "MANEUVER", color: "#69d9e8", glyph: "→", dash: [8, 5] },
  ASSAULT: { kind: "ASSAULT", color: "#ff8067", glyph: "×", dash: [12, 4] },
  SUPPORT: { kind: "SUPPORT", color: "#83dfa8", glyph: "+", dash: [3, 4] },
  FORTIFY: { kind: "FORTIFY", color: "#82aaff", glyph: "◇", dash: [2, 3] },
  HOLD: { kind: "HOLD", color: "#e6bd68", glyph: "H", dash: [] },
};

const ASSAULT_ACTIONS = new Set(["ATTACK", "ASSAULT", "BOMBARDMENT", "AIR_SUPPORT", "PLACE_DELAYED_CHARGE", "DETONATE_DELAYED_CHARGE"]);
const SUPPORT_ACTIONS = new Set(["RECRUIT_IRREGULAR", "HEAL", "REPAIR", "CREW_REPAIR", "RESUPPLY", "RELOAD", "LOAD", "UNLOAD", "AIRDROP", "LAND", "TAKE_OFF", "REARM_AEROSPACE"]);
const FORTIFY_ACTIONS = new Set(["DIG_IN", "ARTILLERY_DIG_IN", "CONSTRUCT", "SAPPER_CONSTRUCT", "TRENCH_UPGRADE", "DEPLOY", "PACK_UP", "GARRISON", "SCAN", "DEPLOY_DRONE"]);

function intentVisual(order: UnitOrder): IntentVisual {
  const actionTypes = [...order.actions, ...order.incidentalActions].map((action) => action.type);
  if (actionTypes.some((type) => ASSAULT_ACTIONS.has(type)) || order.orderType === "MELEE_CHARGE") return INTENT_VISUALS.ASSAULT;
  if (actionTypes.some((type) => SUPPORT_ACTIONS.has(type))) return INTENT_VISUALS.SUPPORT;
  if (actionTypes.some((type) => FORTIFY_ACTIONS.has(type))) return INTENT_VISUALS.FORTIFY;
  if (order.orderType === "HOLD" || order.route.length <= 1) return INTENT_VISUALS.HOLD;
  return INTENT_VISUALS.MANEUVER;
}

function intentActionLabel(order: UnitOrder): string | undefined {
  const action = order.actions[0] ?? order.incidentalActions[0];
  if (action?.type === "UNLOAD" && action.payload?.mode === "RAPPEL_GARRISON") return "RAPPEL GARRISON";
  return action?.type.replaceAll("_", " ");
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

function drawTerrainTexture(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  coord: AxialCoord,
  terrainId: string,
  visualTerrainId: string | undefined,
  connectedDirections: readonly number[],
  style: TacticalTerrainStyle,
  animationTime: number,
) {
  const profile = tacticalTerrainVisualProfile(terrainId, visualTerrainId);
  const { kind, motif } = profile;
  const seed = tacticalTerrainSeed(coord);
  ctx.save();
  polygon(ctx, point, 1.8);
  ctx.clip();

  const reliefX = point.x - 22 + (seed % 44);
  const reliefY = point.y - 18 + ((seed >>> 5) % 36);
  const relief = ctx.createRadialGradient(reliefX, reliefY, 2, reliefX, reliefY, 55);
  relief.addColorStop(0, `${style.highlight}50`);
  relief.addColorStop(.52, `${style.accent}18`);
  relief.addColorStop(1, `${style.shadow}58`);
  ctx.fillStyle = relief;
  ctx.fillRect(point.x - HEX_SIZE, point.y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2);

  ctx.globalAlpha = .085;
  ctx.strokeStyle = style.highlight;
  ctx.lineWidth = kind === "FOREST" ? 22 : kind === "MARSH" ? 16 : 12;
  for (const direction of connectedDirections) {
    const edge = hexEdgePoint(point, direction, HEX_SIZE + 3);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(edge.x, edge.y);
    ctx.stroke();
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "WATER_SHALLOW" || kind === "WATER_DEEP") {
    ctx.globalAlpha = kind === "WATER_SHALLOW" ? .58 : .42;
    ctx.strokeStyle = kind === "WATER_SHALLOW" ? style.detail : style.highlight;
    ctx.lineWidth = kind === "WATER_SHALLOW" ? 1.5 : 1.15;
    const waveCount = motif === "POND" ? 2 : motif === "DEEP_OCEAN" ? 3 : 4;
    const drift = animationTime === 0 ? 0 : Math.sin(animationTime / 850 + (seed % 19)) * 3.2;
    for (let index = 0; index < waveCount; index += 1) {
      const y = point.y - 22 + index * (44 / Math.max(1, waveCount - 1)) + drift + ((seed >>> (index * 4)) % 5);
      const bend = 2 + ((seed >>> (index * 6 + 2)) % 5);
      ctx.beginPath();
      ctx.moveTo(point.x - 39, y);
      ctx.bezierCurveTo(point.x - 17, y - bend, point.x + 9, y + bend, point.x + 39, y - 1);
      ctx.stroke();
    }
    if (motif === "RAPIDS") {
      ctx.globalAlpha = .82;
      ctx.strokeStyle = style.contour;
      ctx.lineWidth = 1.8;
      for (let index = -2; index <= 2; index += 1) {
        const x = point.x + index * 14;
        const y = point.y + ((seed >>> (index + 4)) % 9) - 4;
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 5);
        ctx.lineTo(x, y);
        ctx.lineTo(x - 6, y + 5);
        ctx.stroke();
      }
    } else if (kind === "WATER_SHALLOW") {
      ctx.globalAlpha = .5;
      ctx.fillStyle = style.contour;
      const shoalCount = motif === "COAST" || motif === "COASTAL" ? 5 : motif === "POND" ? 1 : 3;
      for (let index = 0; index < shoalCount; index += 1) {
        const x = point.x - 22 + ((seed >>> (index * 7 + 1)) % 44);
        const y = point.y - 16 + ((seed >>> (index * 5 + 3)) % 32);
        ctx.beginPath();
        ctx.ellipse(x, y, 5 + (index % 2) * 2, 1.2, -.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === "FOREST") {
    const conifer = motif === "PINE" || motif === "TAIGA";
    const dense = motif === "DENSE_FOREST" || motif === "JUNGLE" || motif === "RAINFOREST";
    const treeCount = dense ? 8 : motif === "DECIDUOUS" ? 6 : 5;
    for (let index = 0; index < treeCount; index += 1) {
      const angle = (index / treeCount) * Math.PI * 2 + ((seed >>> (index * 3)) % 28) / 20;
      const distance = index === 0 ? 2 : 12 + ((seed >>> (index * 4 + 2)) % 13);
      const radius = (dense ? 7 : 6) + ((seed >>> (index * 2 + 1)) % 4);
      const x = point.x + Math.cos(angle) * distance;
      const y = point.y + Math.sin(angle) * distance * .72;
      ctx.globalAlpha = .38;
      ctx.fillStyle = style.shadow;
      ctx.beginPath();
      ctx.ellipse(x + 2.5, y + 3, radius * 1.06, radius * .84, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = .72;
      ctx.fillStyle = index % 2 === 0 ? style.accent : style.detail;
      ctx.beginPath();
      if (conifer) {
        ctx.moveTo(x, y - radius * 1.15);
        ctx.lineTo(x - radius, y + radius * .72);
        ctx.lineTo(x + radius, y + radius * .72);
        ctx.closePath();
      } else if (motif === "JUNGLE" || motif === "RAINFOREST") {
        for (let lobe = 0; lobe < 8; lobe += 1) {
          const lobeAngle = lobe * Math.PI / 4;
          const lobeRadius = lobe % 2 === 0 ? radius : radius * .72;
          const px = x + Math.cos(lobeAngle) * lobeRadius;
          const py = y + Math.sin(lobeAngle) * lobeRadius * .8;
          if (lobe === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else {
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = .48;
      ctx.strokeStyle = style.highlight;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (conifer) {
        ctx.moveTo(x, y - radius * .75);
        ctx.lineTo(x - radius * .54, y + radius * .35);
        ctx.lineTo(x + radius * .54, y + radius * .35);
      } else {
        ctx.arc(x - 1, y - 1, radius - 2, Math.PI * 1.08, Math.PI * 1.78);
      }
      ctx.stroke();
    }
  } else if (kind === "RIDGE") {
    for (let index = 0; index < 2; index += 1) {
      const y = point.y - 10 + index * 19 + ((seed >>> (index * 5)) % 5);
      const rise = 8 + ((seed >>> (index * 4 + 2)) % 5);
      const traceRidge = () => {
        ctx.beginPath();
        ctx.moveTo(point.x - 38, y + 5);
        ctx.lineTo(point.x - 22, y - rise * .45);
        ctx.lineTo(point.x - 8, y + 1);
        ctx.lineTo(point.x + 7, y - rise);
        ctx.lineTo(point.x + 22, y + 2);
        ctx.lineTo(point.x + 38, y - 4);
      };
      ctx.globalAlpha = .5;
      ctx.strokeStyle = style.shadow;
      ctx.lineWidth = 6;
      traceRidge();
      ctx.stroke();
      ctx.globalAlpha = .82;
      ctx.strokeStyle = style.detail;
      ctx.lineWidth = 2.5;
      traceRidge();
      ctx.stroke();
      ctx.globalAlpha = .72;
      ctx.strokeStyle = style.contour;
      ctx.lineWidth = .9;
      ctx.beginPath();
      ctx.moveTo(point.x - 21, y - rise * .45);
      ctx.lineTo(point.x - 8, y + 1);
      ctx.lineTo(point.x + 7, y - rise);
      ctx.stroke();
    }
    if (["MOUNTAIN", "MOUNTAINS", "MOUNTAIN_PEAK", "VOLCANO", "MESA"].includes(motif)) {
      const peakX = point.x - 5 + (seed % 11);
      const peakY = point.y - 3 + ((seed >>> 5) % 7);
      for (let ring = 3; ring >= 1; ring -= 1) {
        ctx.globalAlpha = .34 + (3 - ring) * .14;
        ctx.strokeStyle = ring === 1 ? style.contour : style.detail;
        ctx.lineWidth = ring === 1 ? 1.8 : 1.15;
        ctx.beginPath();
        ctx.ellipse(peakX, peakY, ring * 10 + 4, ring * 7 + 3, -.18, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (motif === "VOLCANO") {
        ctx.globalAlpha = .92;
        ctx.fillStyle = style.shadow;
        ctx.beginPath();
        ctx.ellipse(peakX, peakY, 7, 4.5, -.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(222, 111, 65, .82)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (motif === "MOUNTAIN_PEAK") {
        ctx.globalAlpha = .86;
        ctx.fillStyle = style.contour;
        ctx.beginPath();
        ctx.arc(peakX, peakY, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (motif === "CLIFFS") {
      ctx.globalAlpha = .72;
      ctx.strokeStyle = style.contour;
      ctx.lineWidth = 1.4;
      for (let offset = -24; offset <= 24; offset += 8) {
        ctx.beginPath();
        ctx.moveTo(point.x + offset, point.y - 23);
        ctx.lineTo(point.x + offset - 5, point.y + 24);
        ctx.stroke();
      }
    }
  } else if (kind === "MARSH") {
    ctx.globalAlpha = .68;
    const poolCount = motif === "BOG" ? 5 : motif === "FLOODPLAIN" ? 2 : 3;
    for (let index = 0; index < poolCount; index += 1) {
      const x = point.x - 17 + ((seed >>> (index * 5)) % 34);
      const y = point.y - 13 + ((seed >>> (index * 6 + 2)) % 26);
      const width = 7 + index * 2 + ((seed >>> (index * 3 + 1)) % 4);
      ctx.fillStyle = motif === "ASH_MARSH"
        ? "rgba(58, 60, 57, .82)"
        : motif === "BOG"
          ? "rgba(24, 48, 45, .84)"
          : index === 1 ? "rgba(50, 78, 72, .78)" : "rgba(43, 66, 59, .72)";
      ctx.beginPath();
      ctx.ellipse(x, y, width, 2.8 + (index % 2), -.2 + index * .13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(153, 176, 139, .48)";
      ctx.lineWidth = .9;
      ctx.stroke();
    }
    if ((seed & 1) === 0 || motif === "FLOODPLAIN" || motif === "MANGROVE") {
      const channelY = point.y - 4 + (seed % 9);
      const traceChannel = () => {
        ctx.beginPath();
        ctx.moveTo(point.x - 39, channelY + 3);
        ctx.bezierCurveTo(point.x - 16, channelY - 8, point.x + 10, channelY + 9, point.x + 39, channelY - 4);
      };
      ctx.globalAlpha = .55;
      ctx.strokeStyle = "rgba(35, 57, 53, .9)";
      ctx.lineWidth = 4.5;
      traceChannel();
      ctx.stroke();
      ctx.globalAlpha = .48;
      ctx.strokeStyle = "rgba(105, 139, 127, .9)";
      ctx.lineWidth = 1.2;
      traceChannel();
      ctx.stroke();
    }
    if (motif === "MANGROVE") {
      ctx.globalAlpha = .78;
      ctx.strokeStyle = style.shadow;
      ctx.lineWidth = 1.4;
      for (const offset of [-18, 0, 18]) {
        const baseY = point.y + 8 + ((seed >>> (offset & 7)) % 5);
        ctx.beginPath();
        ctx.arc(point.x + offset, baseY - 9, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.moveTo(point.x + offset, baseY - 4);
        ctx.lineTo(point.x + offset - 6, baseY + 5);
        ctx.moveTo(point.x + offset, baseY - 4);
        ctx.lineTo(point.x + offset + 6, baseY + 5);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = .82;
    ctx.strokeStyle = style.detail;
    ctx.lineWidth = 1.5;
    for (const offset of [-18, -6, 7, 19]) {
      const y = point.y + 9 + ((seed >>> (offset & 7)) % 7);
      ctx.beginPath();
      ctx.moveTo(point.x + offset, y);
      ctx.lineTo(point.x + offset - 2, y - 8);
      ctx.moveTo(point.x + offset, y);
      ctx.lineTo(point.x + offset + 3, y - 6);
      ctx.stroke();
    }
  } else if (kind === "ARID") {
    ctx.globalAlpha = .5;
    ctx.strokeStyle = style.contour;
    ctx.lineWidth = 1.5;
    const duneCount = motif === "DUNES" ? 4 : ["DESERT", "ARID", "BEACH"].includes(motif) ? 3 : 1;
    for (let index = 0; index < duneCount; index += 1) {
      const y = point.y - 19 + index * 18 + ((seed >>> (index * 4)) % 5);
      ctx.beginPath();
      ctx.moveTo(point.x - 40, y + 4);
      ctx.bezierCurveTo(point.x - 18, y - 10, point.x + 4, y + 10, point.x + 40, y - 3);
      ctx.stroke();
    }
    ctx.globalAlpha = .65;
    ctx.fillStyle = style.shadow;
    for (let index = 0; index < 3; index += 1) {
      const x = point.x - 22 + ((seed >>> (index * 6 + 2)) % 44);
      const y = point.y - 13 + ((seed >>> (index * 5 + 4)) % 30);
      ctx.beginPath();
      ctx.ellipse(x, y, 2.5 + index, 1.8 + index * .4, .2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (motif === "CRATER") {
      ctx.globalAlpha = .82;
      ctx.fillStyle = `${style.shadow}b8`;
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, 22, 16, -.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = style.contour;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.globalAlpha = .55;
      ctx.beginPath();
      ctx.ellipse(point.x - 2, point.y - 1, 12, 8, -.2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (motif === "CANYON") {
      const traceCanyon = () => {
        ctx.beginPath();
        ctx.moveTo(point.x - 42, point.y + 18);
        ctx.bezierCurveTo(point.x - 20, point.y - 25, point.x + 12, point.y + 22, point.x + 42, point.y - 19);
      };
      ctx.globalAlpha = .8;
      ctx.strokeStyle = style.shadow;
      ctx.lineWidth = 11;
      traceCanyon();
      ctx.stroke();
      ctx.globalAlpha = .64;
      ctx.strokeStyle = style.detail;
      ctx.lineWidth = 2;
      traceCanyon();
      ctx.stroke();
    } else if (motif === "SALT_FLAT") {
      ctx.globalAlpha = .72;
      ctx.strokeStyle = style.contour;
      ctx.lineWidth = 1;
      for (let index = 0; index < 5; index += 1) {
        const x = point.x - 28 + index * 14;
        ctx.beginPath();
        ctx.moveTo(x, point.y - 27);
        ctx.lineTo(x + (index % 2 === 0 ? 8 : -7), point.y - 5);
        ctx.lineTo(x - 4, point.y + 11);
        ctx.lineTo(x + 6, point.y + 27);
        ctx.stroke();
      }
    } else if (motif === "MESA" || motif === "BADLANDS") {
      ctx.globalAlpha = .7;
      ctx.strokeStyle = style.contour;
      ctx.lineWidth = 1.8;
      for (let ring = 3; ring >= 1; ring -= 1) {
        ctx.beginPath();
        const radius = ring * 9;
        for (let corner = 0; corner < 6; corner += 1) {
          const angle = corner * Math.PI / 3 + .15;
          const x = point.x + Math.cos(angle) * radius;
          const y = point.y + Math.sin(angle) * radius * .68;
          if (corner === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    } else if (motif === "BURNT_FOREST") {
      ctx.globalAlpha = .84;
      ctx.fillStyle = style.shadow;
      ctx.strokeStyle = style.shadow;
      ctx.lineWidth = 1.4;
      for (const offset of [-19, -5, 12, 23]) {
        const y = point.y + ((seed >>> (offset & 7)) % 25) - 12;
        ctx.beginPath();
        ctx.arc(point.x + offset, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.moveTo(point.x + offset, y);
        ctx.lineTo(point.x + offset - 7, y - 5);
        ctx.moveTo(point.x + offset, y);
        ctx.lineTo(point.x + offset + 6, y + 5);
        ctx.stroke();
      }
    } else if (motif === "BEACH") {
      ctx.globalAlpha = .7;
      ctx.fillStyle = style.contour;
      for (let index = 0; index < 14; index += 1) {
        const x = point.x - 31 + ((seed >>> (index % 16)) % 63);
        const y = point.y - 23 + ((seed >>> ((index + 5) % 16)) % 47);
        ctx.beginPath();
        ctx.arc(x, y, .8 + (index % 3) * .35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === "COLD") {
    const frozenWater = motif === "FROZEN_LAKE" || motif === "ICE_WATER";
    ctx.globalAlpha = .52;
    ctx.strokeStyle = style.contour;
    ctx.lineWidth = frozenWater ? 1.7 : 1.3;
    const driftCount = motif === "SNOWFIELD" || motif === "ICE_CAP" ? 4 : frozenWater ? 2 : 3;
    for (let index = 0; index < driftCount; index += 1) {
      const y = point.y - 21 + index * 19 + ((seed >>> (index * 5)) % 4);
      ctx.beginPath();
      ctx.moveTo(point.x - 39, y);
      ctx.bezierCurveTo(point.x - 12, y - 6, point.x + 13, y + 6, point.x + 39, y - 2);
      ctx.stroke();
    }
    ctx.globalAlpha = .58;
    ctx.strokeStyle = style.shadow;
    ctx.lineWidth = 1;
    const crackX = point.x - 7 + (seed % 15);
    const crackY = point.y - 8 + ((seed >>> 5) % 12);
    ctx.beginPath();
    ctx.moveTo(crackX - 9, crackY - 7);
    ctx.lineTo(crackX - 2, crackY - 1);
    ctx.lineTo(crackX - 6, crackY + 7);
    ctx.moveTo(crackX - 2, crackY - 1);
    ctx.lineTo(crackX + 9, crackY + 5);
    ctx.stroke();
    if (motif === "GLACIER" || motif === "ICE_CAP" || frozenWater) {
      ctx.globalAlpha = frozenWater ? .78 : .62;
      ctx.strokeStyle = style.highlight;
      ctx.lineWidth = 1.2;
      for (let index = -2; index <= 2; index += 1) {
        const x = point.x + index * 14;
        ctx.beginPath();
        ctx.moveTo(x - 6, point.y - 30);
        ctx.lineTo(x + 3, point.y - 9);
        ctx.lineTo(x - 4, point.y + 8);
        ctx.lineTo(x + 7, point.y + 30);
        ctx.stroke();
      }
    } else if (motif === "TUNDRA" || motif === "COLD") {
      ctx.globalAlpha = .72;
      ctx.strokeStyle = style.detail;
      ctx.lineWidth = 1.2;
      for (const offset of [-24, -9, 8, 23]) {
        const y = point.y + 8 + ((seed >>> (offset & 7)) % 12);
        ctx.beginPath();
        ctx.moveTo(point.x + offset - 3, y);
        ctx.lineTo(point.x + offset, y - 5);
        ctx.lineTo(point.x + offset + 3, y);
        ctx.stroke();
      }
    }
  } else if (kind === "URBAN") {
    ctx.globalAlpha = .72;
    ctx.fillStyle = style.shadow;
    ctx.strokeStyle = style.detail;
    ctx.lineWidth = 1;
    const blocks = [
      [-28, -20, 18, 14], [3, -23, 24, 16], [-31, 5, 23, 18], [7, 4, 21, 21],
    ] as const;
    for (const [x, y, width, height] of blocks) {
      ctx.beginPath();
      ctx.rect(point.x + x, point.y + y, width, height);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = .42;
    ctx.strokeStyle = style.contour;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(point.x - 42, point.y);
    ctx.lineTo(point.x + 42, point.y);
    ctx.moveTo(point.x, point.y - 38);
    ctx.lineTo(point.x, point.y + 38);
    ctx.stroke();
  } else {
    ctx.globalAlpha = .32;
    ctx.strokeStyle = style.contour;
    ctx.lineWidth = 1.2;
    for (let index = 0; index < 3; index += 1) {
      const y = point.y - 20 + index * 17 + ((seed >>> (index * 5)) % 5);
      const bend = ((seed >>> (index * 7 + 3)) % 13) - 6;
      ctx.beginPath();
      ctx.moveTo(point.x - 38, y);
      ctx.bezierCurveTo(point.x - 14, y + bend, point.x + 12, y - bend, point.x + 38, y + bend / 2);
      ctx.stroke();
    }
    ctx.globalAlpha = .7;
    ctx.strokeStyle = style.detail;
    ctx.lineWidth = 1.4;
    const tuftCount = 1 + (seed % 4);
    for (let index = 0; index < tuftCount; index += 1) {
      const offset = -20 + ((seed >>> (index * 5 + 1)) % 41);
      const y = point.y + 1 + ((seed >>> (index * 4 + 3)) % 19);
      ctx.beginPath();
      ctx.moveTo(point.x + offset - 3, y);
      ctx.lineTo(point.x + offset, y - 5);
      ctx.lineTo(point.x + offset + 3, y);
      ctx.stroke();
    }
    if (motif === "FARMLAND") {
      ctx.globalAlpha = .58;
      ctx.strokeStyle = style.shadow;
      ctx.lineWidth = 2;
      for (let offset = -28; offset <= 28; offset += 8) {
        ctx.beginPath();
        ctx.moveTo(point.x + offset, point.y - 31);
        ctx.lineTo(point.x + offset + 12, point.y + 31);
        ctx.stroke();
      }
    } else if (motif === "VALLEY") {
      ctx.globalAlpha = .58;
      ctx.strokeStyle = style.shadow;
      for (let ring = 3; ring >= 1; ring -= 1) {
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(point.x, point.y, ring * 13, ring * 8, -.14, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (motif === "SAVANNA") {
      ctx.globalAlpha = .78;
      ctx.fillStyle = style.shadow;
      ctx.strokeStyle = style.detail;
      ctx.lineWidth = 1.3;
      for (const offset of [-20, 15]) {
        const y = point.y + (offset > 0 ? 8 : -6);
        ctx.beginPath();
        ctx.ellipse(point.x + offset, y, 9, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (motif === "SCRUB" || motif === "HEATH") {
      ctx.globalAlpha = .72;
      ctx.fillStyle = style.shadow;
      for (let index = 0; index < 7; index += 1) {
        const x = point.x - 27 + ((seed >>> (index * 3)) % 54);
        const y = point.y - 19 + ((seed >>> (index * 4 + 2)) % 38);
        ctx.beginPath();
        ctx.ellipse(x, y, 3.8, 2.4, .2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (motif === "MEADOW" || motif === "GLADE") {
      ctx.globalAlpha = .74;
      ctx.fillStyle = style.contour;
      for (let index = 0; index < 9; index += 1) {
        const x = point.x - 30 + ((seed >>> (index % 15)) % 60);
        const y = point.y - 22 + ((seed >>> ((index + 6) % 15)) % 44);
        ctx.beginPath();
        ctx.arc(x, y, motif === "MEADOW" ? 1.15 : .75, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (motif === "PLAINS" || motif === "STEPPE") {
      ctx.globalAlpha = .46;
      ctx.strokeStyle = style.shadow;
      ctx.lineWidth = 1;
      for (let offset = -24; offset <= 24; offset += 12) {
        ctx.beginPath();
        ctx.moveTo(point.x + offset, point.y - 29);
        ctx.lineTo(point.x + offset + 7, point.y + 29);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawTerrainTileFill(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  style: TacticalTerrainStyle,
) {
  const fill = ctx.createLinearGradient(point.x - 28, point.y + 30, point.x + 25, point.y - 32);
  fill.addColorStop(0, style.accent);
  fill.addColorStop(.48, style.fill);
  fill.addColorStop(1, `${style.highlight}d8`);
  ctx.fillStyle = fill;
  ctx.fill();
}

function traceHexSide(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  direction: number,
  radius: number,
) {
  const centerAngle = -Math.PI / 2 + direction * Math.PI / 3;
  const startAngle = centerAngle - Math.PI / 6;
  const endAngle = centerAngle + Math.PI / 6;
  ctx.beginPath();
  ctx.moveTo(point.x + Math.cos(startAngle) * radius, point.y + Math.sin(startAngle) * radius);
  ctx.lineTo(point.x + Math.cos(endAngle) * radius, point.y + Math.sin(endAngle) * radius);
}

function drawCoastline(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  directions: readonly number[],
) {
  ctx.save();
  ctx.lineCap = "round";
  for (const direction of directions) {
    traceHexSide(ctx, point, direction, HEX_SIZE - 1.6);
    ctx.strokeStyle = "rgba(4, 20, 22, .86)";
    ctx.lineWidth = 6.5;
    ctx.stroke();
    traceHexSide(ctx, point, direction, HEX_SIZE - 3.2);
    ctx.strokeStyle = "rgba(205, 191, 139, .58)";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    traceHexSide(ctx, point, direction, HEX_SIZE - 5.4);
    ctx.strokeStyle = "rgba(237, 220, 163, .18)";
    ctx.lineWidth = .8;
    ctx.stroke();
  }
  ctx.restore();
}

function drawTerrainBoundaries(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  directions: readonly number[],
  style: TacticalTerrainStyle,
) {
  ctx.save();
  ctx.lineCap = "round";
  for (const direction of directions) {
    traceHexSide(ctx, point, direction, HEX_SIZE - 2.6);
    ctx.strokeStyle = `${style.accent}54`;
    ctx.lineWidth = 3;
    ctx.stroke();
    traceHexSide(ctx, point, direction, HEX_SIZE - 4.1);
    ctx.strokeStyle = `${style.contour}32`;
    ctx.lineWidth = .9;
    ctx.stroke();
  }
  ctx.restore();
}

function drawChartWaterHex(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  coord: AxialCoord,
  depth: TacticalWaterDepth,
) {
  polygon(ctx, point, 1.25);
  const water = ctx.createLinearGradient(point.x - 24, point.y + 28, point.x + 24, point.y - 28);
  water.addColorStop(0, depth === 1 ? "rgba(20, 57, 59, .96)" : WATER_FILL[depth]);
  water.addColorStop(1, depth === 1 ? "rgba(54, 91, 85, .96)" : depth === 2 ? "rgba(29, 64, 67, .94)" : "rgba(15, 42, 49, .92)");
  ctx.fillStyle = water;
  ctx.fill();
  polygon(ctx, point, 1.25);
  ctx.strokeStyle = WATER_STROKE[depth];
  ctx.lineWidth = .65;
  ctx.stroke();
  const seed = tacticalTerrainSeed(coord, 0x0cea + depth);
  ctx.save();
  polygon(ctx, point, 3);
  ctx.clip();
  ctx.strokeStyle = depth === 1 ? "rgba(135, 181, 171, .2)" : "rgba(91, 145, 151, .12)";
  ctx.lineWidth = 1;
  for (let index = 0; index < (depth === 1 ? 3 : 2); index += 1) {
    const y = point.y - 14 + index * 12 + (seed % 6);
    ctx.beginPath();
    ctx.moveTo(point.x - 31, y);
    const bend = 2 + ((seed >>> (index * 4)) % 4);
    ctx.bezierCurveTo(point.x - 10, y - bend, point.x + 10, y + bend, point.x + 31, y);
    ctx.stroke();
  }
  ctx.restore();
}

function hexEdgePoint(point: { x: number; y: number }, direction: number, radius = HEX_SIZE - 3) {
  const angle = -Math.PI / 2 + direction * Math.PI / 3;
  return { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius };
}

function drawHexEdges(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  directions: readonly number[],
  kind: "ROAD" | "PATH" | "RIVER" | "BRIDGE" | "WALL",
) {
  const uniqueDirections = [...new Set(directions)];
  if (uniqueDirections.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const direction of uniqueDirections) {
    const edge = hexEdgePoint(point, direction);
    if (kind === "WALL") {
      traceHexSide(ctx, point, direction, HEX_SIZE - 4);
      ctx.strokeStyle = "rgba(25, 31, 30, .92)";
      ctx.lineWidth = 7;
      ctx.stroke();
      traceHexSide(ctx, point, direction, HEX_SIZE - 5);
      ctx.strokeStyle = "rgba(181, 173, 144, .94)";
      ctx.lineWidth = 3.2;
      ctx.stroke();
      traceHexSide(ctx, point, direction, HEX_SIZE - 6.2);
      ctx.strokeStyle = "rgba(229, 213, 168, .55)";
      ctx.lineWidth = .8;
      ctx.stroke();
      continue;
    }
    if (kind === "RIVER") {
      traceHexSide(ctx, point, direction, HEX_SIZE - 5);
      ctx.strokeStyle = "rgba(8, 27, 30, .8)";
      ctx.lineWidth = 8;
      ctx.stroke();
      traceHexSide(ctx, point, direction, HEX_SIZE - 5);
      ctx.strokeStyle = "rgba(82, 163, 174, .88)";
      ctx.lineWidth = 4;
      ctx.stroke();
      traceHexSide(ctx, point, direction, HEX_SIZE - 5.6);
      ctx.strokeStyle = "rgba(179, 220, 211, .42)";
      ctx.lineWidth = 1;
      ctx.stroke();
      continue;
    }
    if (kind === "BRIDGE") {
      const inner = hexEdgePoint(point, direction, HEX_SIZE - 18);
      const outer = hexEdgePoint(point, direction, HEX_SIZE + 2);
      const traceBridge = () => {
        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(outer.x, outer.y);
      };
      traceBridge();
      ctx.strokeStyle = "rgba(27, 29, 25, .92)";
      ctx.lineWidth = 11;
      ctx.stroke();
      traceBridge();
      ctx.strokeStyle = "rgba(185, 151, 93, .98)";
      ctx.lineWidth = 7;
      ctx.stroke();
      const dx = outer.x - inner.x;
      const dy = outer.y - inner.y;
      const length = Math.hypot(dx, dy);
      const normalX = length > 0 ? -dy / length : 0;
      const normalY = length > 0 ? dx / length : 0;
      ctx.strokeStyle = "rgba(239, 215, 164, .82)";
      ctx.lineWidth = 1.1;
      for (const progress of [.2, .4, .6, .8]) {
        const x = inner.x + dx * progress;
        const y = inner.y + dy * progress;
        ctx.beginPath();
        ctx.moveTo(x - normalX * 4, y - normalY * 4);
        ctx.lineTo(x + normalX * 4, y + normalY * 4);
        ctx.stroke();
      }
      continue;
    }
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(edge.x, edge.y);
    };
    if (kind === "PATH") {
      trace();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(231, 214, 162, .78)";
      ctx.lineWidth = 2;
    } else {
      trace();
      ctx.strokeStyle = "rgba(33, 31, 24, .72)";
      ctx.lineWidth = 5;
      ctx.stroke();
      trace();
      ctx.strokeStyle = "rgba(205, 185, 132, .72)";
      ctx.lineWidth = 2.2;
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawAuthoredMapFeature(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  structureIds: readonly string[],
): boolean {
  const has = (definitionId: string) => structureIds.some((id) =>
    id === definitionId || id.startsWith(`${definitionId}:`)
  );
  const city = has("structure-custom-city");
  const town = has("structure-custom-town");
  const outpost = has("structure-custom-outpost");
  const airfield = has("structure-custom-airfield");
  const radar = has("structure-sensor-tower");
  if (!city && !town && !outpost && !airfield && !radar) return false;

  ctx.save();
  ctx.translate(point.x, point.y - 3);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (airfield) {
    ctx.save();
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = "rgba(27, 38, 39, .92)";
    ctx.strokeStyle = "rgba(223, 202, 146, .92)";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.roundRect(-8, -31, 16, 62, 3);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(228, 223, 187, .78)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(0, 25);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(87, 121, 111, .95)";
    ctx.fillRect(11, -12, 13, 24);
    ctx.restore();
  }

  if (city || town) {
    const footprints: readonly (readonly [number, number, number, number])[] = city
      ? [[-26, -21, 15, 16], [-6, -24, 19, 19], [17, -17, 12, 15], [-22, 6, 19, 15], [3, 4, 24, 18]]
      : [[-19, -14, 17, 16], [5, -18, 19, 17], [-8, 6, 22, 16]];
    ctx.fillStyle = "rgba(21, 31, 32, .93)";
    ctx.strokeStyle = city ? "rgba(226, 203, 143, .9)" : "rgba(198, 190, 146, .88)";
    ctx.lineWidth = 1.5;
    for (const [x, y, width, height] of footprints) {
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(104, 218, 204, .58)";
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + width - 4, y + 4);
      ctx.stroke();
      ctx.strokeStyle = city ? "rgba(226, 203, 143, .9)" : "rgba(198, 190, 146, .88)";
    }
  }

  if (outpost) {
    ctx.fillStyle = "rgba(20, 34, 35, .94)";
    ctx.strokeStyle = "rgba(226, 198, 131, .95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-20, -18, 40, 36);
    ctx.fill();
    ctx.stroke();
    const towers: readonly (readonly [number, number])[] = [[-20, -18], [20, -18], [-20, 18], [20, 18]];
    for (const [x, y] of towers) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(99, 217, 202, .82)";
    ctx.fillRect(-4, -6, 8, 12);
  }

  if (radar) {
    ctx.strokeStyle = "rgba(123, 229, 217, .95)";
    ctx.fillStyle = "rgba(11, 31, 35, .92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = .72;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = .9;
    ctx.fillStyle = "rgba(84, 186, 176, .7)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 19, -Math.PI * .72, -Math.PI * .28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(224, 211, 159, .95)";
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  return true;
}

function deploymentVisual(deployment: CampaignDeployment) {
  return resolveUnitVisual({
    definitionId: deployment.definitionId,
    side: deployment.side,
    tags: [
      ...(deployment.tags ?? []),
      ...deployment.weapons.flatMap((weapon) => weapon.tags),
      ...(deployment.abilities ?? []).map((ability) => ability.abilityId.toUpperCase()),
      ...(deployment.movementProfile ? [deployment.movementProfile.mode] : []),
      ...(deployment.durabilityProfile ? [deployment.durabilityProfile.model] : []),
      ...deployment.statuses,
    ],
  });
}

function drawUnitGlyph(
  ctx: CanvasRenderingContext2D,
  deployment: CampaignDeployment,
  point: { x: number; y: number },
  color: string,
) {
  const visual = deploymentVisual(deployment);
  ctx.save();
  ctx.translate(point.x - 9, point.y - 11);
  ctx.scale(0.56, 0.56);
  ctx.strokeStyle = color;
  ctx.fillStyle = "none";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(TACTICAL_UNIT_GLYPH_PATHS[visual.tacticalGlyph]));
  ctx.restore();
}

function tacticalSpriteSize(deployment: CampaignDeployment): number {
  switch (deploymentVisual(deployment).tacticalGlyph) {
    case "INFANTRY":
    case "MEDIC":
    case "ENGINEER": return 32;
    case "ARTILLERY":
    case "LOGISTICS":
    case "RECON": return 36;
    case "IFV":
    case "TANK":
    case "MECH": return 42;
    case "VTOL":
    case "FIGHTER":
    case "BOMBER":
    case "TRANSPORT": return 46;
    default: return 34;
  }
}

function drawSpriteBase(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  radius: number,
  allied: boolean,
  selected: boolean,
  targeted: boolean,
  commandColor: string,
  facing: number,
) {
  const color = selected ? "#d8fffa" : targeted ? "#ffb19e" : allied ? commandColor : "#e36d53";
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.fillStyle = allied ? "rgba(7, 31, 34, .78)" : "rgba(58, 19, 16, .76)";
  ctx.strokeStyle = color;
  ctx.lineWidth = selected || targeted ? 2 : 1.15;
  ctx.shadowColor = color;
  ctx.shadowBlur = selected || targeted ? 9 : 3;
  ctx.beginPath();
  ctx.ellipse(0, radius * .18, radius, radius * .52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.save();
  ctx.rotate((Math.PI / 3) * facing);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -radius * 1.08);
  ctx.lineTo(-radius * .18, -radius * .68);
  ctx.lineTo(radius * .18, -radius * .68);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (selected || targeted) {
    ctx.setLineDash([3, 2]);
    ctx.globalAlpha = .82;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTacticalSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frame: number,
  point: { x: number; y: number },
  facing: number,
  size: number,
  state: TacticalSpriteState,
  elapsedMs: number,
  reducedMotion: boolean,
  allied: boolean,
  groupMember: ReturnType<typeof tacticalSpriteGroupLayout>[number],
) {
  const motion = tacticalSpriteMotion(state, elapsedMs, reducedMotion);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate((Math.PI / 3) * facing);
  ctx.translate(motion.translateX, motion.translateY);
  ctx.rotate(motion.rotation);
  ctx.scale(motion.scale, motion.scale);
  ctx.translate(groupMember.x * size, groupMember.y * size);
  ctx.rotate(groupMember.rotation);
  ctx.scale(groupMember.scale, groupMember.scale);
  ctx.globalAlpha = motion.opacity * .94;
  ctx.filter = allied
    ? "saturate(.72) sepia(.18) hue-rotate(118deg) contrast(1.14) brightness(.91)"
    : "saturate(.78) sepia(.32) hue-rotate(326deg) contrast(1.17) brightness(.88)";
  ctx.drawImage(
    image,
    frame * SPRITE_FRAME_SIZE,
    0,
    SPRITE_FRAME_SIZE,
    SPRITE_FRAME_SIZE,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  ctx.restore();
}

function drawObjectiveMarker(
  ctx: CanvasRenderingContext2D,
  objective: CampaignView["objectives"][number],
  point: { x: number; y: number },
  primaryObjectiveId: string | undefined,
  zoom: number,
  elapsedMs: number,
  reducedMotion: boolean,
) {
  const visual = tacticalObjectiveVisual(objective, primaryObjectiveId);
  const pulse = visual.primary && objective.status === "ACTIVE" && !reducedMotion
    ? (Math.sin(elapsedMs / 260) + 1) * .9
    : 0;
  const badgeY = -visual.radius;

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.globalAlpha = visual.opacity;
  ctx.strokeStyle = visual.color;
  ctx.lineWidth = visual.primary ? 2.2 : 1.6;
  ctx.shadowColor = visual.color;
  ctx.shadowBlur = visual.primary ? 7 : 3;
  ctx.setLineDash([...visual.ringDash]);
  ctx.beginPath();
  ctx.arc(0, 0, visual.radius + pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  ctx.globalAlpha = visual.opacity * .48;
  ctx.lineWidth = 3.4;
  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 2 * index - Math.PI / 4;
    ctx.beginPath();
    ctx.arc(0, 0, visual.radius - 3, angle - .18, angle + .18);
    ctx.stroke();
  }
  if (visual.primary) {
    ctx.globalAlpha = visual.opacity * .28;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, visual.radius + 4 + pulse, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = visual.opacity;
  ctx.fillStyle = visual.fill;
  ctx.strokeStyle = visual.color;
  ctx.lineWidth = visual.primary ? 2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(-3.5, badgeY + visual.badgeRadius - 1);
  ctx.lineTo(0, badgeY + visual.badgeRadius + 5);
  ctx.lineTo(3.5, badgeY + visual.badgeRadius - 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, badgeY, visual.badgeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = visual.iconColor;
  ctx.fillStyle = visual.iconColor;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (visual.icon === "SECURED") {
    ctx.beginPath();
    ctx.moveTo(-4, badgeY);
    ctx.lineTo(-1, badgeY + 3);
    ctx.lineTo(5, badgeY - 4);
    ctx.stroke();
  } else if (visual.icon === "FAILED") {
    ctx.beginPath();
    ctx.moveTo(-4, badgeY - 4);
    ctx.lineTo(4, badgeY + 4);
    ctx.moveTo(4, badgeY - 4);
    ctx.lineTo(-4, badgeY + 4);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, badgeY, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, badgeY);
    ctx.lineTo(-2, badgeY);
    ctx.moveTo(2, badgeY);
    ctx.lineTo(6, badgeY);
    ctx.moveTo(0, badgeY - 6);
    ctx.lineTo(0, badgeY - 2);
    ctx.moveTo(0, badgeY + 2);
    ctx.lineTo(0, badgeY + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, badgeY, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (visual.primary) {
    ctx.fillStyle = visual.color;
    ctx.beginPath();
    ctx.moveTo(0, badgeY - visual.badgeRadius - 6);
    ctx.lineTo(-4, badgeY - visual.badgeRadius - 1);
    ctx.lineTo(4, badgeY - visual.badgeRadius - 1);
    ctx.closePath();
    ctx.fill();
  }

  if (zoom > .7) {
    ctx.font = `bold ${visual.primary ? 7 : 6.5}px ui-monospace, SFMono-Regular, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const nameWidth = Math.max(42, ctx.measureText(visual.nameLabel).width + 12);
    const nameY = badgeY - visual.badgeRadius - (visual.primary ? 18 : 11);
    ctx.fillStyle = "rgba(3, 12, 15, .92)";
    ctx.strokeStyle = visual.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-nameWidth / 2, nameY - 7, nameWidth, 14, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = visual.color;
    ctx.fillText(visual.nameLabel, 0, nameY + .5);

    if (zoom > 1.05) {
      ctx.font = "bold 5px ui-monospace, SFMono-Regular, monospace";
      const detailWidth = ctx.measureText(visual.detailLabel).width + 10;
      ctx.fillStyle = "rgba(3, 12, 15, .88)";
      ctx.fillRect(-detailWidth / 2, nameY + 8, detailWidth, 9);
      ctx.fillStyle = visual.iconColor;
      ctx.fillText(visual.detailLabel, 0, nameY + 12.5);
    }
  }
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  width: number,
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.fillStyle = color;
  const length = Math.max(4.5, Math.min(7, width * 2));
  const spread = .48;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - spread) * length, to.y - Math.sin(angle - spread) * length);
  ctx.lineTo(to.x - Math.cos(angle + spread) * length, to.y - Math.sin(angle + spread) * length);
  ctx.closePath();
  ctx.fill();
}

function traceRoute(ctx: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]) {
  ctx.beginPath();
  points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
}

function drawIntentRoute(
  ctx: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  color: string,
  width: number,
  dash: readonly number[],
  elapsedMs: number,
  reducedMotion: boolean,
) {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(1, 7, 9, .82)";
  ctx.lineWidth = width + 4;
  traceRoute(ctx, points);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = width > 2 ? 8 : 4;
  ctx.lineWidth = width;
  ctx.setLineDash([...dash]);
  ctx.lineDashOffset = reducedMotion ? 0 : -(elapsedMs / 70) % 24;
  traceRoute(ctx, points);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  drawArrowHead(ctx, points.at(-2)!, points.at(-1)!, color, width);
  ctx.restore();
}

function drawUnitTag(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  label: string,
  color: string,
  yOffset: number,
) {
  ctx.save();
  ctx.font = "bold 6px ui-monospace, SFMono-Regular, monospace";
  const text = label.slice(0, 11).toUpperCase();
  const width = Math.max(34, ctx.measureText(text).width + 10);
  ctx.fillStyle = "rgba(4, 13, 16, .9)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(point.x - width / 2, point.y + yOffset, width, 13, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, point.x, point.y + yOffset + 6.5);
  ctx.restore();
}

function drawIntentGlyph(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  visual: IntentVisual,
  radius = 8,
) {
  ctx.save();
  ctx.strokeStyle = visual.color;
  ctx.fillStyle = "rgba(5,14,16,.92)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = visual.color;
  ctx.font = `bold ${Math.max(7, radius)}px ui-monospace, SFMono-Regular, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(visual.glyph, point.x, point.y + .5);
  ctx.restore();
}

export function HexMap({
  campaign,
  markers,
  layer,
  selectedUnitId,
  draftedRoute,
  draftedFacing,
  targetUnitId,
  targetHex,
  onMapClick,
  onRemoveMarker,
  onHover,
}: HexMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteImagesRef = useRef(new Map<string, HTMLImageElement>());
  const onHoverRef = useRef(onHover);
  const hoveredUnitIdRef = useRef<string | undefined>(undefined);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const fittedMapRef = useRef<string | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0, ratio: 1 });
  const [viewport, setViewport] = useState<TacticalMapViewport>({ x: 0, y: 0, zoom: 1 });
  const [hovered, setHovered] = useState<AxialCoord>();
  const [keyboardCoord, setKeyboardCoord] = useState<AxialCoord>();
  const [canvasFocused, setCanvasFocused] = useState(false);
  const [showAlliedIntents, setShowAlliedIntents] = useState(true);
  const [focusedIntentId, setFocusedIntentId] = useState<string>();
  const [intentScope, setIntentScope] = useState<IntentScope>("ALL");
  const [intentKind, setIntentKind] = useState<IntentVisualKind | "ALL">("ALL");
  const [spriteRevision, setSpriteRevision] = useState(0);
  const [animationTime, setAnimationTime] = useState(0);
  const [mapVisible, setMapVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);

  const mapIndex = useMemo(() => new Map(campaign.map.map((hex) => [coordKey(hex.coord), hex])), [campaign.map]);
  const chartWaterHexes = useMemo(
    () => tacticalWaterRings(campaign.map.map((hex) => hex.coord), 3),
    [campaign.map],
  );
  const worldBounds = useMemo(
    () => tacticalMapBounds([
      ...campaign.map.map((hex) => hex.coord),
      ...chartWaterHexes.map((hex) => hex.coord),
    ]),
    [campaign.map, chartWaterHexes],
  );
  const terrainTiles = useMemo(() => campaign.map.map((hex) => ({
    hex,
    point: axialToTacticalWorld(hex.coord),
    terrainStyle: tacticalTerrainStyle(hex.terrainId, hex.coord, hex.visualTerrainId),
    connectedTerrain: connectedTerrainDirections(hex.coord, hex.terrainId, mapIndex, hex.visualTerrainId),
    terrainBoundaries: terrainBoundaryDirections(hex.coord, hex.terrainId, mapIndex, hex.visualTerrainId),
    coastline: exposedMapDirections(hex.coord, mapIndex),
  })), [campaign.map, mapIndex]);
  const mapFitKey = [
    campaign.campaignId,
    campaign.scenarioVersion,
    campaign.map.length,
    chartWaterHexes.length,
    worldBounds.minX,
    worldBounds.minY,
    worldBounds.maxX,
    worldBounds.maxY,
  ].join(":");
  const viewportFitKey = `${mapFitKey}:${Math.round(size.width)}:${Math.round(size.height)}`;
  const unitIndex = useMemo(() => {
    const result = new Map<string, CampaignDeployment[]>();
    for (const deployment of campaign.deployments.filter((candidate) => candidate.status !== "DESTROYED")) {
      const key = coordKey(deployment.position);
      result.set(key, [...(result.get(key) ?? []), deployment]);
    }
    for (const deployments of result.values()) deployments.sort(stableDeploymentOrder);
    return result;
  }, [campaign.deployments]);
  const activeOrdersByUnitId = useMemo(() => new Map(campaign.orders
    .filter((order) => order.round === campaign.round && ["SUBMITTED", "LOCKED", "RESOLVING"].includes(order.lifecycle))
    .map((order) => [order.unitId, order])), [campaign.orders, campaign.round]);
  const alliedCommandColors = useMemo(() => {
    const ownerIds = [...new Set(campaign.deployments
      .filter((deployment) => deployment.side === campaign.viewer.side)
      .map((deployment) => deployment.ownerId))]
      .sort((left, right) => {
        if (left === campaign.viewer.userId) return -1;
        if (right === campaign.viewer.userId) return 1;
        return left.localeCompare(right);
      });
    return new Map(ownerIds.map((ownerId, index) => [ownerId, ALLIED_COMMAND_COLORS[index % ALLIED_COMMAND_COLORS.length]!]));
  }, [campaign.deployments, campaign.viewer.side, campaign.viewer.userId]);
  const alliedCommandLabels = useMemo(() => {
    const allies = [...alliedCommandColors.keys()].filter((ownerId) => ownerId !== campaign.viewer.userId);
    return new Map([
      [campaign.viewer.userId, "YOU"],
      ...allies.map((ownerId, index) => [ownerId, `ALLY ${index + 1}`] as const),
    ]);
  }, [alliedCommandColors, campaign.viewer.userId]);
  const submittedAlliedIntents = useMemo(() => campaign.orders
    .filter((order) => {
      if (order.round !== campaign.round || !["SUBMITTED", "LOCKED", "RESOLVING"].includes(order.lifecycle)) return false;
      const deployment = campaign.deployments.find((candidate) => candidate.id === order.unitId);
      return deployment?.side === campaign.viewer.side;
    })
    .sort((left, right) => left.unitId < right.unitId ? -1 : left.unitId > right.unitId ? 1 : 0), [campaign.deployments, campaign.orders, campaign.round, campaign.viewer.side]);
  const filteredAlliedIntents = useMemo(() => submittedAlliedIntents.filter((order) => {
    const own = order.submittedBy === campaign.viewer.userId;
    if (intentScope === "MINE" && !own) return false;
    if (intentScope === "ALLIES" && own) return false;
    return intentKind === "ALL" || intentVisual(order).kind === intentKind;
  }), [campaign.viewer.userId, intentKind, intentScope, submittedAlliedIntents]);
  const activeFocusedIntentId = focusedIntentId && filteredAlliedIntents.some((order) => order.id === focusedIntentId)
    ? focusedIntentId
    : undefined;
  const selectedDeployment = selectedUnitId
    ? campaign.deployments.find((deployment) => deployment.id === selectedUnitId)
    : undefined;
  const defaultKeyboardCoord = draftedRoute.at(-1)
    ?? selectedDeployment?.position
    ?? campaign.map.find((hex) => hex.visibility !== "UNKNOWN")?.coord
    ?? campaign.map[0]?.coord;
  const activeKeyboardCoord = keyboardCoord && mapIndex.has(coordKey(keyboardCoord))
    ? keyboardCoord
    : defaultKeyboardCoord;
  const keyboardHex = activeKeyboardCoord ? mapIndex.get(coordKey(activeKeyboardCoord)) : undefined;
  const keyboardVisibility = keyboardHex?.visibility ?? "UNKNOWN";
  const keyboardUnits = !keyboardHex || keyboardVisibility === "UNKNOWN" || !activeKeyboardCoord
    ? []
    : unitIndex.get(coordKey(activeKeyboardCoord)) ?? [];
  const keyboardObjective = !activeKeyboardCoord || keyboardVisibility === "UNKNOWN"
    ? undefined
    : campaign.objectives.find((objective) => coordKey(objective.coord) === coordKey(activeKeyboardCoord));
  const keyboardDescription = !activeKeyboardCoord || !keyboardHex
    ? "No tactical hex is available."
    : keyboardVisibility === "UNKNOWN"
      ? `Hex ${activeKeyboardCoord.q}.${activeKeyboardCoord.r}. Unknown contact area.`
      : `Hex ${activeKeyboardCoord.q}.${activeKeyboardCoord.r}. ${tacticalTerrainLabel(keyboardHex.terrainId, keyboardHex.visualTerrainId)} terrain. ${keyboardVisibility.toLowerCase()}. ${
        keyboardUnits.length > 0
          ? `${keyboardUnits.length} projected ${keyboardUnits.length === 1 ? "unit" : "units"}: ${keyboardUnits.map((unit) => unit.callsign).join(", ")}.`
          : "No projected units."
      } ${keyboardObjective
        ? tacticalObjectiveAriaLabel(
            keyboardObjective,
            campaign.scenarioPolicy?.policyId === "HOLD_PRIMARY_OBJECTIVE"
              ? campaign.scenarioPolicy.primaryObjectiveId
              : undefined,
          )
        : "No objective."}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height, ratio });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0 || fittedMapRef.current === viewportFitKey) return;
    setViewport(fitTacticalMapViewport(size.width, size.height, worldBounds));
    fittedMapRef.current = viewportFitKey;
  }, [size.height, size.width, viewportFitKey, worldBounds]);

  useEffect(() => {
    // Reset transient inspection state after a map identity change without
    // synchronously cascading the render that observed that change.
    const reset = window.requestAnimationFrame(() => {
      setKeyboardCoord(undefined);
      setHovered(undefined);
      hoveredUnitIdRef.current = undefined;
      onHoverRef.current();
    });
    return () => window.cancelAnimationFrame(reset);
  }, [campaign.campaignId, campaign.scenarioVersion, mapFitKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(([entry]) => setMapVisible(entry.isIntersecting), { threshold: .01 });
    observer.observe(container);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    updateMotion();
    media.addEventListener("change", updateMotion);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", updateMotion);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    for (const deployment of campaign.deployments) {
      const src = findTacticalSprite(deployment.definitionId);
      if (!src || spriteImagesRef.current.has(src)) continue;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        if (!cancelled) setSpriteRevision((current) => current + 1);
      };
      image.src = src;
      spriteImagesRef.current.set(src, image);
    }
    return () => { cancelled = true; };
  }, [campaign.deployments]);

  useEffect(() => {
    if (!mapVisible || reducedMotion) return;
    let frame = 0;
    let last = 0;
    const tick = (time: number) => {
      if (time - last >= 80) {
        setAnimationTime(time);
        last = time;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mapVisible, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelWidth = Math.max(1, Math.floor(size.width * size.ratio));
    const pixelHeight = Math.max(1, Math.floor(size.height * size.ratio));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const cssWidth = `${size.width}px`;
    const cssHeight = `${size.height}px`;
    if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
    if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
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

    const visibleWorld = {
      minX: -viewport.x / viewport.zoom - HEX_SIZE * 2,
      minY: -viewport.y / viewport.zoom - HEX_SIZE * 2,
      maxX: (size.width - viewport.x) / viewport.zoom + HEX_SIZE * 2,
      maxY: (size.height - viewport.y) / viewport.zoom + HEX_SIZE * 2,
    };

    for (const waterHex of chartWaterHexes) {
      const point = axialToTacticalWorld(waterHex.coord);
      if (point.x < visibleWorld.minX || point.x > visibleWorld.maxX || point.y < visibleWorld.minY || point.y > visibleWorld.maxY) continue;
      drawChartWaterHex(ctx, point, waterHex.coord, waterHex.depth);
    }

    for (const tile of terrainTiles) {
      const { hex, point, terrainStyle, connectedTerrain, terrainBoundaries, coastline } = tile;
      if (point.x < visibleWorld.minX || point.x > visibleWorld.maxX || point.y < visibleWorld.minY || point.y > visibleWorld.maxY) continue;
      polygon(ctx, point, 1.2);
      if (hex.visibility === "UNKNOWN") {
        ctx.fillStyle = "#11191b";
        ctx.globalAlpha = .19;
        ctx.fill();
      } else if (layer === "SURFACE") {
        ctx.globalAlpha = hex.visibility === "OBSERVED" ? .72 : 1;
        drawTerrainTileFill(ctx, point, terrainStyle);
      } else {
        ctx.fillStyle = layer === "INTEL"
          ? hex.visibility === "VISIBLE" ? "#164049" : "#29383c"
          : hex.edges.roads.length > 0 ? "#49452f" : terrainStyle.fill;
        ctx.globalAlpha = hex.visibility === "OBSERVED" ? .68 : 1;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = layer === "INTEL" && hex.visibility === "VISIBLE"
        ? "rgba(105,235,225,.72)"
        : hex.visibility === "VISIBLE"
          ? terrainStyle.grid
          : "rgba(37,58,57,.3)";
      ctx.lineWidth = layer === "INTEL" && hex.visibility === "VISIBLE"
        ? 2
        : viewport.zoom < .48 ? .48 : viewport.zoom < .8 ? .72 : 1;
      polygon(ctx, point, 1.2);
      ctx.stroke();
      if (hex.visibility !== "UNKNOWN") {
        drawTerrainTexture(
          ctx,
          point,
          hex.coord,
          hex.terrainId,
          hex.visualTerrainId,
          connectedTerrain,
          terrainStyle,
          reducedMotion ? 0 : animationTime,
        );
        if (terrainBoundaries.length > 0) drawTerrainBoundaries(ctx, point, terrainBoundaries, terrainStyle);
        if (coastline.length > 0) drawCoastline(ctx, point, coastline);
        if (hex.visibility === "OBSERVED") {
          polygon(ctx, point, 1.8);
          ctx.fillStyle = "rgba(16, 34, 36, .28)";
          ctx.fill();
        }
      }

      if (hex.visibility !== "UNKNOWN") drawHexEdges(ctx, point, hex.edges.paths ?? [], "PATH");
      if (hex.visibility !== "UNKNOWN") drawHexEdges(ctx, point, hex.edges.roads, "ROAD");
      if (hex.visibility !== "UNKNOWN") drawHexEdges(ctx, point, hex.edges.rivers, "RIVER");
      if (hex.visibility !== "UNKNOWN") drawHexEdges(ctx, point, hex.edges.bridges ?? [], "BRIDGE");
      if (hex.visibility !== "UNKNOWN") drawHexEdges(ctx, point, hex.edges.walls ?? [], "WALL");
      const drewAuthoredMapFeature = hex.visibility !== "UNKNOWN"
        ? drawAuthoredMapFeature(ctx, point, hex.structureIds)
        : false;
      if (
        hex.visibility !== "UNKNOWN" &&
        hex.structureIds.some((id) => id === "structure-sandbag-line" || id.startsWith("structure-sandbag-line:"))
      ) {
        ctx.save();
        ctx.translate(point.x, point.y + 10);
        ctx.strokeStyle = "rgba(229, 194, 119, .92)";
        ctx.fillStyle = "rgba(106, 78, 42, .88)";
        ctx.lineWidth = 2;
        for (const offset of [-16, -8, 0, 8, 16]) {
          ctx.beginPath();
          ctx.roundRect(offset - 4, -4 - Math.abs(offset % 16) / 4, 9, 7, 3);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
      if (
        hex.visibility !== "UNKNOWN" &&
        !drewAuthoredMapFeature &&
        hex.environment.includes(INFANTRY_GARRISON_BUILDING)
      ) {
        ctx.save();
        ctx.translate(point.x, point.y - 12);
        ctx.fillStyle = "rgba(8, 22, 27, .88)";
        ctx.strokeStyle = "rgba(230, 204, 137, .9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(-11, -7, 22, 15);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-14, -7);
        ctx.lineTo(0, -15);
        ctx.lineTo(14, -7);
        ctx.stroke();
        ctx.fillStyle = "rgba(110, 214, 205, .9)";
        ctx.fillRect(-3, 0, 6, 8);
        ctx.restore();
      }
      if (
        hex.visibility !== "UNKNOWN" &&
        hex.structureIds.some((id) => id === "structure-trench" || id.startsWith("structure-trench:"))
      ) {
        ctx.save();
        ctx.translate(point.x, point.y + 10);
        ctx.strokeStyle = "rgba(143, 213, 192, .95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-21, -5);
        ctx.lineTo(-12, 3);
        ctx.lineTo(-3, -5);
        ctx.lineTo(6, 3);
        ctx.lineTo(15, -5);
        ctx.lineTo(22, 2);
        ctx.stroke();
        ctx.restore();
      }
      if (
        hex.visibility !== "UNKNOWN" &&
        hex.structureIds.some((id) => id === "structure-razor-wire" || id.startsWith("structure-razor-wire:"))
      ) {
        ctx.save();
        ctx.translate(point.x, point.y - 11);
        ctx.strokeStyle = "rgba(214, 220, 213, .92)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-19, 0);
        ctx.bezierCurveTo(-12, -8, -5, 8, 2, 0);
        ctx.bezierCurveTo(9, -8, 15, 8, 20, 0);
        ctx.stroke();
        for (const offset of [-13, -3, 7, 17]) {
          ctx.beginPath();
          ctx.moveTo(offset - 3, -4);
          ctx.lineTo(offset + 3, 4);
          ctx.moveTo(offset + 3, -4);
          ctx.lineTo(offset - 3, 4);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (
        hex.visibility !== "UNKNOWN" &&
        hex.structureIds.some((id) => id === "structure-tank-traps" || id.startsWith("structure-tank-traps:"))
      ) {
        ctx.save();
        ctx.translate(point.x, point.y - 11);
        ctx.strokeStyle = "rgba(226, 161, 103, .95)";
        ctx.lineWidth = 2.5;
        for (const offset of [-13, 0, 13]) {
          ctx.beginPath();
          ctx.moveTo(offset - 5, 5);
          ctx.lineTo(offset, -6);
          ctx.lineTo(offset + 5, 5);
          ctx.moveTo(offset - 6, 0);
          ctx.lineTo(offset + 6, 0);
          ctx.stroke();
        }
        ctx.restore();
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
      if (viewport.zoom > 0.62 && hex.visibility !== "UNKNOWN") {
        ctx.fillStyle = "rgba(166,193,193,.38)";
        ctx.font = "8px ui-monospace, SFMono-Regular, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${hex.coord.q}.${hex.coord.r}`, point.x, point.y + 29);
      }
    }

    for (const objective of campaign.objectives) {
      const objectiveHex = mapIndex.get(coordKey(objective.coord));
      if (!objectiveHex || objectiveHex.visibility === "UNKNOWN") continue;
      const point = axialToTacticalWorld(objective.coord);
      drawObjectiveMarker(
        ctx,
        objective,
        point,
        campaign.scenarioPolicy?.policyId === "HOLD_PRIMARY_OBJECTIVE"
          ? campaign.scenarioPolicy.primaryObjectiveId
          : undefined,
        viewport.zoom,
        animationTime,
        reducedMotion,
      );
    }

    for (const marker of markers) {
      const point = axialToTacticalWorld(marker.coord);
      const color = MARKER_COLORS[marker.kind];
      const pulse = marker.kind === "PING" && !reducedMotion ? 2 + (Math.sin(animationTime / 180) + 1) * 2 : 2;
      const glyph = marker.kind === "ATTACK" ? "×" : marker.kind === "DEFEND" ? "◇" : marker.kind === "SUPPORT" ? "+" : marker.kind === "MOVE" ? "→" : "!";
      const callout = (marker.label?.trim() || (marker.own ? "YOUR PING" : "ALLIED PING")).slice(0, 24).toUpperCase();
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.strokeStyle = color;
      ctx.fillStyle = "rgba(4,12,15,.88)";
      ctx.shadowColor = color;
      ctx.shadowBlur = marker.own ? 14 : 8;
      ctx.lineWidth = marker.own ? 2.5 : 1.7;
      ctx.beginPath();
      ctx.arc(0, 0, marker.kind === "PING" ? 17 : 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = .55;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 19 + pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.font = "bold 11px ui-monospace, SFMono-Regular, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, 0, 0);

      ctx.font = "bold 6px ui-monospace, SFMono-Regular, monospace";
      const labelWidth = Math.max(48, Math.min(106, ctx.measureText(callout).width + 17));
      const labelX = 21;
      const labelY = -31;
      ctx.strokeStyle = "rgba(3, 10, 12, .9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(10, -10);
      ctx.lineTo(labelX, labelY + 9);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, -10);
      ctx.lineTo(labelX, labelY + 9);
      ctx.stroke();
      ctx.fillStyle = "rgba(4, 13, 16, .94)";
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelWidth, 19, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.fillText(`${marker.kind} · ${callout}`, labelX + 6, labelY + 9.5, labelWidth - 11);
      ctx.fillStyle = marker.own ? "#d8fffa" : "#a8bab8";
      ctx.font = "bold 4px ui-monospace, SFMono-Regular, monospace";
      ctx.fillText(marker.own ? "YOU" : "ALLY", labelX + labelWidth - 18, labelY + 16);
      ctx.restore();
    }

    for (const order of showAlliedIntents ? filteredAlliedIntents : []) {
      const deployment = campaign.deployments.find((candidate) => candidate.id === order.unitId);
      if (!deployment) continue;
      const points = order.route.map(axialToTacticalWorld);
      const visual = intentVisual(order);
      const color = visual.color;
      const ownIntent = order.submittedBy === campaign.viewer.userId;
      const dimmed = activeFocusedIntentId !== undefined && activeFocusedIntentId !== order.id;
      if (points.length > 1) {
        ctx.save();
        ctx.globalAlpha = dimmed ? 0.16 : 0.9;
        const routeDash = order.orderType === "RUSH" ? [15, 4] : order.orderType === "EVASIVE" ? [3, 5] : visual.dash;
        drawIntentRoute(
          ctx,
          points,
          color,
          ownIntent || activeFocusedIntentId === order.id ? 3.2 : 2.2,
          routeDash,
          animationTime,
          reducedMotion,
        );
        ctx.restore();
      }
      const destination = points.at(-1) ?? axialToTacticalWorld(order.endHex);
      ctx.save();
      ctx.globalAlpha = dimmed ? 0.2 : 1;
      ctx.strokeStyle = color;
      ctx.fillStyle = "rgba(5,14,16,.84)";
      ctx.lineWidth = ownIntent || activeFocusedIntentId === order.id ? 3 : 2;
      ctx.beginPath();
      ctx.arc(destination.x, destination.y, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const facingAngle = -Math.PI / 2 + (Math.PI / 3) * order.facing;
      ctx.beginPath();
      ctx.moveTo(destination.x + Math.cos(facingAngle) * 21, destination.y + Math.sin(facingAngle) * 21);
      ctx.lineTo(destination.x + Math.cos(facingAngle) * 30, destination.y + Math.sin(facingAngle) * 30);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "bold 7px ui-monospace, SFMono-Regular, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(deployment.callsign.slice(0, 8), destination.x, destination.y - 2);
      ctx.font = "bold 5px ui-monospace, SFMono-Regular, monospace";
      ctx.fillText(`${order.orderType} · ${ownIntent ? "YOU" : "ALLY"}`, destination.x, destination.y + 7);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = dimmed ? 0.2 : 1;
      drawIntentGlyph(ctx, { x: destination.x - 19, y: destination.y - 18 }, visual, 7);
      ctx.restore();

      for (const action of [...order.actions, ...order.incidentalActions]) {
        const targetDeployment = action.targetDeploymentId
          ? campaign.deployments.find((candidate) => candidate.id === action.targetDeploymentId)
          : undefined;
        const actionTarget = targetDeployment?.position ?? action.targetHex;
        if (!actionTarget) continue;
        const target = axialToTacticalWorld(actionTarget);
        const actionVisual = ASSAULT_ACTIONS.has(action.type)
          ? INTENT_VISUALS.ASSAULT
          : SUPPORT_ACTIONS.has(action.type)
            ? INTENT_VISUALS.SUPPORT
            : FORTIFY_ACTIONS.has(action.type)
              ? INTENT_VISUALS.FORTIFY
              : visual;
        const interactionColor = actionVisual.color;
        ctx.save();
        ctx.strokeStyle = interactionColor;
        ctx.fillStyle = interactionColor;
        ctx.globalAlpha = dimmed ? 0.16 : 0.92;
        if (destination.x !== target.x || destination.y !== target.y) {
          drawIntentRoute(ctx, [destination, target], interactionColor, 1.6, actionVisual.dash, animationTime, reducedMotion);
        }
        drawIntentGlyph(ctx, target, actionVisual, 8);
        ctx.restore();
      }
    }

    if (draftedRoute.length > 1) {
      const points = draftedRoute.map(axialToTacticalWorld);
      ctx.save();
      drawIntentRoute(ctx, points, "#9affef", 3.4, [9, 4], animationTime, reducedMotion);
      ctx.restore();
    }

    if (targetHex && mapIndex.has(coordKey(targetHex))) {
      const point = axialToTacticalWorld(targetHex);
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
      const base = axialToTacticalWorld(hex.coord);
      const slots = tacticalFormationLayout(deployments.length);
      const formationScale = tacticalFormationScale(deployments.length);
      deployments.forEach((deployment, index) => {
        const offset = slots[index] ?? { x: 0, y: 0 };
        const point = { x: base.x + offset.x, y: base.y + offset.y };
        const allied = deployment.side === "ALLIED";
        const selected = deployment.id === selectedUnitId;
        const targeted = deployment.id === targetUnitId;
        const size = tacticalSpriteSize(deployment) * formationScale;
        const facing = selected ? draftedFacing : deployment.facing;
        const order = activeOrdersByUnitId.get(deployment.id);
        const state = tacticalSpriteState(deployment, order);
        const frame = tacticalSpriteFrame(state, animationTime, reducedMotion);
        const spriteGroup = tacticalSpriteGroupLayout(deployment.definitionId);
        const spriteSrc = findTacticalSprite(deployment.definitionId);
        const sprite = spriteSrc ? spriteImagesRef.current.get(spriteSrc) : undefined;
        const commandColor = alliedCommandColors.get(deployment.ownerId) ?? (allied ? ALLIED_COMMAND_COLORS[0] : "#e36d53");
        const groupedSprite = spriteGroup.length > 1;
        drawSpriteBase(ctx, point, Math.max(8, size * (groupedSprite ? .46 : .34)), allied, selected, targeted, commandColor, facing);
        if (sprite?.complete && sprite.naturalWidth >= SPRITE_FRAME_SIZE * 6) {
          for (const groupMember of spriteGroup) {
            drawTacticalSprite(
              ctx,
              sprite,
              tacticalSpriteGroupFrame(frame, state, groupMember.movePhase),
              point,
              facing,
              size,
              state,
              animationTime,
              reducedMotion,
              allied,
              groupMember,
            );
          }
        } else {
          ctx.save();
          ctx.translate(point.x, point.y);
          ctx.rotate((Math.PI / 3) * facing);
          ctx.translate(-point.x, -point.y);
          drawUnitGlyph(ctx, deployment, point, allied ? "#b8efea" : "#ffc0aa");
          ctx.restore();
        }
        const healthRatio = deployment.currentHealth / deployment.stats.maxHealth;
        ctx.fillStyle = "rgba(0,0,0,.72)";
        ctx.fillRect(point.x - size * .28, point.y + size * .32, size * .56, 2.5);
        ctx.fillStyle = healthRatio > 0.5 ? "#77d4ad" : healthRatio > 0.25 ? "#d9b85d" : "#e16a51";
        ctx.fillRect(point.x - size * .28, point.y + size * .32, size * .56 * healthRatio, 2.5);

        if (selected || targeted || (deployments.length === 1 && viewport.zoom >= 1.25)) {
          drawUnitTag(ctx, point, deployment.callsign, commandColor, size * .37);
        }

        if (layer === "INTEL" && allied) {
          ctx.fillStyle = "rgba(121,235,221,.86)";
          ctx.font = "bold 6px ui-monospace, SFMono-Regular, monospace";
          ctx.fillText(`S${deployment.stats.sensors}`, point.x, point.y + size * .49);
        }
        if (layer === "SUPPLY" && allied) {
          const supplies = deployment.supplies ?? {};
          const small = supplies.SMALL_SUPPLY ?? 0;
          const medical = supplies.MEDICAL_SUPPLY ?? 0;
          ctx.fillStyle = small + medical > 0 ? "#e2c978" : "#8a7770";
          ctx.font = "bold 6px ui-monospace, SFMono-Regular, monospace";
          ctx.fillText(`S${small} M${medical}`, point.x, point.y + size * .49);
        }
      });

      if (deployments.length > 1 && viewport.zoom >= .72) {
        const commandCount = new Set(deployments.filter((deployment) => deployment.side === "ALLIED").map((deployment) => deployment.ownerId)).size;
        const alliedCount = deployments.filter((deployment) => deployment.side === "ALLIED").length;
        const enemyCount = deployments.length - alliedCount;
        const color = enemyCount > 0 && alliedCount > 0 ? "#f1c96b" : enemyCount > 0 ? "#ef8068" : "#77dcd3";
        const label = enemyCount > 0 && alliedCount > 0
          ? `${deployments.length} CONTESTED`
          : `${deployments.length} UNITS${commandCount > 1 ? ` · ${commandCount} CMD` : ""}`;
        ctx.save();
        ctx.font = "bold 5px ui-monospace, SFMono-Regular, monospace";
        const badgeWidth = ctx.measureText(label).width + 10;
        ctx.fillStyle = "rgba(4, 12, 15, .9)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(base.x - badgeWidth / 2, base.y - 35, badgeWidth, 12, 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, base.x, base.y - 29);
        ctx.restore();
      }
    }

    if (hovered && mapIndex.has(coordKey(hovered))) {
      const point = axialToTacticalWorld(hovered);
      polygon(ctx, point, 1);
      ctx.strokeStyle = "rgba(255,226,153,.92)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (canvasFocused && activeKeyboardCoord && mapIndex.has(coordKey(activeKeyboardCoord))) {
      const point = axialToTacticalWorld(activeKeyboardCoord);
      ctx.save();
      polygon(ctx, point, 4);
      ctx.fillStyle = "rgba(105, 235, 225, .08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(105, 235, 225, .98)";
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#d8fffa";
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(size.width / 2, size.height / 2, size.width * 0.25, size.width / 2, size.height / 2, size.width * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.48)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size.width, size.height);
  }, [activeFocusedIntentId, activeKeyboardCoord, activeOrdersByUnitId, alliedCommandColors, animationTime, campaign, canvasFocused, chartWaterHexes, draftedFacing, draftedRoute, filteredAlliedIntents, hovered, layer, mapIndex, markers, reducedMotion, selectedUnitId, showAlliedIntents, size, spriteRevision, targetHex, targetUnitId, terrainTiles, unitIndex, viewport]);

  const screenToWorldPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom,
    };
  };

  const unitAtWorldPoint = (world: { x: number; y: number }, coord: AxialCoord) => {
    const hex = mapIndex.get(coordKey(coord));
    if (!hex || hex.visibility === "UNKNOWN") return undefined;
    const deployments = unitIndex.get(coordKey(coord)) ?? [];
    const base = axialToTacticalWorld(coord);
    const slots = tacticalFormationLayout(deployments.length);
    const formationScale = tacticalFormationScale(deployments.length);
    return deployments
      .map((deployment, index) => {
        const slot = slots[index] ?? { x: 0, y: 0 };
        const distance = Math.hypot(world.x - base.x - slot.x, world.y - base.y - slot.y);
        const hitRadius = Math.max(8, tacticalSpriteSize(deployment) * formationScale * .55);
        return { deployment, distance, hitRadius };
      })
      .filter((candidate) => candidate.distance <= candidate.hitRadius)
      .sort((left, right) => left.distance - right.distance)[0]?.deployment;
  };

  const fitMap = () => setViewport(fitTacticalMapViewport(size.width, size.height, worldBounds));

  const preferredUnitAt = (coord: AxialCoord) => {
    const hex = mapIndex.get(coordKey(coord));
    if (!hex || hex.visibility === "UNKNOWN") return undefined;
    const units = unitIndex.get(coordKey(coord)) ?? [];
    return units.find((deployment) => deployment.ownerId === campaign.viewer.userId)
      ?? units.find((deployment) => deployment.side === "ENEMY")
      ?? units[0];
  };

  const moveKeyboardCursor = (directionIndex: number) => {
    const start = activeKeyboardCoord;
    const direction = HEX_DIRECTIONS[directionIndex];
    if (!start || !direction) return;
    const next = { q: start.q + direction.q, r: start.r + direction.r };
    if (!mapIndex.has(coordKey(next))) return;
    const unit = preferredUnitAt(next);
    setKeyboardCoord(next);
    setHovered(next);
    hoveredUnitIdRef.current = unit?.id;
    const nextHex = mapIndex.get(coordKey(next));
    if (nextHex?.visibility === "UNKNOWN") onHover();
    else onHover(next, unit);
    const world = axialToTacticalWorld(next);
    setViewport((current) => {
      const margin = 72;
      const screenX = current.x + world.x * current.zoom;
      const screenY = current.y + world.y * current.zoom;
      return {
        ...current,
        x: screenX < margin
          ? current.x + margin - screenX
          : screenX > size.width - margin
            ? current.x + size.width - margin - screenX
            : current.x,
        y: screenY < margin
          ? current.y + margin - screenY
          : screenY > size.height - margin
            ? current.y + size.height - margin - screenY
            : current.y,
      };
    });
  };

  return (
    <div className="map-canvas-shell" ref={containerRef}>
      <canvas
        ref={canvasRef}
        role="application"
        aria-label={`${campaign.campaignName} tactical hex map. Use arrow keys to inspect hexes, Alt plus Left or Right for the diagonal directions, Enter to select, Shift plus arrow keys to pan, and F to fit the map.`}
        aria-describedby="tactical-map-keyboard-help tactical-map-live-status"
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Alt+ArrowLeft Alt+ArrowRight Enter Space Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight F"
        tabIndex={0}
        onFocus={() => {
          setCanvasFocused(true);
        }}
        onBlur={() => setCanvasFocused(false)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
        }}
        onPointerMove={(event) => {
          const world = screenToWorldPoint(event.clientX, event.clientY);
          const coord = tacticalWorldToAxial(world.x, world.y);
          const hex = mapIndex.get(coordKey(coord));
          const inspectable = hex !== undefined && hex.visibility !== "UNKNOWN";
          const unit = inspectable ? unitAtWorldPoint(world, coord) : undefined;
          if (!hovered || coord.q !== hovered.q || coord.r !== hovered.r || hoveredUnitIdRef.current !== unit?.id) {
            setHovered(coord);
            hoveredUnitIdRef.current = unit?.id;
            if (inspectable) onHover(coord, unit);
            else onHover();
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
          const world = screenToWorldPoint(event.clientX, event.clientY);
          const coord = tacticalWorldToAxial(world.x, world.y);
          if (!mapIndex.has(coordKey(coord))) return;
          const hit = unitAtWorldPoint(world, coord);
          const preferred = hit ?? preferredUnitAt(coord);
          onMapClick(coord, preferred);
        }}
        onPointerLeave={() => {
          setHovered(undefined);
          hoveredUnitIdRef.current = undefined;
          onHover();
          dragRef.current = null;
        }}
        onWheel={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const cursorX = event.clientX - rect.left;
          const cursorY = event.clientY - rect.top;
          setViewport((current) => {
            const nextZoom = clampTacticalZoom(current.zoom * (event.deltaY < 0 ? 1.1 : 0.9));
            const scale = nextZoom / current.zoom;
            return {
              zoom: nextZoom,
              x: cursorX - (cursorX - current.x) * scale,
              y: cursorY - (cursorY - current.y) * scale,
            };
          });
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey) return;
          if (event.shiftKey && event.key.startsWith("Arrow")) {
            event.preventDefault();
            const amount = 80;
            if (event.key === "ArrowLeft") setViewport((current) => ({ ...current, x: current.x + amount }));
            if (event.key === "ArrowRight") setViewport((current) => ({ ...current, x: current.x - amount }));
            if (event.key === "ArrowUp") setViewport((current) => ({ ...current, y: current.y + amount }));
            if (event.key === "ArrowDown") setViewport((current) => ({ ...current, y: current.y - amount }));
            return;
          }
          const directionIndex = event.key === "ArrowUp"
            ? 0
            : event.key === "ArrowDown"
              ? 3
              : event.key === "ArrowRight"
                ? event.altKey ? 2 : 1
                : event.key === "ArrowLeft"
                  ? event.altKey ? 5 : 4
                  : undefined;
          if (directionIndex !== undefined) {
            event.preventDefault();
            moveKeyboardCursor(directionIndex);
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (
              activeKeyboardCoord &&
              mapIndex.get(coordKey(activeKeyboardCoord))?.visibility !== "UNKNOWN"
            ) {
              onMapClick(activeKeyboardCoord, preferredUnitAt(activeKeyboardCoord));
            }
            return;
          }
          if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            setViewport((current) => ({ ...current, zoom: clampTacticalZoom(current.zoom * 1.1) }));
          }
          if (event.key === "-") {
            event.preventDefault();
            setViewport((current) => ({ ...current, zoom: clampTacticalZoom(current.zoom * 0.9) }));
          }
          if (event.key.toLowerCase() === "f") {
            event.preventDefault();
            fitMap();
          }
        }}
      />
      <p id="tactical-map-keyboard-help" className="map-a11y-only">
        Arrow Up and Down move north and south. Arrow Right and Left move northeast and southwest. Alt plus Right and Left move southeast and northwest. Enter or Space selects the current hex. Shift plus an arrow pans the viewport.
      </p>
      <p id="tactical-map-live-status" className="map-a11y-only" role="status" aria-label="Tactical keyboard cursor">
        {keyboardDescription}
      </p>
      <div className="map-coordinates" aria-hidden="true">
        {hovered ? `HEX ${hovered.q}.${hovered.r}` : `${layer} GRID // ${campaign.campaignName.toUpperCase()}`}
      </div>
      <div className="map-zoom-controls">
        <button type="button" onClick={() => setViewport((current) => ({ ...current, zoom: clampTacticalZoom(current.zoom * 1.15) }))} aria-label="Zoom in">+</button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <button type="button" onClick={() => setViewport((current) => ({ ...current, zoom: clampTacticalZoom(current.zoom * 0.85) }))} aria-label="Zoom out">−</button>
        <button type="button" className="fit" onClick={fitMap} aria-label="Fit full tactical map in view">FIT</button>
      </div>
      <div className="map-facing-readout">FACING {FACING_LABELS[draftedFacing] ?? "N"}</div>
      {submittedAlliedIntents.length > 0 && (
        <div className="map-intent-roster" role="region" aria-label="Submitted Allied map intentions">
          <header><span>ALLIED INTENT</span><b>{filteredAlliedIntents.length}/{submittedAlliedIntents.length}</b><button type="button" aria-pressed={showAlliedIntents} onClick={() => setShowAlliedIntents((visible) => !visible)}>{showAlliedIntents ? "HIDE" : "SHOW"}</button></header>
          {showAlliedIntents && <div className="intent-filters" aria-label="Filter submitted Allied intentions">
            <select aria-label="Intent ownership" value={intentScope} onChange={(event) => setIntentScope(event.target.value as IntentScope)}>
              <option value="ALL">ALL COMMANDERS</option><option value="MINE">MY ORDERS</option><option value="ALLIES">ALLIES ONLY</option>
            </select>
            <select aria-label="Intent type" value={intentKind} onChange={(event) => setIntentKind(event.target.value as IntentVisualKind | "ALL")}>
              <option value="ALL">ALL INTENTS</option>{Object.keys(INTENT_VISUALS).map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </div>}
          {showAlliedIntents && filteredAlliedIntents.slice(0, 6).map((order) => {
            const deployment = campaign.deployments.find((candidate) => candidate.id === order.unitId);
            const visual = intentVisual(order);
            return (
              <button
                type="button"
                className={activeFocusedIntentId === order.id ? "active" : ""}
                key={order.id}
                aria-pressed={activeFocusedIntentId === order.id}
                aria-label={`${deployment?.callsign ?? order.unitId} ${visual.kind.toLowerCase()} intent`}
                onClick={() => setFocusedIntentId((current) => current === order.id ? undefined : order.id)}
              >
                <i style={{ color: visual.color, borderColor: visual.color }}>{visual.glyph}</i>
                <span><strong><span>{deployment?.callsign ?? order.unitId}</span><em>{order.submittedBy === campaign.viewer.userId ? "YOU" : "ALLY"}</em></strong><small>{visual.kind} · {order.orderType} → {order.endHex.q}.{order.endHex.r}{intentActionLabel(order) ? ` · ${intentActionLabel(order)}` : ""}</small></span>
              </button>
            );
          })}
          {showAlliedIntents && filteredAlliedIntents.length === 0 && <p>NO SUBMITTED INTENTS MATCH THIS FILTER</p>}
          {showAlliedIntents && filteredAlliedIntents.length > 6 && <p>+{filteredAlliedIntents.length - 6} MORE MATCHING INTENTS</p>}
        </div>
      )}
      {markers.length > 0 && (
        <div className="map-marker-roster" role="region" aria-label="Shared Allied tactical markers">
          <header><span>COMMAND MARKERS</span><b>{markers.length}</b></header>
          {markers.slice(-6).map((marker) => (
            <div key={marker.id} className={marker.own ? "own" : "ally"}>
              <i style={{ backgroundColor: MARKER_COLORS[marker.kind] }} />
              <span><strong>{marker.kind} · {marker.coord.q}.{marker.coord.r}</strong><small>{marker.label || (marker.own ? "YOUR MARKER" : "ALLIED COMMAND")} · {marker.own ? "YOU" : "ALLY"}</small></span>
              {marker.canRemove && <button type="button" onClick={() => onRemoveMarker(marker.id)} aria-label={`Clear ${marker.kind} marker at ${marker.coord.q}.${marker.coord.r}`}>CLEAR</button>}
            </div>
          ))}
        </div>
      )}
      {alliedCommandColors.size > 1 && (
        <div className="map-commanders" role="region" aria-label="Allied commanders represented on the tactical map">
          <span>COMBINED FORCE</span>
          {[...alliedCommandColors].map(([ownerId, color]) => (
            <i key={ownerId} style={{ color }}><b style={{ backgroundColor: color }} />{alliedCommandLabels.get(ownerId) ?? "ALLY"}</i>
          ))}
        </div>
      )}
      <div className="map-legend">
        {layer === "INTEL" ? (
          <><span><i className="legend-chip allied" /> VISIBLE</span><span><i className="legend-chip intent" /> OBSERVED</span><span>S# SENSOR</span></>
        ) : layer === "SUPPLY" ? (
          <><span><i className="legend-chip intent" /> SUPPLY ROUTE</span><span>S# SMALL</span><span>M# MEDICAL</span></>
        ) : (
          <><span><i className="legend-chip maneuver" /> MOVE</span><span><i className="legend-chip assault" /> ATTACK</span><span><i className="legend-chip support" /> SUPPORT</span><span><i className="legend-chip fortify" /> FORTIFY</span></>
        )}
      </div>
    </div>
  );
}
