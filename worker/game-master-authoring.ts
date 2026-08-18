import {
  ADMIN_MAP_MAX_IMPORT_CHARACTERS,
  ADMIN_MAP_TERRAIN_VOCABULARY,
  AdminMapValidationError,
  exportAdminMap,
  validateAdminMap,
  type AdminMapDocumentV1,
} from "../packages/rules-engine/src";
import {
  GAME_MASTER_SKIRMISH_MAX_ROUNDS,
  GAME_MASTER_SKIRMISH_POLICY_KEY,
  PUBLIC_V1_ECONOMY_POLICY_ID,
} from "../packages/domain/src";
import type { GameMasterAccessDecision } from "./auth";
import { campaignCommandHash, canonicalCampaignJson } from "./campaign-contracts";
import type { Env } from "./env";
import {
  GAME_MASTER_SCENARIO_VERSION,
  GameMasterRuntimeValidationError,
  gameMasterScenarioContentKey,
  gameMasterScenarioId,
  selectGameMasterInsertionHex,
} from "./game-master-runtime";
import {
  parseGameMasterCampaignCreate,
  parseGameMasterMapPublish,
  parseGameMasterMapSave,
} from "./game-master-validation";
import { errorResponse, json, readJson } from "./http";

type AuthorizedGameMaster = Extract<GameMasterAccessDecision, { allowed: true }>;
type AuthoringOperation = "MAP_SAVE" | "MAP_PUBLISH" | "CAMPAIGN_CREATE";
const GAME_MASTER_AUTHORING_RESERVATION_LEASE_MS = 120_000;

interface MapRow {
  id: string;
  name: string;
  planet_id: string | null;
  planet_name: string | null;
  preset: AdminMapDocumentV1["preset"];
  seed: string;
  status: "DRAFT" | "PUBLISHED";
  revision: number;
  schema_version: number;
  generator_version: string;
  vocabulary_version: string;
  content_hash: string;
  document_json: string;
  mechanics_mapping_json: string;
  updated_at: number;
}

interface PriorReceiptRow {
  operation: string;
  target_id: string;
  request_hash: string;
  reservation_token: string;
  status_code: number | null;
  response_json: string | null;
  created_at: number;
}

interface StrategicCampaignAnchorRow {
  map_id: string;
  map_revision: number;
  ruleset_id: string;
  planet_location_id: string;
  planet_node_id: string;
  planet_position_json: string;
}

type AuthoringReservation =
  | { kind: "OWNER"; token: string }
  | { kind: "RESPONSE"; response: Response };

const mapPublishPath = /^\/api\/game-master\/maps\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/publish$/;
const mapDetailPath = /^\/api\/game-master\/maps\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/;

function mapDto(row: MapRow, includeDocument = false): Record<string, unknown> {
  return {
    mapId: row.id,
    name: row.name,
    ...(row.planet_id ? { planetId: row.planet_id, planetName: row.planet_name } : {}),
    preset: row.preset,
    seed: row.seed,
    status: row.status,
    revision: row.revision,
    schemaVersion: row.schema_version,
    generatorVersion: row.generator_version,
    vocabularyVersion: row.vocabulary_version,
    contentHash: row.content_hash,
    mechanicsMapping: JSON.parse(row.mechanics_mapping_json) as Record<string, string>,
    updatedAt: row.updated_at,
    ...(includeDocument ? { document: JSON.parse(row.document_json) as AdminMapDocumentV1 } : {}),
  };
}

async function authoringBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw Object.assign(new Error("Use application/json for this request."), { status: 415, code: "JSON_REQUIRED" });
  }
  try {
    return await readJson<unknown>(request, ADMIN_MAP_MAX_IMPORT_CHARACTERS + 32_768);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      throw Object.assign(new Error("Game Master map command exceeds the map import safety limit."), {
        status: 413,
        code: "REQUEST_TOO_LARGE",
      });
    }
    throw Object.assign(new Error("Request body must contain valid JSON."), { status: 400, code: "JSON_INVALID" });
  }
}

async function requestHash(
  actorUserId: string,
  operation: AuthoringOperation,
  target: string,
  requestBody: unknown,
): Promise<string> {
  return campaignCommandHash({ actorUserId, operation, target, requestBody });
}

async function priorResponse(
  env: Env,
  actorUserId: string,
  operation: AuthoringOperation,
  targetId: string,
  commandId: string,
  hash: string,
): Promise<Response | undefined> {
  const prior = await env.DB.prepare(`SELECT operation,target_id,request_hash,reservation_token,status_code,response_json,created_at
      FROM game_master_authoring_receipts WHERE actor_user_id=?1 AND command_id=?2 LIMIT 1`)
    .bind(actorUserId, commandId).first<PriorReceiptRow>();
  if (!prior) return undefined;
  if (prior.operation !== operation || prior.target_id !== targetId || prior.request_hash !== hash) {
    return errorResponse(409, "COMMAND_REUSED", "commandId was already used for a different Game Master command.");
  }
  if (prior.status_code === null || prior.response_json === null) {
    return undefined;
  }
  return json(JSON.parse(prior.response_json), { status: prior.status_code });
}

