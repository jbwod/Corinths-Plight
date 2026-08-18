import {
  createAdminMapDocument,
  getAdminMapEdgeFeatureDefinition,
  getAdminMapPointFeatureDefinition,
  type AdminMapBodyV1,
  type AdminMapDocumentV1,
  type AdminMapEdgeFeatureId,
  type AdminMapEdgeFeatureV1,
  type AdminMapHexDirection,
  type AdminMapPointFeatureId,
  type AdminMapPointFeatureV1,
} from "../packages/rules-engine/src";

const DIRECTIONS = [
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
] as const;

export const ADMIN_MAP_DIRECTION_LABELS = ["N", "NE", "SE", "S", "SW", "NW"] as const;

export interface PointFeatureEdit {
  id?: string;
  featureId: AdminMapPointFeatureId;
  q: number;
  r: number;
}

export interface EdgeFeatureEdit {
  id?: string;
  featureId: AdminMapEdgeFeatureId;
  q: number;
  r: number;
  direction: AdminMapHexDirection;
}

export interface MapFeatureEditResult<Feature> {
  document: AdminMapDocumentV1;
  feature: Feature;
}

function body(document: AdminMapDocumentV1): AdminMapBodyV1 {
  return {
    schema: document.schema,
    schemaVersion: document.schemaVersion,
    generatorVersion: document.generatorVersion,
    vocabularyVersion: document.vocabularyVersion,
    preset: document.preset,
    seed: document.seed,
    width: document.width,
    height: document.height,
    topology: document.topology,
    cells: document.cells,
    pointFeatures: document.pointFeatures,
    edgeFeatures: document.edgeFeatures,
  };
}

function codePointCompare(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function integer(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a whole number.`);
  return value;
}

function ensureEditableCoordinate(document: AdminMapDocumentV1, q: number, r: number): void {
  integer(q, "Q");
  integer(r, "R");
  if (q < 0 || q >= document.width || r < 0 || r >= document.height) {
    throw new Error(`Hex ${q},${r} is outside this ${document.width} × ${document.height} map.`);
  }
}

function pointId(edit: PointFeatureEdit): string {
  return edit.id ?? `point:manual:${edit.featureId.toLowerCase()}:${edit.q}:${edit.r}`;
}

function edgeId(edit: EdgeFeatureEdit, canonical: CanonicalEdge): string {
  return edit.id ?? `edge:manual:${edit.featureId.toLowerCase()}:${canonical.q}:${canonical.r}:${canonical.direction}`;
}

interface CanonicalEdge {
  q: number;
  r: number;
  direction: AdminMapHexDirection;
}

export function canonicalAdminMapEdge(
  document: AdminMapDocumentV1,
  q: number,
  r: number,
  direction: AdminMapHexDirection,
): CanonicalEdge {
  ensureEditableCoordinate(document, q, r);
  if (!Number.isSafeInteger(direction) || direction < 0 || direction > 5) {
    throw new Error("Direction must be an integer from 0 through 5.");
  }
  const delta = DIRECTIONS[direction];
  const target = { q: q + delta.q, r: r + delta.r };
  ensureEditableCoordinate(document, target.q, target.r);
  if (q < target.q || (q === target.q && r < target.r)) return { q, r, direction };
  return {
    q: target.q,
    r: target.r,
    direction: ((direction + 3) % 6) as AdminMapHexDirection,
  };
}

export function upsertAdminMapPointFeature(
  document: AdminMapDocumentV1,
  edit: PointFeatureEdit,
): MapFeatureEditResult<AdminMapPointFeatureV1> {
  ensureEditableCoordinate(document, edit.q, edit.r);
  const definition = getAdminMapPointFeatureDefinition(edit.featureId);
  if (!definition) throw new Error(`${edit.featureId} is not in the pinned point-feature vocabulary.`);
  if (edit.id && !document.pointFeatures.some((feature) => feature.id === edit.id)) {
    throw new Error("The selected point feature no longer exists in this map revision.");
  }
  const feature: AdminMapPointFeatureV1 = {
    id: pointId(edit),
    featureId: edit.featureId,
    q: edit.q,
    r: edit.r,
    mechanicalFeatureId: definition.mechanicalFeatureId,
    mechanicsStatus: definition.mechanicsStatus,
  };
  const pointFeatures = [
    ...document.pointFeatures.filter((existing) => existing.id !== edit.id),
    feature,
  ].sort(codePointCompare);
  return {
    feature,
    document: createAdminMapDocument({ ...body(document), pointFeatures }),
  };
}

export function removeAdminMapPointFeature(
  document: AdminMapDocumentV1,
  id: string,
): AdminMapDocumentV1 {
  if (!document.pointFeatures.some((feature) => feature.id === id)) {
    throw new Error("The selected point feature no longer exists in this map revision.");
  }
  return createAdminMapDocument({
    ...body(document),
    pointFeatures: document.pointFeatures.filter((feature) => feature.id !== id),
  });
}

export function upsertAdminMapEdgeFeature(
  document: AdminMapDocumentV1,
  edit: EdgeFeatureEdit,
): MapFeatureEditResult<AdminMapEdgeFeatureV1> {
  const canonical = canonicalAdminMapEdge(document, edit.q, edit.r, edit.direction);
  const definition = getAdminMapEdgeFeatureDefinition(edit.featureId);
  if (!definition) throw new Error(`${edit.featureId} is not in the pinned edge-feature vocabulary.`);
  if (edit.id && !document.edgeFeatures.some((feature) => feature.id === edit.id)) {
    throw new Error("The selected edge feature no longer exists in this map revision.");
  }
  const feature: AdminMapEdgeFeatureV1 = {
    id: edgeId(edit, canonical),
    featureId: edit.featureId,
    ...canonical,
    mechanicalFeatureId: definition.mechanicalFeatureId,
    mechanicsStatus: definition.mechanicsStatus,
  };
  const edgeFeatures = [
    ...document.edgeFeatures.filter((existing) => existing.id !== edit.id),
    feature,
  ].sort(codePointCompare);
  return {
    feature,
    document: createAdminMapDocument({ ...body(document), edgeFeatures }),
  };
}

export function removeAdminMapEdgeFeature(
  document: AdminMapDocumentV1,
  id: string,
): AdminMapDocumentV1 {
  if (!document.edgeFeatures.some((feature) => feature.id === id)) {
    throw new Error("The selected edge feature no longer exists in this map revision.");
  }
  return createAdminMapDocument({
    ...body(document),
    edgeFeatures: document.edgeFeatures.filter((feature) => feature.id !== id),
  });
}