async function reserveAuthoringCommand(
  env: Env,
  actorUserId: string,
  operation: AuthoringOperation,
  targetId: string,
  commandId: string,
  hash: string,
  requestProjection: unknown,
): Promise<AuthoringReservation> {
  const token = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO game_master_authoring_receipts
      (actor_user_id,command_id,operation,target_id,request_hash,request_json,reservation_token,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
      ON CONFLICT(actor_user_id,command_id) DO NOTHING`)
      .bind(actorUserId, commandId, operation, targetId, hash,
        canonicalCampaignJson(requestProjection), token, now),
  ]);
  const load = () => env.DB.prepare(`SELECT operation,target_id,request_hash,reservation_token,status_code,response_json,created_at
      FROM game_master_authoring_receipts WHERE actor_user_id=?1 AND command_id=?2 LIMIT 1`)
    .bind(actorUserId, commandId).first<PriorReceiptRow>();
  let row = await load();
  if (!row) throw new Error("GAME_MASTER_AUTHORING_RESERVATION_FAILED");
  if (row.operation !== operation || row.target_id !== targetId || row.request_hash !== hash) {
    return { kind: "RESPONSE", response: errorResponse(409, "COMMAND_REUSED", "commandId was already used for a different Game Master command.") };
  }
  if (row.status_code !== null && row.response_json !== null) {
    return { kind: "RESPONSE", response: json(JSON.parse(row.response_json), { status: row.status_code }) };
  }
  if (row.reservation_token !== token && row.created_at <= now - GAME_MASTER_AUTHORING_RESERVATION_LEASE_MS) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE game_master_authoring_receipts
        SET reservation_token=?1,created_at=?2
        WHERE actor_user_id=?3 AND command_id=?4 AND operation=?5 AND target_id=?6
          AND request_hash=?7 AND reservation_token=?8 AND created_at=?9 AND status_code IS NULL`)
        .bind(token, now, actorUserId, commandId, operation, targetId, hash,
          row.reservation_token, row.created_at),
    ]);
    row = await load();
    if (!row) throw new Error("GAME_MASTER_AUTHORING_RESERVATION_MISSING");
    if (row.status_code !== null && row.response_json !== null) {
      return { kind: "RESPONSE", response: json(JSON.parse(row.response_json), { status: row.status_code }) };
    }
  }
  if (row.reservation_token !== token) {
    return { kind: "RESPONSE", response: errorResponse(409, "COMMAND_IN_PROGRESS", "The prior Game Master authoring command is still in progress.") };
  }
  return { kind: "OWNER", token };
}

function completionStatements(
  env: Env,
  actor: AuthorizedGameMaster,
  operation: AuthoringOperation,
  targetId: string,
  commandId: string,
  hash: string,
  requestProjection: unknown,
  reservationToken: string,
  response: Response,
  responseProjection: unknown,
  guardSql = "1",
  guardBindings: readonly unknown[] = [],
): D1PreparedStatement[] {
  const responseJson = canonicalCampaignJson(responseProjection);
  void hash;
  void requestProjection;
  const now = Date.now();
  return [
    env.DB.prepare(`UPDATE game_master_authoring_receipts
      SET status_code=?1,response_json=?2,completed_at=?3
      WHERE actor_user_id=?4 AND command_id=?5 AND reservation_token=?6
        AND operation=?7 AND target_id=?8 AND request_hash=?9 AND status_code IS NULL
        AND (${guardSql})`)
      .bind(response.status, responseJson, now, actor.userId, commandId, reservationToken,
        operation, targetId, hash, ...guardBindings),
    env.DB.prepare(`INSERT INTO game_master_authoring_audit_events
      (id,actor_user_id,grant_source,operation,target_id,command_id,request_hash,request_json,
       response_status,response_json,occurred_at)
      SELECT ?1,receipts.actor_user_id,?2,receipts.operation,receipts.target_id,receipts.command_id,
        receipts.request_hash,receipts.request_json,receipts.status_code,receipts.response_json,?3
      FROM game_master_authoring_receipts AS receipts
      WHERE receipts.actor_user_id=?4 AND receipts.command_id=?5 AND receipts.reservation_token=?6
        AND receipts.status_code IS NOT NULL
      ON CONFLICT(actor_user_id,command_id) DO NOTHING`)
      .bind(`gm-authoring-audit:${actor.userId}:${commandId}`, actor.source, now,
        actor.userId, commandId, reservationToken),
  ];
}

function responseWithProjection(value: unknown, status = 200): Response {
  return json(value, { status });
}

async function committedResponse(
  env: Env,
  actor: AuthorizedGameMaster,
  operation: AuthoringOperation,
  targetId: string,
  commandId: string,
  hash: string,
  requestProjection: unknown,
  reservationToken: string,
  unavailable: Response,
  unavailableProjection: unknown,
): Promise<Response> {
  const load = () => env.DB.prepare(`SELECT operation,target_id,request_hash,reservation_token,status_code,response_json,created_at
    FROM game_master_authoring_receipts WHERE actor_user_id=?1 AND command_id=?2 LIMIT 1`)
    .bind(actor.userId, commandId).first<PriorReceiptRow>();
  let row = await load();
  if (!row) throw new Error("GAME_MASTER_AUTHORING_RESERVATION_MISSING");
  if (row.operation !== operation || row.target_id !== targetId || row.request_hash !== hash) {
    return errorResponse(409, "COMMAND_REUSED", "commandId was already used for a different Game Master command.");
  }
  if (row.status_code !== null && row.response_json !== null) {
    return json(JSON.parse(row.response_json), { status: row.status_code });
  }
  if (row.reservation_token !== reservationToken) {
    return errorResponse(409, "COMMAND_IN_PROGRESS", "The prior Game Master authoring command is still in progress.");
  }
  await env.DB.batch(completionStatements(env, actor, operation, targetId, commandId, hash,
    requestProjection, reservationToken, unavailable, unavailableProjection));
  row = await load();
  if (!row || row.reservation_token !== reservationToken || row.status_code === null || row.response_json === null) {
    throw new Error("GAME_MASTER_AUTHORING_FINALIZATION_FAILED");
  }
  return json(JSON.parse(row.response_json), { status: row.status_code });
}

function deterministicAuthoringId(prefix: "gm-map" | "gm-campaign", hash: string): string {
  return `${prefix}-${hash.slice(0, 32)}`;
}

function strategicCampaignPosition(hash: string, planetPositionJson: string): { x: number; y: number } {
  let origin = { x: 50, y: 50 };
  try {
    const parsed = JSON.parse(planetPositionJson) as { x?: unknown; y?: unknown };
    if (typeof parsed.x === "number" && Number.isFinite(parsed.x) &&
        typeof parsed.y === "number" && Number.isFinite(parsed.y)) {
      origin = { x: parsed.x, y: parsed.y };
    }
  } catch {
    // A node position is presentation-only; retain a deterministic safe origin.
  }
  const angleSeed = Number.parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  const angle = angleSeed * Math.PI * 2;
  return {
    x: Number((origin.x + Math.cos(angle) * 8).toFixed(3)),
    y: Number((origin.y + Math.sin(angle) * 8).toFixed(3)),
  };
}

async function listMaps(env: Env, url: URL): Promise<Response> {
  const limitValue = url.searchParams.get("limit");
  const limit = limitValue === null ? 25 : Number(limitValue);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    return errorResponse(400, "LIMIT_INVALID", "limit must be an integer from 1 through 50.");
  }
  const [maps, planets, units] = await Promise.all([
    env.DB.prepare(`SELECT maps.id,maps.name,maps.planet_id,planets.name AS planet_name,maps.preset,maps.seed,
        maps.status,maps.revision,maps.schema_version,maps.generator_version,maps.vocabulary_version,
        maps.content_hash,maps.mechanics_mapping_json,maps.updated_at
      FROM game_master_maps AS maps LEFT JOIN planets ON planets.id=maps.planet_id
      ORDER BY maps.updated_at DESC,maps.id DESC LIMIT ?1`).bind(limit).all<MapRow>(),
    env.DB.prepare(`SELECT id,name FROM planets ORDER BY name,id`).all<{ id: string; name: string }>(),
    env.DB.prepare(`SELECT enemies.id,enemies.name,enemies.faction_id
      FROM enemy_definitions AS enemies JOIN rulesets ON rulesets.id=enemies.ruleset_id
      WHERE rulesets.status='ACTIVE' AND enemies.definition_status IN ('active','experimental')
      ORDER BY enemies.name,enemies.id`).all<{ id: string; name: string; faction_id: string }>(),
  ]);
  return json({
    maps: maps.results.map((row) => mapDto(row)),
    planets: planets.results.map((row) => ({ planetId: row.id, name: row.name })),
    unitDefinitions: units.results.map((row) => ({ definitionId: row.id, name: row.name, factionId: row.faction_id })),
    mechanicalProfiles: ADMIN_MAP_TERRAIN_VOCABULARY.map((entry) => ({
      visualBiomeId: entry.id,
      terrainGroup: entry.group,
      terrainId: entry.mechanicalTerrainProfileId,
      name: entry.label,
      mechanicsStatus: entry.mechanicsStatus,
      locked: true,
    })),
  });
}

async function getMap(env: Env, mapId: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT maps.id,maps.name,maps.planet_id,planets.name AS planet_name,maps.preset,
      maps.seed,maps.status,maps.revision,maps.schema_version,maps.generator_version,maps.vocabulary_version,
      maps.content_hash,maps.document_json,maps.mechanics_mapping_json,maps.updated_at
    FROM game_master_maps AS maps LEFT JOIN planets ON planets.id=maps.planet_id
    WHERE maps.id=?1 LIMIT 1`).bind(mapId).first<MapRow>();
  if (!row) return errorResponse(404, "MAP_NOT_FOUND", "The saved map does not exist.");
  return json({ map: mapDto(row, true) });
}

async function saveMap(
  request: Request,
  env: Env,
  actor: AuthorizedGameMaster,
): Promise<Response> {
  const intent = parseGameMasterMapSave(await authoringBody(request));
  const canonicalDocument = exportAdminMap(intent.document);
  const requestProjection = {
    commandId: intent.commandId,
    mapId: intent.mapId ?? null,
    expectedRevision: intent.expectedRevision ?? null,
    name: intent.name,
    planetId: intent.planetId ?? null,
    documentHash: intent.document.hash,
    mechanicsMapping: intent.mechanicsMapping,
  };
  const hash = await requestHash(actor.userId, intent.operation, intent.mapId ?? intent.name, requestProjection);
  const mapId = intent.mapId ?? deterministicAuthoringId("gm-map", hash);
  const prior = await priorResponse(env, actor.userId, intent.operation, mapId, intent.commandId, hash);
  if (prior) return prior;
  if (intent.planetId) {
    const planet = await env.DB.prepare(`SELECT id FROM planets WHERE id=?1 LIMIT 1`).bind(intent.planetId).first();
    if (!planet) return errorResponse(404, "PLANET_NOT_FOUND", "The selected planet does not exist.");
  }
  const existing = intent.mapId
    ? await env.DB.prepare(`SELECT maps.id,maps.name,maps.planet_id,NULL AS planet_name,maps.preset,
        maps.seed,maps.status,maps.revision,maps.schema_version,maps.generator_version,maps.vocabulary_version,
        maps.content_hash,maps.document_json,maps.mechanics_mapping_json,maps.updated_at
      FROM game_master_maps AS maps WHERE maps.id=?1 LIMIT 1`).bind(intent.mapId).first<MapRow>()
    : null;
  if (!intent.mapId && intent.expectedRevision !== undefined) {
    return errorResponse(400, "MAP_ID_REQUIRED", "mapId is required when expectedRevision is supplied.");
  }
  if (intent.mapId && intent.expectedRevision === undefined) {
    return errorResponse(400, "MAP_REVISION_REQUIRED", "expectedRevision is required when mapId is supplied.");
  }
  if (intent.mapId && !existing) {
    return errorResponse(409, "MAP_REVISION_CONFLICT", "The map draft no longer exists at that revision.");
  }
  if (existing && (existing.status !== "DRAFT" || existing.revision !== intent.expectedRevision)) {
    return errorResponse(409, "MAP_REVISION_CONFLICT", "The map is published or its revision has changed.", {
      currentRevision: existing.revision,
    });
  }
  const nextRevision = existing ? existing.revision + 1 : 1;
  const mutationToken = crypto.randomUUID();
  const mechanicsJson = canonicalCampaignJson(intent.mechanicsMapping);
  const dtoRow: MapRow = {
    id: mapId,
    name: intent.name,
    planet_id: intent.planetId ?? null,
    planet_name: null,
    preset: intent.document.preset,
    seed: intent.document.seed,
    status: "DRAFT",
    revision: nextRevision,
    schema_version: intent.document.schemaVersion,
    generator_version: intent.document.generatorVersion,
    vocabulary_version: intent.document.vocabularyVersion,
    content_hash: intent.document.hash,
    document_json: canonicalDocument,
    mechanics_mapping_json: mechanicsJson,
    updated_at: Date.now(),
  };
  const payload = { message: existing ? "Map draft updated." : "Map draft saved.", map: mapDto(dtoRow, true) };
  const response = responseWithProjection(payload, existing ? 200 : 201);
  const reservation = await reserveAuthoringCommand(env, actor.userId, intent.operation, mapId,
    intent.commandId, hash, requestProjection);
  if (reservation.kind === "RESPONSE") return reservation.response;
  const statements: D1PreparedStatement[] = [];
  if (existing) {
    statements.push(env.DB.prepare(`UPDATE game_master_maps SET name=?1,planet_id=?2,preset=?3,seed=?4,
      revision=revision+1,schema_version=?5,generator_version=?6,vocabulary_version=?7,content_hash=?8,
      document_json=?9,mechanics_mapping_json=?10,updated_by_user_id=?11,updated_at=?12,last_mutation_token=?13
      WHERE id=?14 AND status='DRAFT' AND revision=?15`)
      .bind(intent.name, intent.planetId ?? null, intent.document.preset, intent.document.seed,
        intent.document.schemaVersion, intent.document.generatorVersion, intent.document.vocabularyVersion,
        intent.document.hash, canonicalDocument, mechanicsJson, actor.userId, dtoRow.updated_at, mutationToken,
        mapId, intent.expectedRevision));
  } else {
    statements.push(env.DB.prepare(`INSERT INTO game_master_maps
      (id,name,planet_id,preset,seed,status,revision,schema_version,generator_version,vocabulary_version,
       content_hash,document_json,mechanics_mapping_json,created_by_user_id,updated_by_user_id,updated_at,last_mutation_token)
      VALUES (?1,?2,?3,?4,?5,'DRAFT',1,?6,?7,?8,?9,?10,?11,?12,?12,?13,?14)
      ON CONFLICT DO NOTHING`).bind(mapId, intent.name, intent.planetId ?? null, intent.document.preset,
      intent.document.seed, intent.document.schemaVersion, intent.document.generatorVersion,
      intent.document.vocabularyVersion, intent.document.hash, canonicalDocument, mechanicsJson,
      actor.userId, dtoRow.updated_at, mutationToken));
  }
  statements.push(env.DB.prepare(`INSERT INTO game_master_map_revisions
    (id,map_id,revision,content_hash,schema_version,generator_version,vocabulary_version,document_json,
     mechanics_mapping_json,authored_by_user_id,created_at)
    SELECT ?1,id,revision,content_hash,schema_version,generator_version,vocabulary_version,document_json,
      mechanics_mapping_json,?2,?3 FROM game_master_maps WHERE id=?4 AND last_mutation_token=?5`)
    .bind(`${mapId}@${nextRevision}`, actor.userId, dtoRow.updated_at, mapId, mutationToken));
  statements.push(...completionStatements(env, actor, intent.operation, mapId, intent.commandId, hash,
    requestProjection, reservation.token, response, payload,
    `EXISTS (SELECT 1 FROM game_master_maps WHERE id=?10 AND last_mutation_token=?11)`, [mapId, mutationToken]));
  await env.DB.batch(statements);
  const conflictPayload = { error: { code: "MAP_REVISION_CONFLICT", message: "The map revision changed before the draft could be saved." } };
  return committedResponse(env, actor, intent.operation, mapId, intent.commandId, hash,
    requestProjection, reservation.token, responseWithProjection(conflictPayload, 409), conflictPayload);
}

function publicationBlockers(
  document: AdminMapDocumentV1,
): { biomes: string[]; pointFeatures: string[]; edgeFeatures: string[] } {
  const biomes = new Set<string>();
  for (const cell of document.cells) {
    if (!cell.mechanicalTerrainProfileId || cell.mechanicsStatus !== "PUBLISHED") {
      biomes.add(cell.visualBiomeId);
    }
  }
  return {
    biomes: [...biomes].sort(),
    pointFeatures: [...new Set(document.pointFeatures
      .filter((feature) => !feature.mechanicalFeatureId || feature.mechanicsStatus !== "PUBLISHED")
      .map((feature) => feature.featureId))].sort(),
    edgeFeatures: [...new Set(document.edgeFeatures
      .filter((feature) => !feature.mechanicalFeatureId || feature.mechanicsStatus !== "PUBLISHED")
      .map((feature) => feature.featureId))].sort(),
  };
}

async function publishMap(
  request: Request,
  env: Env,
  actor: AuthorizedGameMaster,
  mapId: string,
): Promise<Response> {
  const intent = parseGameMasterMapPublish(await authoringBody(request));
  const requestProjection = { ...intent, mapId };
  const hash = await requestHash(actor.userId, intent.operation, mapId, requestProjection);
  const prior = await priorResponse(env, actor.userId, intent.operation, mapId, intent.commandId, hash);
  if (prior) return prior;
  const row = await env.DB.prepare(`SELECT maps.id,maps.name,maps.planet_id,planets.name AS planet_name,maps.preset,
      maps.seed,maps.status,maps.revision,maps.schema_version,maps.generator_version,maps.vocabulary_version,
      maps.content_hash,maps.document_json,maps.mechanics_mapping_json,maps.updated_at
    FROM game_master_maps AS maps LEFT JOIN planets ON planets.id=maps.planet_id WHERE maps.id=?1 LIMIT 1`)
    .bind(mapId).first<MapRow>();
  if (!row) return errorResponse(404, "MAP_NOT_FOUND", "The map does not exist.");
  if (row.status !== "DRAFT" || row.revision !== intent.expectedRevision) {
    return errorResponse(409, "MAP_REVISION_CONFLICT", "The map is published or its revision has changed.", {
      currentRevision: row.revision,
    });
  }
  let document: AdminMapDocumentV1;
  try {
    document = validateAdminMap(JSON.parse(row.document_json));
  } catch (error) {
    if (error instanceof AdminMapValidationError) {
      return errorResponse(409, "MAP_DOCUMENT_INVALID", "The saved map document no longer matches its governed schema and content hash.", {
        path: error.path,
      });
    }
    throw error;
  }
  const blockers = publicationBlockers(document);
  if (blockers.biomes.length || blockers.pointFeatures.length || blockers.edgeFeatures.length) {
    const payload = { error: { code: "MAP_BALANCE_REQUIRED", message: "Map publication requires explicit mechanics for every used biome and feature.", details: blockers } };
    const response = responseWithProjection(payload, 409);
    const reservation = await reserveAuthoringCommand(env, actor.userId, intent.operation, mapId,
      intent.commandId, hash, requestProjection);
    if (reservation.kind === "RESPONSE") return reservation.response;
    const receipt = completionStatements(env, actor, intent.operation, mapId, intent.commandId, hash,
      requestProjection, reservation.token, response, payload,
      `EXISTS (SELECT 1 FROM game_master_maps WHERE id=?10 AND revision=?11)`,
      [mapId, intent.expectedRevision]);
    await env.DB.batch(receipt);
    const conflictPayload = { error: { code: "MAP_REVISION_CONFLICT", message: "The map revision changed before publication." } };
    return committedResponse(env, actor, intent.operation, mapId, intent.commandId, hash,
      requestProjection, reservation.token, responseWithProjection(conflictPayload, 409), conflictPayload);
  }
  const nextRevision = row.revision + 1;
  const mutationToken = crypto.randomUUID();
  const updatedAt = Date.now();
  const published = { ...row, status: "PUBLISHED" as const, revision: nextRevision, updated_at: updatedAt };
  const payload = { message: "Map published for authoring selection.", map: mapDto(published, true) };
  const response = responseWithProjection(payload);
  const reservation = await reserveAuthoringCommand(env, actor.userId, intent.operation, mapId,
    intent.commandId, hash, requestProjection);
  if (reservation.kind === "RESPONSE") return reservation.response;
  const statements = [
    env.DB.prepare(`UPDATE game_master_maps SET status='PUBLISHED',revision=revision+1,
      published_by_user_id=?1,published_at=?2,updated_by_user_id=?1,updated_at=?2,last_mutation_token=?3
      WHERE id=?4 AND status='DRAFT' AND revision=?5`)
      .bind(actor.userId, updatedAt, mutationToken, mapId, intent.expectedRevision),
    env.DB.prepare(`INSERT INTO game_master_map_revisions
      (id,map_id,revision,content_hash,schema_version,generator_version,vocabulary_version,document_json,
       mechanics_mapping_json,authored_by_user_id,created_at)
      SELECT ?1,id,revision,content_hash,schema_version,generator_version,vocabulary_version,document_json,
        mechanics_mapping_json,?2,?3 FROM game_master_maps WHERE id=?4 AND last_mutation_token=?5`)
      .bind(`${mapId}@${nextRevision}`, actor.userId, updatedAt, mapId, mutationToken),
    ...completionStatements(env, actor, intent.operation, mapId, intent.commandId, hash, requestProjection,
      reservation.token, response, payload, `EXISTS (SELECT 1 FROM game_master_maps WHERE id=?10 AND last_mutation_token=?11)`,
      [mapId, mutationToken]),
  ];
  await env.DB.batch(statements);
  const conflictPayload = { error: { code: "MAP_REVISION_CONFLICT", message: "The map revision changed before publication." } };
  return committedResponse(env, actor, intent.operation, mapId, intent.commandId, hash,
    requestProjection, reservation.token, responseWithProjection(conflictPayload, 409), conflictPayload);
}

async function createCampaign(
  request: Request,
  env: Env,
  actor: AuthorizedGameMaster,
): Promise<Response> {
  const intent = parseGameMasterCampaignCreate(await authoringBody(request));
  const hash = await requestHash(actor.userId, intent.operation, intent.mapId, intent);
  const campaignId = deterministicAuthoringId("gm-campaign", hash);
  const prior = await priorResponse(env, actor.userId, intent.operation, campaignId, intent.commandId, hash);
  if (prior) return prior;
  const map = await env.DB.prepare(`SELECT maps.id,maps.planet_id,maps.status,maps.revision,maps.content_hash,
      maps.document_json,revisions.id AS revision_id,revisions.content_hash AS revision_content_hash
    FROM game_master_maps AS maps
    LEFT JOIN game_master_map_revisions AS revisions
      ON revisions.map_id=maps.id AND revisions.revision=?2
    WHERE maps.id=?1 LIMIT 1`)
    .bind(intent.mapId, intent.mapRevision).first<{
      id: string;
      planet_id: string | null;
      status: "DRAFT" | "PUBLISHED";
      revision: number;
      content_hash: string;
      document_json: string;
      revision_id: string | null;
      revision_content_hash: string | null;
    }>();
  if (!map) return errorResponse(404, "MAP_NOT_FOUND", "The selected saved map does not exist.");
  if (
    map.status !== "PUBLISHED" ||
    map.revision !== intent.mapRevision ||
    map.content_hash !== intent.mapContentHash ||
    map.revision_id !== `${map.id}@${intent.mapRevision}` ||
    map.revision_content_hash !== intent.mapContentHash
  ) {
    return errorResponse(409, "MAP_PIN_CONFLICT", "Campaign creation requires the exact current published map revision and hash.", {
      currentStatus: map.status,
      currentRevision: map.revision,
      currentContentHash: map.content_hash,
    });
  }
  if (map.planet_id && map.planet_id !== intent.planetId) {
    return errorResponse(409, "MAP_PLANET_CONFLICT", "The saved map is assigned to a different planet.");
  }
  let insertionHex: { coord: { q: number; r: number }; environment: string[] };
  try {
    const selected = selectGameMasterInsertionHex(JSON.parse(map.document_json) as AdminMapDocumentV1);
    insertionHex = { coord: selected.coord, environment: selected.environment };
  } catch (error) {
    if (error instanceof AdminMapValidationError || error instanceof GameMasterRuntimeValidationError) {
      return errorResponse(409, "MAP_RUNTIME_INVALID", error.message);
    }
    throw error;
  }
  const [planet, strategicAnchor, duplicate] = await Promise.all([
    env.DB.prepare(`SELECT id,name,strategic_location_id FROM planets WHERE id=?1 LIMIT 1`).bind(intent.planetId)
      .first<{ id: string; name: string; strategic_location_id: string | null }>(),
    env.DB.prepare(`SELECT maps.id AS map_id,maps.revision AS map_revision,maps.ruleset_id,
        planets.strategic_location_id AS planet_location_id,nodes.id AS planet_node_id,
        nodes.position_json AS planet_position_json
      FROM planets
      JOIN strategic_nodes AS nodes
        ON nodes.location_id=planets.strategic_location_id AND nodes.node_type='PLANET'
      JOIN strategic_maps AS maps
        ON maps.id=nodes.map_id AND maps.status IN ('ACTIVE','PAUSED')
      JOIN rulesets ON rulesets.id=maps.ruleset_id AND rulesets.status='ACTIVE'
      WHERE planets.id=?1
      ORDER BY CASE maps.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,maps.id
      LIMIT 1`).bind(intent.planetId).first<StrategicCampaignAnchorRow>(),
    env.DB.prepare(`SELECT id FROM campaigns WHERE planet_id=?1 AND name=?2 LIMIT 1`)
      .bind(intent.planetId, intent.name).first<{ id: string }>(),
  ]);
  if (!planet) return errorResponse(404, "PLANET_NOT_FOUND", "The selected planet does not exist.");
  if (!planet.strategic_location_id || !strategicAnchor) {
    return errorResponse(
      409,
      "ACTIVE_STRATEGIC_MAP_REQUIRED",
      "The selected planet must have a PLANET node on an active system map before a campaign can be created.",
    );
  }
  if (duplicate && duplicate.id !== campaignId) {
    return errorResponse(409, "CAMPAIGN_NAME_EXISTS", "That planet already has a campaign with this name.");
  }
  const revisionId = map.revision_id;
  const scenarioId = gameMasterScenarioId(campaignId);
  const scenarioContentKey = gameMasterScenarioContentKey(campaignId);
  const mapSourceKey = `admin-map/${map.id}@${map.revision}:${map.content_hash}`;
  const insertionZoneId = `${campaignId}:insertion:primary`;
  const strategicSourceId = `source-${campaignId}`;
  const strategicLocationId = `location-${campaignId}`;
  const strategicNodeId = `node-${campaignId}`;
  const strategicOperationId = `operation-${campaignId}`;
  const strategicPosition = strategicCampaignPosition(hash, strategicAnchor.planet_position_json);
  const responsePayload = {
    message: "Recruiting campaign created from the exact published map. Join and deploy a Battalion force to enter tactical play.",
    campaign: {
      campaignId,
      name: intent.name,
      planetId: planet.id,
      planetName: planet.name,
      status: "RECRUITING",
      revision: 1,
      round: 1,
      clockState: "WAITING_FOR_DEPLOYMENT",
      roundDurationMs: intent.roundDurationMs,
      maximumPlayers: intent.maximumPlayers,
      objectives: [],
      deployments: [],
      mapId: map.id,
      mapRevision: map.revision,
      mapContentHash: map.content_hash,
      mapSourceKey,
      scenarioContentKey,
      strategicMapId: strategicAnchor.map_id,
      strategicNodeId,
      strategicOperationId,
      strategicPosition,
      insertionZones: [{
        insertionZoneId,
        coord: insertionHex.coord,
        allowedMethods: ["STANDARD_GROUND"],
      }],
      canJoin: true,
      canEnter: false,
      runtimeStatus: "READY_FOR_DEPLOYMENT",
    },
  };
  const response = responseWithProjection(responsePayload, 201);
  const reservation = await reserveAuthoringCommand(env, actor.userId, intent.operation, campaignId,
    intent.commandId, hash, intent);
  if (reservation.kind === "RESPONSE") return reservation.response;
  const forcePolicy = canonicalCampaignJson({ reinforcementStatus: "OPEN" });
  const strategicReinforcementPolicy = canonicalCampaignJson({ status: "OPEN" });
  const strategicSourceLocator = `${map.id}@${map.revision}:${map.content_hash}`;
  const statements = [
    env.DB.prepare(`INSERT INTO campaigns
      (id,planet_id,ruleset_id,name,status,round_duration_ms,map_source_key,scenario_content_key,
       minimum_players,maximum_players,created_by,force_policy_json,strategic_status,strategic_revision,
       game_master_map_revision_id)
      SELECT ?1,?2,?3,?4,'RECRUITING',?5,?6,?7,1,?8,?9,?10,'MUSTERING',1,?11
      WHERE EXISTS (
        SELECT 1 FROM game_master_maps AS maps
        JOIN game_master_map_revisions AS revisions ON revisions.id=?11 AND revisions.map_id=maps.id
        WHERE maps.id=?12 AND maps.status='PUBLISHED' AND maps.revision=?13
          AND maps.content_hash=?14 AND revisions.revision=?13 AND revisions.content_hash=?14)
      ON CONFLICT DO NOTHING`).bind(campaignId, intent.planetId, strategicAnchor.ruleset_id, intent.name,
      intent.roundDurationMs, mapSourceKey, scenarioContentKey, intent.maximumPlayers, actor.userId,
      forcePolicy, revisionId, map.id, map.revision, map.content_hash),
    env.DB.prepare(`INSERT INTO strategic_content_sources
      (id,source_path,source_locator,source_kind,notes)
      SELECT ?1,?2,?3,'ADMIN_AUTHORED',?4
      WHERE EXISTS (SELECT 1 FROM campaigns WHERE id=?5 AND game_master_map_revision_id=?6)
      ON CONFLICT(id) DO NOTHING`).bind(
      strategicSourceId,
      `game-master/campaigns/${campaignId}`,
      strategicSourceLocator,
      "Game Master campaign linked to its exact published tactical map revision.",
      campaignId,
      revisionId,
    ),
    env.DB.prepare(`INSERT INTO strategic_locations
      (id,parent_location_id,location_type,name,description,status,metadata_json)
      SELECT ?1,?2,'CAMPAIGN',?3,'','ACTIVE',?4
      WHERE EXISTS (SELECT 1 FROM campaigns WHERE id=?5 AND planet_id=?6)
      ON CONFLICT(id) DO NOTHING`).bind(
      strategicLocationId,
      strategicAnchor.planet_location_id,
      `${intent.name} [${campaignId.slice(-8)}]`,
      canonicalCampaignJson({ campaignId, planetId: intent.planetId }),
      campaignId,
      intent.planetId,
    ),
    env.DB.prepare(`INSERT INTO strategic_nodes
      (id,map_id,location_id,node_type,name,control_status,status,position_json,visibility_json,
       source_id,source_locator,metadata_json)
      SELECT ?1,?2,?3,'CAMPAIGN',?4,'UNKNOWN','OPEN',?5,'{"public":true}',?6,?7,?8
      WHERE EXISTS (SELECT 1 FROM strategic_maps
        WHERE id=?2 AND status IN ('ACTIVE','PAUSED') AND revision=?9)
        AND EXISTS (SELECT 1 FROM strategic_locations WHERE id=?3 AND parent_location_id=?10)
        AND EXISTS (SELECT 1 FROM strategic_content_sources WHERE id=?6 AND source_kind='ADMIN_AUTHORED')
      ON CONFLICT(id) DO NOTHING`).bind(
      strategicNodeId,
      strategicAnchor.map_id,
      strategicLocationId,
      `${intent.name} — ${planet.name}`,
      canonicalCampaignJson(strategicPosition),
      strategicSourceId,
      strategicSourceLocator,
      canonicalCampaignJson({ campaignId, planetId: intent.planetId, presentationOnlyPosition: true }),
      strategicAnchor.map_revision,
      strategicAnchor.planet_location_id,
    ),
    env.DB.prepare(`UPDATE campaigns SET strategic_node_id=?1
      WHERE id=?2 AND strategic_node_id IS NULL
        AND EXISTS (SELECT 1 FROM strategic_nodes WHERE id=?1 AND map_id=?3)`)
      .bind(strategicNodeId, campaignId, strategicAnchor.map_id),
    env.DB.prepare(`INSERT INTO strategic_operations
      (id,map_id,node_id,campaign_id,ruleset_id,code,name,role_summary,status,threat_level,
       objectives_json,recommended_capabilities_json,deployment_rules_json,reinforcement_policy_json,
       known_enemy_json,effect_rules_json,source_id,source_locator)
      SELECT ?1,?2,?3,?4,?5,?6,?7,'','MUSTERING','UNKNOWN','[]','[]','{}',?8,'{}','[]',?9,?10
      WHERE EXISTS (SELECT 1 FROM campaigns
        WHERE id=?4 AND strategic_node_id=?3 AND strategic_status='MUSTERING')
      ON CONFLICT(id) DO NOTHING`).bind(
      strategicOperationId,
      strategicAnchor.map_id,
      strategicNodeId,
      campaignId,
      strategicAnchor.ruleset_id,
      `GM-${hash.slice(0, 12).toUpperCase()}`,
      intent.name,
      strategicReinforcementPolicy,
      strategicSourceId,
      strategicSourceLocator,
    ),
    env.DB.prepare(`INSERT INTO game_master_campaign_scenarios
      (campaign_id,scenario_id,scenario_version,scenario_content_key,map_revision_id,map_content_hash,
       objectives_json,enemy_deployments_json,application_policy_key,maximum_rounds,reward_policy_id,
       created_by_user_id)
      SELECT campaigns.id,?1,?2,?3,?4,?5,'[]','[]',?6,?7,?8,?9
      FROM campaigns JOIN game_master_map_revisions AS revisions ON revisions.id=?4
      WHERE campaigns.id=?10 AND campaigns.game_master_map_revision_id=revisions.id
        AND campaigns.map_source_key=?11 AND campaigns.scenario_content_key=?3
        AND revisions.content_hash=?5
      ON CONFLICT DO NOTHING`).bind(scenarioId, GAME_MASTER_SCENARIO_VERSION, scenarioContentKey,
      revisionId, map.content_hash, GAME_MASTER_SKIRMISH_POLICY_KEY, GAME_MASTER_SKIRMISH_MAX_ROUNDS,
      PUBLIC_V1_ECONOMY_POLICY_ID, actor.userId, campaignId, mapSourceKey),
    env.DB.prepare(`INSERT INTO campaign_insertion_zones
      (id,campaign_id,hex_q,hex_r,allowed_methods_json,status,environment_json)
      SELECT ?1,campaign_id,?2,?3,'["STANDARD_GROUND"]','OPEN',?4
      FROM game_master_campaign_scenarios WHERE campaign_id=?5
      ON CONFLICT DO NOTHING`).bind(insertionZoneId, insertionHex.coord.q, insertionHex.coord.r,
      canonicalCampaignJson(insertionHex.environment), campaignId),
    env.DB.prepare(`INSERT INTO campaign_memberships (campaign_id,user_id,battalion_id,side,role)
      SELECT id,?1,NULL,'NEUTRAL','GM' FROM campaigns WHERE id=?2
      ON CONFLICT(campaign_id,user_id) DO NOTHING`).bind(actor.userId, campaignId),
    ...completionStatements(env, actor, intent.operation, campaignId, intent.commandId, hash, intent,
      reservation.token, response, responsePayload,
      `EXISTS (SELECT 1 FROM campaign_memberships WHERE campaign_id=?10 AND user_id=?11 AND role='GM')
       AND EXISTS (SELECT 1 FROM game_master_campaign_scenarios
         WHERE campaign_id=?10 AND map_revision_id=?12 AND map_content_hash=?13
           AND scenario_content_key=?15 AND scenario_version=2
           AND application_policy_key=?16 AND maximum_rounds=?17 AND reward_policy_id=?18)
       AND EXISTS (SELECT 1 FROM campaign_insertion_zones
         WHERE id=?14 AND campaign_id=?10 AND status='OPEN')
       AND EXISTS (SELECT 1 FROM campaigns
         WHERE id=?10 AND strategic_node_id=?19 AND strategic_status='MUSTERING')
       AND EXISTS (SELECT 1 FROM strategic_nodes
         WHERE id=?19 AND map_id=?20 AND location_id=?21 AND node_type='CAMPAIGN')
       AND EXISTS (SELECT 1 FROM strategic_operations
         WHERE id=?22 AND campaign_id=?10 AND node_id=?19 AND status='MUSTERING'
           AND threat_level='UNKNOWN' AND objectives_json='[]')`,
      [campaignId, actor.userId, revisionId, map.content_hash, insertionZoneId, scenarioContentKey,
        GAME_MASTER_SKIRMISH_POLICY_KEY, GAME_MASTER_SKIRMISH_MAX_ROUNDS,
        PUBLIC_V1_ECONOMY_POLICY_ID, strategicNodeId, strategicAnchor.map_id,
        strategicLocationId, strategicOperationId]),
  ];
  await env.DB.batch(statements);
  const conflictPayload = { error: { code: "CAMPAIGN_CREATE_CONFLICT", message: "The recruiting campaign could not be created from the exact published map revision." } };
  return committedResponse(env, actor, intent.operation, campaignId, intent.commandId, hash, intent,
    reservation.token, responseWithProjection(conflictPayload, 409), conflictPayload);
}

export async function routeGameMasterAuthoringRequest(
  request: Request,
  env: Env,
  actor: AuthorizedGameMaster,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/game-master/maps") {
    if (request.method === "GET") return listMaps(env, url);
    if (request.method === "POST") return saveMap(request, env, actor);
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Use GET or POST for this endpoint.", { allowed: ["GET", "POST"] });
  }
  const detailMatch = url.pathname.match(mapDetailPath);
  if (detailMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Use GET for this endpoint.", { allowed: ["GET"] });
    }
    return getMap(env, detailMatch[1]);
  }
  const publishMatch = url.pathname.match(mapPublishPath);
  if (publishMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.", { allowed: ["POST"] });
    }
    return publishMap(request, env, actor, publishMatch[1]);
  }
  if (url.pathname === "/api/game-master/campaigns" && request.method === "POST") {
    return createCampaign(request, env, actor);
  }
  return null;
}
