import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type {
  AbilityRef,
  AvailabilityStatus,
  BattlegroupManagementGroupDto,
  BattlegroupManagementProjectionDto,
  BattlegroupManagementUnitDto,
  BattalionMemberDto,
  BattlegroupMutationResultDto,
  ForceBattlegroupSummaryDto,
  ForceSummaryDto,
  FriendlyUnitInspectionDto,
  HealthModel,
  ImplementationStatus,
  RequisitionStatus,
  SubsystemState,
  UnitLocationState,
  UnitStatus,
  WeaponProfile,
} from "../../packages/domain/src";
import {
  FORCE_ROLES,
  SHOWCASE_CATALOGUE,
  SHOWCASE_FORCE,
  abilityRefsToViews,
  forceStatusMatches,
  readableId,
  roleFor,
  type ForceCatalogueView,
  type ForceEquipmentView,
  type ForceHistoryView,
  type ForceRoleFilter,
  type ForceStatusFilter,
  type ForceSubsystemView,
  type ForceUnitView,
} from "../forces/model";
import { Glyph } from "./Glyph";
import { EquipmentIcon } from "./EquipmentVisual";
import { UnitPortrait } from "./UnitVisual";

const DEMO_USER = "demo-user";
const DEMO_HEADERS = import.meta.env.DEV ? { "x-demo-user": DEMO_USER } : undefined;
const JSON_HEADERS = { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) };
const STATUS_FILTERS: ForceStatusFilter[] = ["ALL", "READY", "DEPLOYED", "DAMAGED", "LOST"];

interface ForcesViewProps {
  onNotice: (notice: { tone: "info" | "success" | "danger"; message: string }) => void;
}

type ForceDataMode = "LOADING" | "LIVE" | "SHOWCASE" | "ERROR";

interface CollectionEnvelope {
  values: unknown[];
  metadata: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function collectionFrom(payload: unknown, keys: string[]): CollectionEnvelope {
  if (Array.isArray(payload)) return { values: payload, metadata: {} };
  const record = asRecord(payload);
  if (!record) return { values: [], metadata: {} };
  for (const key of keys) {
    if (Array.isArray(record[key])) return { values: record[key], metadata: record };
  }
  return { values: [], metadata: record };
}

function validHealthModel(value: unknown): HealthModel {
  return value === "HITS" ? "HITS" : "FORCE_STRENGTH";
}

function validUnitStatus(value: unknown): UnitStatus {
  return ["ACTIVE", "DEPLOYED", "DAMAGED", "DESTROYED", "RETIRED"].includes(String(value))
    ? value as UnitStatus
    : "ACTIVE";
}

function validLocation(value: unknown): UnitLocationState {
  return ["RESERVE", "ON_MAP", "EMBARKED", "ON_SHIP", "IN_AIR_TRANSPORT", "IN_VEHICLE", "IN_TRANSIT", "DESTROYED"].includes(String(value))
    ? value as UnitLocationState
    : "RESERVE";
}

function validImplementation(value: unknown): ImplementationStatus {
  return ["IMPLEMENTED", "PARTIAL", "CATALOGUE_ONLY"].includes(String(value))
    ? value as ImplementationStatus
    : "CATALOGUE_ONLY";
}

function validRequisition(value: unknown): RequisitionStatus {
  return ["PUBLISHED", "BALANCE_REQUIRED", "NOT_APPLICABLE"].includes(String(value))
    ? value as RequisitionStatus
    : "BALANCE_REQUIRED";
}

function validAvailability(value: unknown): AvailabilityStatus {
  return ["AVAILABLE", "BLOCKED", "DEV_ONLY", "HIDDEN"].includes(String(value))
    ? value as AvailabilityStatus
    : "BLOCKED";
}

function normalizeWeapon(value: unknown): WeaponProfile | undefined {
  const record = asRecord(value);
  const damage = asRecord(record?.damage);
  if (!record || !asString(record.id) || !asString(record.name)) return undefined;
  return {
    id: asString(record.id),
    name: asString(record.name),
    damage: {
      count: asNumber(damage?.count, 1),
      sides: asNumber(damage?.sides, 0),
      modifier: typeof damage?.modifier === "number" ? damage.modifier : undefined,
    },
    range: asNumber(record.range),
    armorPiercing: asNumber(record.armorPiercing),
    indirect: record.indirect === true,
    ammoCapacity: typeof record.ammoCapacity === "number" ? record.ammoCapacity : undefined,
    cooldownRounds: typeof record.cooldownRounds === "number" ? record.cooldownRounds : undefined,
    tags: asStringArray(record.tags),
  };
}

function normalizeEquipment(value: unknown): ForceEquipmentView | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = asString(record.id, asString(record.equipmentId));
  if (!id) return undefined;
  return {
    id,
    definitionId: asString(record.definitionId, id),
    name: asString(record.name, readableId(id)),
    slot: asString(record.slot, asString(record.slotType, "EQUIPMENT")).toUpperCase(),
    description: asString(record.description, asString(record.rulesText, "Rules-defined equipment.")),
  };
}

function normalizeCatalogue(value: unknown): ForceCatalogueView | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = asString(record.id, asString(record.definitionId));
  if (!id) return undefined;
  const stats = asRecord(record.stats) ?? {};
  const movement = asRecord(record.movementProfile) ?? {};
  const durability = asRecord(record.durabilityProfile) ?? {};
  const catalogueMovement = asRecord(record.movement) ?? {};
  const catalogueDurability = asRecord(record.durability) ?? {};
  const tags = asStringArray(record.tags);
  const abilities = Array.isArray(record.abilities)
    ? abilityRefsToViews(record.abilities.map((ability) => {
        if (typeof ability === "string") return { abilityId: ability } satisfies AbilityRef;
        const abilityRecord = asRecord(ability);
        return { abilityId: asString(abilityRecord?.abilityId, asString(abilityRecord?.id, "ability-unknown")) } satisfies AbilityRef;
      }))
    : [];
  const initialEquipment = Array.isArray(record.initialEquipment)
    ? record.initialEquipment.map(normalizeEquipment).filter((item): item is ForceEquipmentView => Boolean(item))
    : [];
  const slotRecord = asRecord(record.slots) ?? {};
  return {
    id,
    name: asString(record.name, readableId(id)),
    description: asString(record.description, asString(record.notes, "Rules-defined combined-arms unit.")),
    role: roleFor(record.category, tags),
    category: asString(record.category, "UNIT"),
    tags,
    healthModel: validHealthModel(catalogueDurability.model ?? durability.model ?? stats.healthModel),
    maximumHealth: asNumber(catalogueDurability.maximum, asNumber(durability.maximumHealth, asNumber(stats.maxHealth, 1))),
    armour: asNumber(catalogueDurability.armor, asNumber(stats.armor)),
    speed: asNumber(catalogueMovement.speed, asNumber(movement.baseSpeed, asNumber(stats.speed))),
    sensors: asNumber(record.sensors, asNumber(stats.sensors)),
    weapons: Array.isArray(record.weapons) ? record.weapons.map(normalizeWeapon).filter((item): item is WeaponProfile => Boolean(item)) : [],
    weaponIds: asStringArray(record.weaponIds),
    slots: Object.fromEntries(Object.entries(slotRecord).filter((entry): entry is [string, number] => typeof entry[1] === "number")),
    abilities,
    movementLabel: asString(record.movementLabel, asString(catalogueMovement.profileName, asString(movement.name, readableId(asString(catalogueMovement.profileId, asString(movement.id, "movement profile")))))),
    movementProfileId: asString(catalogueMovement.profileId, asString(movement.id, "movement-profile-unspecified")),
    cargoSummary: asString(record.cargoSummary) || undefined,
    implementationStatus: validImplementation(record.implementationStatus),
    requisitionStatus: validRequisition(record.requisitionStatus),
    availabilityStatus: validAvailability(record.availabilityStatus),
    availabilityReason: asString(record.availabilityReason, asString(record.availabilityReasonCode, asString(record.reasonCode))) || undefined,
    requisitionCost: typeof record.requisitionCost === "number" ? record.requisitionCost : null,
    initialEquipment,
  };
}

function normalizeSummary(value: unknown, catalogue: Map<string, ForceCatalogueView>): ForceUnitView | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const unitId = asString(record.unitId, asString(record.id));
  const definitionId = asString(record.definitionId);
  if (!unitId || !definitionId) return undefined;
  const definition = catalogue.get(definitionId);
  const movementProfile = asRecord(record.movementProfile) ?? {};
  const service = asRecord(record.service) ?? {};
  const healthModel = validHealthModel(record.healthModel ?? definition?.healthModel);
  const maximumHealth = asNumber(record.maximumHealth, definition?.maximumHealth ?? 1);
  const summary = record as unknown as Partial<ForceSummaryDto>;
  const battlegroups = Array.isArray(record.battlegroups)
    ? record.battlegroups.flatMap((value): ForceBattlegroupSummaryDto[] => {
        const membership = asRecord(value);
        const id = asString(membership?.id);
        const name = asString(membership?.name);
        return id && name ? [{ id, name, objective: asString(membership?.objective) || undefined }] : [];
      })
    : [];
  return {
    unitId,
    definitionId,
    callsign: asString(record.callsign, "UNNAMED").toUpperCase(),
    name: asString(record.name, asString(record.callsign, "Unnamed unit")),
    status: validUnitStatus(summary.status),
    locationState: validLocation(summary.locationState),
    currentHealth: asNumber(summary.currentHealth, maximumHealth),
    maximumHealth,
    healthModel,
    version: asNumber(summary.version, 1),
    readiness: asRecord(summary.readiness) ? summary.readiness as ForceSummaryDto["readiness"] : undefined,
    className: asString(record.definitionName, definition?.name ?? readableId(definitionId)),
    description: asString(record.description, definition?.description ?? "Persistent force unit."),
    role: definition?.role ?? roleFor(record.category, asStringArray(record.tags)),
    battlegroups,
    battlegroup: battlegroups[0]?.name.toUpperCase() || asString(record.battlegroup, asString(record.battlegroupName)) || undefined,
    armour: definition?.armour ?? asNumber(record.armor, asNumber(record.armour)),
    speed: definition?.speed ?? asNumber(record.speed),
    sensors: definition?.sensors ?? asNumber(record.sensors),
    range: definition ? Math.max(0, ...definition.weapons.map((weapon) => weapon.range)) : asNumber(record.range),
    movementLabel: asString(movementProfile.name, definition?.movementLabel ?? asString(record.movementLabel, "Rules-defined movement")),
    tags: definition?.tags ?? asStringArray(record.tags),
    abilities: definition?.abilities ?? [],
    weapons: definition?.weapons ?? [],
    equipment: [],
    ammunition: {},
    cooldowns: {},
    supplies: {},
    cargo: [],
    subsystems: [],
    statusEffects: [],
    history: [],
    serviceCampaigns: asNumber(service.campaigns, asNumber(record.serviceCampaigns)),
    serviceRounds: asNumber(service.rounds, asNumber(record.serviceRounds)),
    serviceDamageSustained: 0,
    serviceObjectivesCompleted: 0,
    serviceUnitsDestroyed: 0,
    serviceCommendations: 0,
    descriptionText: asString(record.descriptionText, asString(record.unitDescription, asString(record.description))) || undefined,
  };
}

type LoadoutPayload = {
  unitId: string;
  unitVersion: number;
  requisitionBalance: number;
  loadout: { id: string; revision: number; status: string; lockedAt: number | null; items: Array<{ inventoryId: string; definitionId: string; name: string; slotType: string; slotIndex: number }> };
  effectiveUnit: LoadoutEffectiveUnit | null;
  slots: Record<string, number>;
  validation: LoadoutValidation;
  ownedEquipment: Array<{ inventoryId: string; definitionId: string; name: string; assignedUnitId?: string; state: string; implementationStatus: string; availabilityStatus: string; availabilityReason?: string | null; executable: boolean; allowedSlots: string[] }>;
};

type LoadoutEffectiveUnit = {
  stats: { maxHealth: number; armor: number; defense: number; speed: number; sensors: number; capacity: number };
  weapons: Array<{ id: string; name: string; range: number; armorPiercing: number; ammoCapacity?: number }>;
  allowedActions: string[];
  abilities: Array<{ abilityId: string }>;
  equipmentInstanceIds: string[];
  sourceHash: string;
};

type LoadoutValidation = {
  valid: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings?: Array<{ code: string; message: string }>;
};

type LoadoutPreviewPayload = {
  effectiveUnit: LoadoutEffectiveUnit | null;
  validation: LoadoutValidation;
};

type IdentityMutationResult = {
  unitId: string;
  name: string;
  callsign: string;
  description: string;
  version: number;
};

function IdentityDialog({
  unit,
  onClose,
  onSaved,
  onConflict,
}: {
  unit: ForceUnitView;
  onClose: () => void;
  onSaved: (result: IdentityMutationResult) => Promise<void>;
  onConflict: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(unit.name);
  const [callsign, setCallsign] = useState(unit.callsign);
  const [description, setDescription] = useState(unit.descriptionText ?? unit.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/forces/${encodeURIComponent(unit.unitId)}/rename`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: unit.version,
          name,
          callsign,
          description,
        }),
      });
      if (!response.ok) {
        const payload = asRecord(await response.json().catch(() => undefined));
        const detail = asRecord(payload?.error);
        if (response.status === 409) await onConflict();
        throw new Error(asString(detail?.message, errorMessage(response.status)));
      }
      await onSaved(await response.json() as IdentityMutationResult);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unit identity could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const unchanged = name.trim() === unit.name
    && callsign.trim().toUpperCase() === unit.callsign
    && description.trim() === (unit.descriptionText ?? unit.description);

  return <dialog ref={ref} className="identity-dialog" aria-labelledby="identity-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <form onSubmit={(event) => void save(event)}>
      <header>
        <div><span className="eyebrow">PERSISTENT UNIT RECORD</span><h2 id="identity-dialog-title">Edit unit identity</h2></div>
        <button type="button" aria-label="Close unit identity editor" onClick={onClose}>×</button>
      </header>
      <section>
        <UnitPortrait definitionId={unit.definitionId} tags={unit.tags} label={unit.className} className={`force-marker hero role-${unit.role.toLowerCase()}`} />
        <div className="identity-fields">
          <label>UNIT NAME<input autoFocus required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>CALLSIGN<input required maxLength={7} pattern="[A-Z0-9][A-Z0-9-]{0,6}" value={callsign} onChange={(event) => setCallsign(event.target.value.toUpperCase())} /></label>
          <label className="wide">SERVICE DESCRIPTION<textarea maxLength={500} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        </div>
        <p>Identity changes are recorded in this unit's permanent service history. Combat class, ownership and rules-defined statistics are unchanged.</p>
      </section>
      <footer>
        <div>{error && <p role="alert">{error}</p>}<small>RECORD VERSION {unit.version}</small></div>
        <button type="button" onClick={onClose}>CANCEL</button>
        <button className="primary" type="submit" disabled={busy || unchanged}>{busy ? "SAVING…" : "SAVE IDENTITY"}</button>
      </footer>
    </form>
  </dialog>;
}

function LoadoutDialog({ unit, onClose, onSaved }: { unit: ForceUnitView; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [payload, setPayload] = useState<LoadoutPayload>();
  const [items, setItems] = useState<LoadoutPayload["loadout"]["items"]>([]);
  const [preview, setPreview] = useState<LoadoutPreviewPayload>();
  const [previewing, setPreviewing] = useState(false);
  const [eligible, setEligible] = useState<Array<{ id: string; name: string; requisition_cost: number | null; implementation_status: string; requisition_status: string; availability_status: string; executable: boolean; purchasable: boolean; reason_code?: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const previewSequence = useRef(0);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const requestPreview = useCallback(async (
    base: LoadoutPayload,
    nextItems: LoadoutPayload["loadout"]["items"],
    sequence: number,
  ) => {
    const response = await fetch(`/api/forces/${encodeURIComponent(unit.unitId)}/loadout-preview`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        commandId: crypto.randomUUID(),
        expectedVersion: base.unitVersion,
        expectedLoadoutRevision: base.loadout.revision,
        context: "PRE_CAMPAIGN_MUSTER",
        items: nextItems.map(({ inventoryId, slotType, slotIndex }) => ({ inventoryId, slotType, slotIndex })),
      }),
    });
    if (!response.ok) throw new Error(errorMessage(response.status));
    const nextPreview = await response.json() as LoadoutPreviewPayload;
    if (sequence === previewSequence.current) setPreview(nextPreview);
  }, [unit.unitId]);
  const placeInLoadout = useCallback((
    base: LoadoutPayload,
    current: LoadoutPayload["loadout"]["items"],
    equipment: LoadoutPayload["ownedEquipment"][number],
  ): LoadoutPayload["loadout"]["items"] | undefined => {
    const allowed = equipment.allowedSlots.map((slot) => slot.toUpperCase());
    for (const slotType of allowed) {
      const capacity = base.slots[slotType] ?? 0;
      for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
        if (!current.some((item) => item.slotType === slotType && item.slotIndex === slotIndex)) {
          return [...current, { inventoryId: equipment.inventoryId, definitionId: equipment.definitionId, name: equipment.name, slotType, slotIndex }];
        }
      }
    }
    for (const slotType of allowed) {
      if ((base.slots[slotType] ?? 0) > 0) {
        const slotIndex = 0;
        return [
          ...current.filter((item) => item.slotType !== slotType || item.slotIndex !== slotIndex),
          { inventoryId: equipment.inventoryId, definitionId: equipment.definitionId, name: equipment.name, slotType, slotIndex },
        ];
      }
    }
    return undefined;
  }, []);
  const refresh = useCallback((autoSelectInventoryId?: string) => {
    let cancelled = false;
    void Promise.all([
      fetch(`/api/forces/${encodeURIComponent(unit.unitId)}/loadout`, { headers: DEMO_HEADERS }),
      fetch(`/api/forces/${encodeURIComponent(unit.unitId)}/eligible-equipment`, { headers: DEMO_HEADERS }),
    ])
      .then(async ([loadoutResponse, eligibleResponse]) => {
        if (!loadoutResponse.ok) throw new Error(errorMessage(loadoutResponse.status));
        const next = await loadoutResponse.json() as LoadoutPayload;
        const eligiblePayload = eligibleResponse.ok ? await eligibleResponse.json() as { equipment?: typeof eligible } : {};
        return { next, nextEligible: eligiblePayload.equipment ?? [] };
      })
      .then(({ next, nextEligible }) => {
        if (cancelled) return;
        setPayload(next);
        setEligible(nextEligible);
        const purchased = autoSelectInventoryId
          ? next.ownedEquipment.find((equipment) => equipment.inventoryId === autoSelectInventoryId)
          : undefined;
        const nextItems = purchased ? placeInLoadout(next, next.loadout.items, purchased) : next.loadout.items;
        if (!nextItems) {
          setItems(next.loadout.items);
          setPreview({ effectiveUnit: next.effectiveUnit, validation: next.validation });
          setError(`${purchased?.name ?? "Purchased equipment"} has no compatible unit slot.`);
          return;
        }
        setItems(nextItems);
        if (purchased) {
          const sequence = ++previewSequence.current;
          setPreviewing(true);
          void requestPreview(next, nextItems, sequence)
            .catch((reason) => {
              if (sequence === previewSequence.current) setError(reason instanceof Error ? reason.message : "Loadout preview failed.");
            })
            .finally(() => { if (sequence === previewSequence.current) setPreviewing(false); });
        } else {
          setPreview({ effectiveUnit: next.effectiveUnit, validation: next.validation });
        }
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Loadout unavailable."); });
    return () => { cancelled = true; };
  }, [placeInLoadout, requestPreview, unit.unitId]);
  useEffect(() => refresh(), [refresh]);
  async function previewItems(nextItems: LoadoutPayload["loadout"]["items"]) {
    if (!payload) return;
    const sequence = ++previewSequence.current;
    setPreviewing(true);
    setError(undefined);
    try {
      await requestPreview(payload, nextItems, sequence);
    } catch (reason) {
      if (sequence === previewSequence.current) {
        setPreview(undefined);
        setError(reason instanceof Error ? reason.message : "Loadout preview failed.");
      }
    } finally {
      if (sequence === previewSequence.current) setPreviewing(false);
    }
  }
  function toggle(equipment: LoadoutPayload["ownedEquipment"][number]) {
    const existing = items.find((item) => item.inventoryId === equipment.inventoryId);
    if (existing) {
      const nextItems = items.filter((item) => item.inventoryId !== equipment.inventoryId);
      setItems(nextItems);
      void previewItems(nextItems);
      return;
    }
    if (!payload) return;
    const nextItems = placeInLoadout(payload, items, equipment);
    if (!nextItems) return setError(`${equipment.name} has no compatible unit slot.`);
    setItems(nextItems);
    void previewItems(nextItems);
  }
  async function save() {
    if (!payload || busy) return;
    setBusy(true); setError(undefined);
    try {
      const response = await fetch(`/api/forces/${encodeURIComponent(unit.unitId)}/loadout-changes`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          commandId: crypto.randomUUID(), expectedVersion: payload.unitVersion,
          expectedLoadoutRevision: payload.loadout.revision, context: "PRE_CAMPAIGN_MUSTER",
          items: items.map(({ inventoryId, slotType, slotIndex }) => ({ inventoryId, slotType, slotIndex })),
        }),
      });
      if (!response.ok) throw new Error(errorMessage(response.status));
      onSaved(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Loadout update failed."); }
    finally { setBusy(false); }
  }
  async function requisition(definitionId: string) {
    setBusy(true); setError(undefined);
    try {
      const response = await fetch("/api/requisition/equipment-purchases", {
        method: "POST", headers: JSON_HEADERS,
        body: JSON.stringify({ commandId: crypto.randomUUID(), definitionId }),
      });
      if (!response.ok) throw new Error(errorMessage(response.status));
      const result = await response.json() as { inventoryId?: string };
      if (!result.inventoryId) throw new Error("The quartermaster returned no inventory record.");
      refresh(result.inventoryId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Equipment requisition failed."); }
    finally { setBusy(false); }
  }
  return <dialog ref={ref} className="loadout-dialog" aria-labelledby="loadout-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><div><span className="eyebrow">AUTHORITATIVE QUARTERMASTER</span><h2 id="loadout-title">{unit.callsign} loadout</h2></div><button aria-label="Close loadout" onClick={onClose}>×</button></header>
    <div className="loadout-state"><span>UNIT VERSION <b>{payload?.unitVersion ?? "—"}</b></span><span>LOADOUT REVISION <b>{payload?.loadout.revision ?? "—"}</b></span><span>REQ <b>{payload?.requisitionBalance ?? "—"}</b></span><span>STATE <b>{payload?.loadout.lockedAt ? "LOCKED" : payload?.loadout.status ?? "LOADING"}</b></span></div>
    <section><div className="slot-board">{Object.entries(payload?.slots ?? {}).map(([type, count]) => <article key={type}><strong>{type}</strong>{Array.from({ length: count }, (_, index) => { const item = items.find((candidate) => candidate.slotType === type && candidate.slotIndex === index); return <span className={item ? "occupied" : ""} key={index}><b>{index + 1}</b>{item ? <EquipmentIcon definitionId={item.definitionId} label={item.name} className="loadout-slot-icon" /> : <i className="loadout-slot-empty">—</i>}<em>{item?.name ?? "EMPTY"}</em></span>; })}</article>)}
      <LoadoutCombatPreview current={payload?.effectiveUnit ?? null} preview={preview} busy={previewing} />
    </div>
      <div className="owned-equipment"><span className="eyebrow">OWNED EQUIPMENT</span>{payload?.ownedEquipment.map((equipment) => { const selected = items.some((item) => item.inventoryId === equipment.inventoryId); return <button key={equipment.inventoryId} className={selected ? "selected" : ""} aria-label={`${selected ? "−" : "+"} ${equipment.name} ${equipment.allowedSlots.join(" / ")} ${equipment.implementationStatus.replaceAll("_", " ")} ${equipment.availabilityStatus.replaceAll("_", " ")}`} aria-pressed={selected} title={equipment.availabilityReason?.replaceAll("_", " ")} disabled={!equipment.executable || (Boolean(equipment.assignedUnitId) && equipment.assignedUnitId !== unit.unitId)} onClick={() => toggle(equipment)}><EquipmentIcon definitionId={equipment.definitionId} label={equipment.name} className="loadout-equipment-icon" /><span><strong>{equipment.name}</strong><small>{equipment.allowedSlots.join(" / ")} · {equipment.implementationStatus.replaceAll("_", " ")} · {equipment.availabilityStatus.replaceAll("_", " ")}{selected ? " · INSTALLED" : ""}</small></span></button>; })}<span className="eyebrow requisition-heading">ELIGIBLE REQUISITION</span>{eligible.map((equipment) => { const affordable = equipment.requisition_cost !== null && (payload?.requisitionBalance ?? -1) >= equipment.requisition_cost; return <button key={equipment.id} aria-label={`+ ${equipment.name} requisition`} title={equipment.reason_code?.replaceAll("_", " ")} disabled={busy || !equipment.executable || !equipment.purchasable || equipment.requisition_status !== "PUBLISHED" || !affordable} onClick={() => void requisition(equipment.id)}><EquipmentIcon definitionId={equipment.id} label={equipment.name} className="loadout-equipment-icon" /><span><strong>{equipment.name}</strong><small>{equipment.implementation_status.replaceAll("_", " ")} · {equipment.availability_status.replaceAll("_", " ")} · {equipment.requisition_cost === null ? "BALANCE REQUIRED" : `${equipment.requisition_cost} RP`}{!affordable && equipment.requisition_cost !== null ? " · INSUFFICIENT REQ" : " · REQUISITION & PREVIEW"}</small></span></button>; })}</div>
    </section>
    <footer><div>{error && <p role="alert">{error}</p>}<small>Server rebuilds effective stats, weapons, ammo, actions and eligibility before committing.</small></div><button onClick={onClose}>CANCEL</button><button className="primary" disabled={!payload || busy || previewing || !preview?.validation.valid || Boolean(payload.loadout.lockedAt)} onClick={() => void save()}>{busy ? "VALIDATING…" : previewing ? "PREVIEWING…" : "COMMIT LOADOUT"}</button></footer>
  </dialog>;
}

function LoadoutCombatPreview({
  current,
  preview,
  busy,
}: {
  current: LoadoutEffectiveUnit | null;
  preview?: LoadoutPreviewPayload;
  busy: boolean;
}) {
  const effective = preview?.effectiveUnit;
  const stats: Array<[string, keyof LoadoutEffectiveUnit["stats"]]> = [
    ["HEALTH", "maxHealth"], ["ARMOR", "armor"], ["DEFENSE", "defense"],
    ["SPEED", "speed"], ["SENSORS", "sensors"], ["CAPACITY", "capacity"],
  ];
  return <section className="loadout-combat-preview" aria-live="polite">
    <header><span className="eyebrow">COMBAT EFFECT PREVIEW</span><b className={preview?.validation.valid ? "valid" : "invalid"}>{busy ? "CALCULATING" : preview?.validation.valid ? "VALID" : "BLOCKED"}</b></header>
    {effective ? <>
      <div className="loadout-stat-grid">{stats.map(([label, key]) => {
        const value = effective.stats[key];
        const before = current?.stats[key] ?? value;
        const delta = value - before;
        return <span key={key}><small>{label}</small><strong>{value}</strong>{delta !== 0 && <i className={delta > 0 ? "positive" : "negative"}>{delta > 0 ? `+${delta}` : delta}</i>}</span>;
      })}</div>
      <div className="loadout-preview-list"><small>WEAPONS</small>{effective.weapons.map((weapon) => <span key={weapon.id}><b>{weapon.name}</b><i>R{weapon.range} · AP {weapon.armorPiercing}{weapon.ammoCapacity === undefined ? "" : ` · ${weapon.ammoCapacity} AMMO`}</i></span>)}</div>
      <div className="loadout-preview-list"><small>AVAILABLE ACTIONS</small><p>{effective.allowedActions.join(" · ") || "No actions"}</p></div>
      {effective.abilities.length > 0 && <div className="loadout-preview-list"><small>ABILITIES</small><p>{effective.abilities.map((ability) => readableId(ability.abilityId)).join(" · ")}</p></div>}
    </> : <p className="loadout-preview-empty">Select owned equipment to calculate the authoritative combat package.</p>}
    {preview?.validation.errors.map((issue) => <p className="loadout-preview-issue" key={`${issue.code}:${issue.message}`}><b>{issue.code}</b>{issue.message}</p>)}
    {preview?.validation.warnings?.map((issue) => <p className="loadout-preview-issue warning" key={`${issue.code}:${issue.message}`}><b>{issue.code}</b>{issue.message}</p>)}
  </section>;
}

function BattlegroupDialog({
  units,
  selectedUnit,
  onClose,
  onChanged,
}: {
  units: ForceUnitView[];
  selectedUnit?: ForceUnitView;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [groups, setGroups] = useState<BattlegroupManagementGroupDto[]>([]);
  const [roster, setRoster] = useState<BattlegroupManagementUnitDto[]>([]);
  const [members, setMembers] = useState<BattalionMemberDto[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [name, setName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [objective, setObjective] = useState("");
  const [leaderUserId, setLeaderUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const selectedMembership = selectedUnit
    ? roster.find((entry) => entry.unitId === selectedUnit.unitId)
    : undefined;
  const groupUnits = roster.filter((entry) => entry.battlegroupId === selectedGroupId);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const refresh = useCallback(async (preferredId?: string) => {
    const headers = DEMO_HEADERS;
    const [groupsResponse, membersResponse] = await Promise.all([
      fetch("/api/battlegroups", { headers }),
      fetch("/api/battalions/current/members", { headers }),
    ]);
    if (!groupsResponse.ok || !membersResponse.ok) throw new Error(`Battlegroup registry request failed (${groupsResponse.status || membersResponse.status}).`);
    const next = await groupsResponse.json() as BattlegroupManagementProjectionDto;
    const memberPayload = await membersResponse.json() as { members: BattalionMemberDto[] };
    setGroups(next.battlegroups);
    setRoster(next.units);
    setMembers(memberPayload.members.filter((member) => member.status === "ACTIVE"));
    const nextSelection = next.battlegroups.find((group) => group.id === preferredId) ?? next.battlegroups[0];
    setSelectedGroupId(nextSelection?.id ?? "");
    if (nextSelection) {
      setName(nextSelection.name);
      setCallsign(nextSelection.callsign);
      setObjective(nextSelection.objective);
      setLeaderUserId(nextSelection.leaderUserId ?? "");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "Battlegroup registry unavailable."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function selectGroup(group: BattlegroupManagementGroupDto) {
    setSelectedGroupId(group.id);
    setName(group.name);
    setCallsign(group.callsign);
    setObjective(group.objective);
    setLeaderUserId(group.leaderUserId ?? "");
    setError(undefined);
  }

  async function post(path: string, value: Record<string, unknown>): Promise<BattlegroupMutationResultDto> {
    const response = await fetch(path, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(value),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(payload.error?.message ?? `Battlegroup command failed (${response.status}).`);
    }
    return response.json() as Promise<BattlegroupMutationResultDto>;
  }

  async function mutate(work: () => Promise<BattlegroupMutationResultDto>, success: string) {
    setBusy(true); setError(undefined);
    try {
      const result = await work();
      await refresh(result.battlegroupId);
      onChanged(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Battlegroup command failed.");
    } finally { setBusy(false); }
  }

  function beginCreate() {
    setSelectedGroupId("");
    setName(""); setCallsign(""); setObjective(""); setLeaderUserId(""); setError(undefined);
  }

  const assignedHere = selectedMembership?.battlegroupId === selectedGroupId;
  const leader = members.find((member) => member.userId === leaderUserId);
  const assignedViews = groupUnits.map((entry) => ({ entry, unit: units.find((unit) => unit.unitId === entry.unitId) }));

  return <dialog ref={ref} className="battlegroup-dialog" aria-labelledby="battlegroup-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><div><span className="eyebrow">PERSISTENT FORMATION COMMAND</span><h2 id="battlegroup-dialog-title">Battlegroup management</h2></div><button aria-label="Close Battlegroup management" onClick={onClose}>×</button></header>
    <div className="battlegroup-manager">
      <nav aria-label="Battlegroups">
        <button className={!selectedGroupId ? "selected" : ""} onClick={beginCreate}>＋ NEW BATTLEGROUP</button>
        {groups.map((group) => <button className={group.id === selectedGroupId ? "selected" : ""} key={group.id} onClick={() => selectGroup(group)}><strong>{group.callsign}</strong><span>{group.name}</span><small>{group.status} · R{group.revision}</small></button>)}
      </nav>
      <section className="battlegroup-editor">
        <div className="battlegroup-fields">
          <label>FORMATION NAME<input value={name} maxLength={64} onChange={(event) => setName(event.target.value)} placeholder="e.g. Raven Battlegroup" /></label>
          <label>CALLSIGN<input value={callsign} maxLength={16} onChange={(event) => setCallsign(event.target.value.toUpperCase())} placeholder="RAVEN" /></label>
          <label className="wide">MISSION / OBJECTIVE<textarea value={objective} maxLength={240} onChange={(event) => setObjective(event.target.value)} placeholder="Persistent formation intention" /></label>
          {selectedGroup && <label className="wide">FORMATION LEADER<select value={leaderUserId} onChange={(event) => setLeaderUserId(event.target.value)}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.callsign} · {member.displayName}</option>)}</select></label>}
        </div>
        <div className="battlegroup-command-row">
          {!selectedGroup ? <button className="primary" disabled={busy || name.trim().length < 3 || callsign.trim().length < 2} onClick={() => void mutate(() => post("/api/battlegroups", { commandId: crypto.randomUUID(), name, callsign, objective }), "Battlegroup created." )}>CREATE FORMATION</button>
            : <button className="primary" disabled={busy} onClick={() => void mutate(() => post(`/api/battlegroups/${encodeURIComponent(selectedGroup.id)}/update`, { commandId: crypto.randomUUID(), expectedRevision: selectedGroup.revision, name, callsign, objective, leaderUserId: leaderUserId || null }), "Battlegroup command record updated.")}>SAVE COMMAND RECORD</button>}
        </div>
        {selectedGroup && <div className="battlegroup-roster-editor">
          <header><div><span className="eyebrow">LIVE ROSTER</span><h3>{groupUnits.length} assigned units</h3></div><span>{leader ? `LEADER // ${leader.callsign}` : "LEADER UNASSIGNED"}</span></header>
          <div className="battlegroup-roster-list">
            {assignedViews.map(({ entry, unit }) => <article key={entry.unitId}><div><strong>{unit?.callsign ?? entry.unitId}</strong><small>{unit?.className ?? "Persistent unit"}</small></div><span>{entry.delegatedCommand ? "ORDER AUTHORITY DELEGATED" : entry.ownerId === leaderUserId ? "OWNER COMMAND" : "OWNER AUTHORITY"}</span>{selectedUnit?.unitId === entry.unitId && <button disabled={busy} onClick={() => void mutate(() => post(`/api/battlegroups/${encodeURIComponent(selectedGroup.id)}/units/remove`, { commandId: crypto.randomUUID(), expectedRevision: selectedGroup.revision, unitId: entry.unitId }), `${unit?.callsign ?? "Unit"} removed from ${selectedGroup.callsign}.`)}>REMOVE</button>}</article>)}
            {!assignedViews.length && <p>No units assigned. Add an operational reserve unit to make this formation ready.</p>}
          </div>
          {selectedUnit && <div className="selected-unit-command"><div><span className="eyebrow">SELECTED FORCE UNIT</span><strong>{selectedUnit.callsign}</strong><small>{selectedUnit.className} · {selectedUnit.locationState}</small></div>
            {!selectedMembership && <button disabled={busy || !["RESERVE", "ON_SHIP"].includes(selectedUnit.locationState)} onClick={() => void mutate(() => post(`/api/battlegroups/${encodeURIComponent(selectedGroup.id)}/units/assign`, { commandId: crypto.randomUUID(), expectedRevision: selectedGroup.revision, unitId: selectedUnit.unitId }), `${selectedUnit.callsign} assigned to ${selectedGroup.callsign}.`)}>ASSIGN TO {selectedGroup.callsign}</button>}
            {assignedHere && leaderUserId && <button disabled={busy} onClick={() => void mutate(() => post(`/api/battlegroups/${encodeURIComponent(selectedGroup.id)}/delegations`, { commandId: crypto.randomUUID(), expectedRevision: selectedGroup.revision, unitId: selectedUnit.unitId, delegateUserId: leaderUserId, active: !selectedMembership.delegatedCommand }), `${selectedUnit.callsign} order delegation ${selectedMembership.delegatedCommand ? "revoked" : "granted"}.`)}>{selectedMembership.delegatedCommand ? "REVOKE LEADER AUTHORITY" : "DELEGATE TO LEADER"}</button>}
            {selectedMembership && !assignedHere && <small>Currently assigned to another Battlegroup. Remove it there before reassignment.</small>}
          </div>}
        </div>}
        {error && <p className="battlegroup-manager-error" role="alert">{error}</p>}
      </section>
    </div>
  </dialog>;
}

function normalizeInspection(payload: unknown, summary: ForceUnitView): ForceUnitView {
  const outer = asRecord(payload) ?? {};
  const record = asRecord(outer.unit) ?? asRecord(outer.force) ?? asRecord(outer.inspection) ?? outer;
  const dto = record as unknown as Partial<FriendlyUnitInspectionDto>;
  const equipmentValues = Array.isArray(record.equipmentDetail) ? record.equipmentDetail : Array.isArray(record.equipment) ? record.equipment : [];
  const equipmentById = new Map(
    equipmentValues.map(normalizeEquipment).filter((item): item is ForceEquipmentView => Boolean(item)).map((item) => [item.id, item]),
  );
  const equipmentIds = Array.isArray(dto.equipmentIds) ? dto.equipmentIds : [];
  const equipment = equipmentIds.map((id) => equipmentById.get(id) ?? { id, name: readableId(id), slot: "EQUIPMENT", description: "Installed rules-defined equipment." });
  const cargoDetail = Array.isArray(record.cargoDetail) ? record.cargoDetail : undefined;
  const cargo = cargoDetail ? cargoDetail.map((value, index) => {
    const item = asRecord(value) ?? {};
    const kind = asString(item.kind, "OTHER");
    return {
      id: asString(item.id, `${summary.unitId}:cargo:${index}`),
      label: asString(item.callsign, asString(item.resourceType, `${readableId(kind)} cargo`)),
      quantity: asNumber(item.quantity, 1),
      kind,
      transportMode: asString(item.transportMode) || undefined,
      slots: typeof item.slots === "number" ? item.slots : undefined,
      tags: asStringArray(item.tags),
    };
  }) : Array.isArray(dto.cargo) ? dto.cargo.map((item) => ({
    id: item.id,
    label: item.unitId ? readableId(item.unitId) : item.supplyType ? readableId(item.supplyType) : `${readableId(item.kind)} cargo`,
    quantity: item.quantity,
    kind: item.kind,
    transportMode: item.transportMode,
    tags: item.tags,
  })) : [];
  const subsystems: ForceSubsystemView[] = Array.isArray(dto.subsystems)
    ? dto.subsystems.map((state: SubsystemState) => ({ id: state.subsystemId, name: readableId(state.subsystemId), state: state.state }))
    : [];
  const historySource = Array.isArray(record.history) ? record.history : [];
  const history = historySource.map((item, index): ForceHistoryView => {
    const entry = asRecord(item);
    return {
      id: asString(entry?.id, `${summary.unitId}:history:${index}`),
      type: asString(entry?.type, "SERVICE_EVENT"),
      summary: asString(entry?.summary, asString(entry?.message, "Service event recorded.")),
      campaign: asString(entry?.campaign, asString(entry?.campaignName, asString(entry?.campaignId))) || undefined,
      round: typeof entry?.round === "number" ? entry.round : undefined,
      timestamp: (() => {
        const value = asNumber(entry?.timestamp, asNumber(entry?.occurredAt, Date.now() - index * 1_000));
        return value < 10_000_000_000 ? value * 1_000 : value;
      })(),
    };
  });
  const recent = Array.isArray(dto.recentHistory) ? dto.recentHistory : [];
  const recentHistory = recent.map((summaryText, index): ForceHistoryView => ({
    id: `${summary.unitId}:recent:${index}`,
    type: "SERVICE_EVENT",
    summary: summaryText,
    timestamp: Date.now() - index * 1_000,
  }));
  const abilityValues = Array.isArray(dto.abilities) ? abilityRefsToViews(dto.abilities) : summary.abilities;
  const weaponValues = Array.isArray(record.weapons)
    ? record.weapons
    : Array.isArray(record.weaponMounts) ? record.weaponMounts.map((mount) => asRecord(mount)?.weapon) : [];
  const inspectedWeapons = weaponValues.map(normalizeWeapon).filter((weapon): weapon is WeaponProfile => Boolean(weapon));
  const serviceSummary = asRecord(record.serviceSummary) ?? {};
  const statusEffects = Array.isArray(dto.statusEffects) ? dto.statusEffects : [];
  return {
    ...summary,
    callsign: asString(record.callsign, summary.callsign),
    name: asString(record.name, summary.name),
    version: asNumber(record.version, summary.version),
    descriptionText: asString(record.descriptionText, asString(record.description, summary.descriptionText)) || undefined,
    tags: Array.isArray(dto.tags) ? dto.tags : summary.tags,
    abilities: abilityValues,
    weapons: inspectedWeapons.length ? inspectedWeapons : summary.weapons,
    range: inspectedWeapons.length ? Math.max(0, ...inspectedWeapons.map((weapon) => weapon.range)) : summary.range,
    equipment,
    ammunition: asRecord(dto.ammunition) as Record<string, number> | undefined ?? {},
    cooldowns: asRecord(dto.cooldowns) as Record<string, number> | undefined ?? {},
    supplies: asRecord(dto.supplies) as Record<string, number> | undefined ?? {},
    cargo,
    subsystems,
    statusEffects,
    history: history.length ? history : recentHistory,
    serviceCampaigns: asNumber(serviceSummary.campaignsParticipated, asNumber(record.serviceCampaigns, summary.serviceCampaigns)),
    serviceRounds: asNumber(serviceSummary.roundsDeployed, asNumber(record.serviceRounds, summary.serviceRounds)),
    serviceDamageSustained: asNumber(serviceSummary.damageSustained, summary.serviceDamageSustained),
    serviceObjectivesCompleted: asNumber(serviceSummary.objectivesCompleted, summary.serviceObjectivesCompleted),
    serviceUnitsDestroyed: asNumber(serviceSummary.unitsDestroyed, summary.serviceUnitsDestroyed),
    serviceCommendations: asNumber(serviceSummary.commendations, summary.serviceCommendations),
  };
}

function errorMessage(status: number): string {
  if (status === 401 || status === 403) return "Sign in to access your persistent force.";
  return `Force registry request failed (${status}).`;
}

function durabilityPercent(unit: ForceUnitView): number {
  return unit.maximumHealth > 0 ? Math.max(0, Math.min(100, unit.currentHealth / unit.maximumHealth * 100)) : 0;
}

function unitMetrics(unit: ForceUnitView): Array<{ label: string; value: string | number }> {
  const metrics: Array<{ label: string; value: string | number }> = [
    { label: unit.healthModel === "HITS" ? "HITS" : "FS", value: `${unit.currentHealth}/${unit.maximumHealth}` },
    { label: "ARM", value: unit.armour },
    { label: "SPD", value: unit.speed },
  ];
  if (unit.tags.includes("ENGINEER")) metrics.push({ label: "BUILD", value: unit.supplies.BUILD ?? 0 });
  else if (unit.role === "ARTILLERY") metrics.push({ label: "AMMO", value: Object.values(unit.ammunition).reduce((total, value) => total + value, 0) });
  else if (unit.tags.includes("TRANSPORT")) metrics.push({ label: "CARGO", value: unit.cargo.reduce((total, item) => total + item.quantity, 0) });
  else metrics.push({ label: "RNG", value: unit.range || "—" });
  return metrics;
}

function statusLabel(unit: ForceUnitView): string {
  if (unit.status === "DESTROYED") return "LOST";
  if (unit.locationState === "ON_MAP" || unit.status === "DEPLOYED") return "DEPLOYED";
  if (unit.status === "DAMAGED" || unit.currentHealth < unit.maximumHealth) return "DAMAGED";
  return unit.readiness?.ready ? "READY" : "UNAVAILABLE";
}

function formatEventDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

function RequisitionDialog({
  catalogue,
  live,
  requisitionBalance,
  onClose,
  onPurchased,
}: {
  catalogue: ForceCatalogueView[];
  live: boolean;
  requisitionBalance: number | null;
  onClose: () => void;
  onPurchased: (unit: ForceUnitView) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const initialSelection = catalogue.find((item) => item.availabilityStatus !== "HIDDEN");
  const [selectedId, setSelectedId] = useState(initialSelection?.id ?? "");
  const [name, setName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const selected = catalogue.find((item) => item.id === selectedId);
  const eligible = Boolean(
    live && selected && selected.implementationStatus !== "CATALOGUE_ONLY" &&
      selected.availabilityStatus === "AVAILABLE" && selected.requisitionStatus === "PUBLISHED" &&
      selected.requisitionCost !== null && requisitionBalance !== null && requisitionBalance >= selected.requisitionCost,
  );

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  async function purchase() {
    if (!selected || !eligible || busy) return;
    if (name.trim().length < 2) {
      setError("Enter a unit name of at least two characters.");
      return;
    }
    if (!/^[A-Za-z0-9-]{2,7}$/.test(callsign.trim())) {
      setError("Callsign must be 2–7 letters, numbers, or hyphens.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/requisition/purchases", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          commandId: `purchase:${crypto.randomUUID()}`,
          kind: "UNIT",
          definitionId: selected.id,
          desiredName: name.trim(),
          callsign: callsign.trim().toUpperCase(),
        }),
      });
      if (!response.ok) throw new Error(errorMessage(response.status));
      const payload: unknown = await response.json();
      const unitValue = asRecord(payload)?.unit ?? payload;
      const unit = normalizeSummary(unitValue, new Map([[selected.id, selected]]));
      if (!unit) throw new Error("The registry returned an invalid unit record.");
      onPurchased(unit);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Requisition failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="requisition-dialog" aria-labelledby="requisition-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="requisition-drawer">
        <header>
          <div><span className="eyebrow">BATTALION QUARTERMASTER</span><h2 id="requisition-title">Requisition unit</h2></div>
          <button className="drawer-close" aria-label="Close requisition" onClick={onClose}>×</button>
        </header>
        {!live && (
          <div className="local-mutation-lock" role="note">
            <Glyph name="signal" size={18} />
            <div><strong>SHOWCASE / LOCAL</strong><p>Browse the complete flow safely. Sign in to the live force registry before any purchase can persist.</p></div>
          </div>
        )}
        <div className="requisition-body">
          <section className="catalogue-column" aria-label="Unit catalogue">
            <span className="eyebrow">01 // SELECT UNIT CLASS</span>
            <div className="catalogue-list">
              {catalogue.filter((item) => item.availabilityStatus !== "HIDDEN").map((item) => (
                <button className={item.id === selectedId ? "selected" : ""} key={item.id} onClick={() => { setSelectedId(item.id); setError(undefined); }}>
                  <UnitPortrait definitionId={item.id} tags={item.tags} label={item.name} className={`force-marker role-${item.role.toLowerCase()}`} />
                  <span><strong>{item.name}</strong><small>{item.role} · {item.movementLabel}</small></span>
                  <i className={`availability-dot ${item.availabilityStatus.toLowerCase()}`} title={item.availabilityStatus} />
                </button>
              ))}
            </div>
          </section>
          <section className="requisition-config" aria-live="polite">
            {selected ? (
              <>
                <div className="catalogue-hero">
                  <UnitPortrait definitionId={selected.id} tags={selected.tags} label={selected.name} className={`force-marker large role-${selected.role.toLowerCase()}`} />
                  <div><span className="eyebrow">{selected.role} // {selected.category}</span><h3>{selected.name}</h3><p>{selected.description}</p></div>
                </div>
                <div className="catalogue-status-row">
                  <span className={`implementation ${selected.implementationStatus.toLowerCase()}`}>{selected.implementationStatus.replaceAll("_", " ")}</span>
                  <span>{selected.requisitionStatus.replaceAll("_", " ")}</span>
                  <span>{selected.availabilityStatus.replaceAll("_", " ")}</span>
                </div>
                <div className="requisition-stat-grid">
                  <span><small>{selected.healthModel === "HITS" ? "HITS" : "FS"}</small><b>{selected.maximumHealth}</b></span>
                  <span><small>ARMOUR</small><b>{selected.armour}</b></span>
                  <span><small>SPEED</small><b>{selected.speed}</b></span>
                  <span><small>SENSORS</small><b>{selected.sensors}</b></span>
                </div>
                <div className="catalogue-spec-grid">
                  <div><span className="eyebrow">MOVEMENT PROFILE</span><strong>{selected.movementLabel}</strong><small>{selected.movementProfileId}</small></div>
                  <div><span className="eyebrow">TRANSPORT</span><strong>{selected.cargoSummary ?? "No cargo profile"}</strong><small>Server-defined capacity</small></div>
                </div>
                <section className="catalogue-section">
                  <span className="eyebrow">WEAPONS & ABILITIES</span>
                  <div className="compact-specs">
                    {selected.weapons.map((weapon) => <span key={weapon.id}><b>{weapon.name}</b><small>D{weapon.damage.sides} · AP{weapon.armorPiercing} · RNG {weapon.range}{weapon.ammoCapacity ? ` · ${weapon.ammoCapacity} AMMO` : ""}</small></span>)}
                    {!selected.weapons.length && selected.weaponIds.map((weaponId) => <span key={weaponId}><b>{readableId(weaponId)}</b><small>Profile resolved from the active ruleset when mounted.</small></span>)}
                    {selected.abilities.map((ability) => <span key={ability.id}><b>{ability.name}</b><small>{ability.description}</small></span>)}
                    {!selected.weapons.length && !selected.weaponIds.length && !selected.abilities.length && <p>No executable weapon or ability is published for this definition.</p>}
                  </div>
                </section>
                <section className="catalogue-section">
                  <span className="eyebrow">EQUIPMENT SLOTS</span>
                  <div className="slot-strip">
                    {Object.entries(selected.slots).filter(([, count]) => count > 0).map(([slot, count]) => <span key={slot}>{readableId(slot)} <b>×{count}</b></span>)}
                    {!Object.values(selected.slots).some((count) => count > 0) && <span>NO OPEN SLOTS</span>}
                  </div>
                </section>
                <section className="catalogue-section identity-fields">
                  <span className="eyebrow">02 // IDENTITY</span>
                  <label htmlFor="unit-name">UNIT NAME</label>
                  <input id="unit-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. 14th Armoured Platoon" autoComplete="off" />
                  <label htmlFor="unit-callsign">CALLSIGN</label>
                  <input id="unit-callsign" value={callsign} maxLength={7} onChange={(event) => setCallsign(event.target.value.toUpperCase())} placeholder="BELLATR" autoComplete="off" />
                </section>
                <section className="catalogue-section">
                  <span className="eyebrow">03 // QUARTERMASTER HANDOFF</span>
                  <p className="catalogue-note">The unit is issued with its canonical class weapons and resources. After requisition, its live loadout opens so owned Store equipment can be purchased, previewed and installed into authoritative slots.</p>
                </section>
              </>
            ) : <div className="forces-empty">No catalogue definition selected.</div>}
          </section>
        </div>
        <footer>
          <div><span>REQUISITION</span><strong>{selected?.requisitionCost === null || selected?.requisitionCost === undefined ? "UNAVAILABLE" : `${selected.requisitionCost} RP`}</strong><small>{requisitionBalance === null ? "Balance unavailable" : `${requisitionBalance} RP available`}{selected?.availabilityReason ? ` · ${selected.availabilityReason}` : ""}</small></div>
          <button className="secondary" onClick={onClose}>CANCEL</button>
          <button className="primary" disabled={!eligible || busy} onClick={() => void purchase()}>{busy ? "PROCESSING…" : "PURCHASE UNIT"}</button>
          {error && <p className="requisition-error" role="alert">{error}</p>}
        </footer>
      </div>
    </dialog>
  );
}

export function ForcesView({ onNotice }: ForcesViewProps) {
  const [mode, setMode] = useState<ForceDataMode>("LOADING");
  const [units, setUnits] = useState<ForceUnitView[]>(import.meta.env.DEV ? SHOWCASE_FORCE : []);
  const [catalogue, setCatalogue] = useState<ForceCatalogueView[]>(import.meta.env.DEV ? SHOWCASE_CATALOGUE : []);
  const [selectedUnitId, setSelectedUnitId] = useState(import.meta.env.DEV ? SHOWCASE_FORCE[0].unitId : "");
  const [roleFilter, setRoleFilter] = useState<ForceRoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<ForceStatusFilter>("ALL");
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [battlegroupOpen, setBattlegroupOpen] = useState(false);
  const [requisitionBalance, setRequisitionBalance] = useState<number | null>(null);
  const [registryNote, setRegistryNote] = useState("Connecting to the owner-scoped force registry…");

  const loadForces = useCallback(async (quiet = false) => {
    try {
      const headers = DEMO_HEADERS;
      const [forcesResponse, catalogueResponse, requisitionResponse] = await Promise.all([
        fetch("/api/forces", { headers }),
        fetch("/api/catalogue/units", { headers }),
        fetch("/api/requisition", { headers }),
      ]);
      if (!forcesResponse.ok) throw new Error(errorMessage(forcesResponse.status));
      if (!catalogueResponse.ok) throw new Error(errorMessage(catalogueResponse.status));
      if (!requisitionResponse.ok) throw new Error(errorMessage(requisitionResponse.status));
      const [forcesPayload, cataloguePayload, requisitionPayload]: [unknown, unknown, unknown] = await Promise.all([forcesResponse.json(), catalogueResponse.json(), requisitionResponse.json()]);
      const catalogueCollection = collectionFrom(cataloguePayload, ["units", "catalogue", "definitions", "items"]);
      const nextCatalogue = catalogueCollection.values.map(normalizeCatalogue).filter((item): item is ForceCatalogueView => Boolean(item));
      const catalogueIndex = new Map(nextCatalogue.map((item) => [item.id, item]));
      const forcesCollection = collectionFrom(forcesPayload, ["forces", "units", "items"]);
      const nextUnits = forcesCollection.values.map((item) => normalizeSummary(item, catalogueIndex)).filter((item): item is ForceUnitView => Boolean(item));
      setCatalogue(nextCatalogue);
      setUnits(nextUnits);
      setRequisitionBalance(asNumber(asRecord(requisitionPayload)?.balance));
      setMode("LIVE");
      setRegistryNote("Owner-scoped D1 force registry");
      setSelectedUnitId((current) => nextUnits.some((unit) => unit.unitId === current) ? current : nextUnits[0]?.unitId ?? "");
    } catch (reason) {
      setMode(import.meta.env.DEV ? "SHOWCASE" : "ERROR");
      setUnits(import.meta.env.DEV ? SHOWCASE_FORCE : []);
      setCatalogue(import.meta.env.DEV ? SHOWCASE_CATALOGUE : []);
      setRequisitionBalance(null);
      setRegistryNote(reason instanceof Error
        ? import.meta.env.DEV ? `${reason.message} Deterministic local showcase loaded.` : reason.message
        : import.meta.env.DEV ? "Deterministic local showcase loaded." : "Persistent force registry is unavailable.");
      if (!quiet) onNotice(import.meta.env.DEV
        ? { tone: "info", message: "Forces is running in SHOWCASE / LOCAL mode. Persistent mutations are disabled." }
        : { tone: "danger", message: "The persistent force registry is unavailable. No local data has been substituted." });
    }
  }, [onNotice]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadForces(), 0);
    return () => window.clearTimeout(timer);
  }, [loadForces]);

  const filteredUnits = useMemo(() => units.filter((unit) =>
    (roleFilter === "ALL" || unit.role === roleFilter) && forceStatusMatches(unit, statusFilter),
  ), [roleFilter, statusFilter, units]);
  const groupedUnits = useMemo(() => FORCE_ROLES
    .map((role) => ({ role, units: filteredUnits.filter((unit) => unit.role === role) }))
    .filter((group) => group.units.length), [filteredUnits]);
  const selectedUnit = units.find((unit) => unit.unitId === selectedUnitId) ?? filteredUnits[0];
  const battlegroupOptions = [...new Map(
    units.flatMap((unit) => unit.battlegroups ?? []).map((battlegroup) => [battlegroup.id, battlegroup]),
  ).values()];
  const activeBattlegroup = selectedUnit?.battlegroups?.[0] ?? battlegroupOptions[0];
  const battlegroupUnits = activeBattlegroup
    ? units.filter((unit) => unit.battlegroups?.some((battlegroup) => battlegroup.id === activeBattlegroup.id) && unit.status !== "DESTROYED")
    : [];
  const readyCount = units.filter((unit) => unit.readiness?.ready && unit.status !== "DESTROYED").length;
  const deployedCount = units.filter((unit) => unit.locationState === "ON_MAP" || unit.status === "DEPLOYED").length;
  const lostCount = units.filter((unit) => unit.status === "DESTROYED" || unit.status === "RETIRED").length;

  async function inspect(unit: ForceUnitView) {
    setSelectedUnitId(unit.unitId);
    if (mode !== "LIVE") return;
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/forces/${encodeURIComponent(unit.unitId)}`, { headers: DEMO_HEADERS });
      if (!response.ok) throw new Error(errorMessage(response.status));
      const payload: unknown = await response.json();
      const detail = normalizeInspection(payload, unit);
      setUnits((current) => current.map((candidate) => candidate.unitId === detail.unitId ? detail : candidate));
    } catch (reason) {
      onNotice({ tone: "danger", message: reason instanceof Error ? reason.message : "Unit inspection failed." });
    } finally {
      setDetailLoading(false);
    }
  }

  async function identitySaved(result: IdentityMutationResult) {
    if (!selectedUnit) return;
    const updated: ForceUnitView = {
      ...selectedUnit,
      callsign: result.callsign,
      name: result.name,
      description: result.description,
      descriptionText: result.description,
      version: result.version,
    };
    setUnits((current) => current.map((candidate) => candidate.unitId === result.unitId ? updated : candidate));
    setIdentityOpen(false);
    onNotice({ tone: "success", message: `${result.callsign} identity saved to its persistent service record.` });
    await inspect(updated);
  }

  function clearFilters() {
    setRoleFilter("ALL");
    setStatusFilter("ALL");
  }

  return (
    <main className="forces-layout">
      <section className="forces-commandbar">
        <div>
          <span className="eyebrow">33RD EXPEDITIONARY BATTALION // FORCE REGISTRY</span>
          <h1>Persistent forces</h1>
          <p>Combined-arms identity, service state and deployment readiness.</p>
        </div>
        <div className="force-totals" aria-label="Force totals">
          <span><b>{units.length - lostCount}</b><small>ACTIVE</small></span>
          <span><b>{readyCount}</b><small>READY</small></span>
          <span><b>{deployedCount}</b><small>DEPLOYED</small></span>
          <span className="lost"><b>{lostCount}</b><small>LOST</small></span>
        </div>
        <div className="forces-command-actions">
          <span className={`registry-mode ${mode.toLowerCase()}`}><i /> {mode === "LIVE" ? "REGISTRY LIVE" : mode === "LOADING" ? "CONNECTING" : mode === "SHOWCASE" ? "SHOWCASE / LOCAL" : "REGISTRY UNAVAILABLE"}</span>
          <button className="requisition-button" onClick={() => setDrawerOpen(true)}><Glyph name="forces" size={17} /> REQUISITION UNIT</button>
        </div>
      </section>

      <aside className="forces-roster panel">
        <div className="force-filter-block">
          <span className="eyebrow">ROLE FILTER</span>
          <div className="role-filters">
            {(["ALL", ...FORCE_ROLES] as ForceRoleFilter[]).map((role) => <button className={roleFilter === role ? "active" : ""} key={role} onClick={() => setRoleFilter(role)}>{role}</button>)}
          </div>
          <span className="eyebrow">SERVICE STATE</span>
          <div className="status-filters">
            {STATUS_FILTERS.map((status) => <button className={statusFilter === status ? "active" : ""} key={status} onClick={() => setStatusFilter(status)}>{status}</button>)}
          </div>
        </div>
        <div className="registry-source-note"><Glyph name="signal" size={14} /><span>{registryNote}</span></div>
        <div className="grouped-roster">
          {groupedUnits.map((group) => (
            <section key={group.role}>
              <header><span>{group.role}</span><b>{group.units.length}</b></header>
              {group.units.map((unit) => (
                <button className={`force-roster-card ${unit.unitId === selectedUnit?.unitId ? "selected" : ""}`} key={unit.unitId} onClick={() => void inspect(unit)}>
                  <UnitPortrait definitionId={unit.definitionId} tags={unit.tags} label={unit.className} className={`force-marker role-${unit.role.toLowerCase()}`} />
                  <span className="force-roster-identity"><strong>{unit.callsign}</strong><small>{unit.className}</small><i><b style={{ width: `${durabilityPercent(unit)}%` }} /></i></span>
                  <span className={`force-state state-${statusLabel(unit).toLowerCase()}`}>{statusLabel(unit)}</span>
                </button>
              ))}
            </section>
          ))}
          {!groupedUnits.length && (
            <div className="forces-empty"><strong>No matching units</strong><p>Change the role or service-state filters to see your force.</p><button onClick={clearFilters}>SHOW ALL FORCES</button></div>
          )}
        </div>
      </aside>

      <section className={`force-inspection panel ${detailLoading ? "loading" : ""}`} aria-live="polite">
        {selectedUnit ? (
          <>
            <header className="inspection-hero">
              <UnitPortrait definitionId={selectedUnit.definitionId} tags={selectedUnit.tags} label={selectedUnit.className} className={`force-marker hero role-${selectedUnit.role.toLowerCase()}`} />
              <div className="inspection-identity">
                <span className="eyebrow">{selectedUnit.role} // {selectedUnit.movementLabel.toUpperCase()}</span>
                <h2>{selectedUnit.callsign}</h2>
                <strong>{selectedUnit.name}</strong>
                <p>{selectedUnit.descriptionText ?? selectedUnit.description}</p>
              </div>
              <div className="inspection-state">
                <span className={`force-state state-${statusLabel(selectedUnit).toLowerCase()}`}>{statusLabel(selectedUnit)}</span>
                <small>{selectedUnit.className}</small>
                <small>{selectedUnit.locationState.replaceAll("_", " ")}</small>
                {selectedUnit.status !== "DESTROYED" && <button className="identity-edit-button" disabled={mode !== "LIVE"} onClick={() => setIdentityOpen(true)}>EDIT IDENTITY</button>}
              </div>
            </header>

            {selectedUnit.status === "DESTROYED" ? (
              <section className="memorial-card">
                <span className="memorial-mark">†</span>
                <div><span className="eyebrow">ROLL OF HONOUR // LOST</span><h3>{selectedUnit.callsign}</h3><p>{selectedUnit.name}</p><blockquote>“{selectedUnit.history.find((entry) => entry.type === "UNIT_DESTROYED")?.summary ?? "Service concluded in action."}”</blockquote></div>
                <dl><div><dt>CLASS</dt><dd>{selectedUnit.className}</dd></div><div><dt>CAMPAIGNS</dt><dd>{selectedUnit.serviceCampaigns}</dd></div><div><dt>ROUNDS</dt><dd>{selectedUnit.serviceRounds}</dd></div><div><dt>LOST</dt><dd>{selectedUnit.history.find((entry) => entry.type === "UNIT_DESTROYED")?.campaign ?? "Recorded action"}</dd></div></dl>
              </section>
            ) : (
              <>
                <section className="durability-panel">
                  <div className={`durability-ring ${selectedUnit.healthModel === "HITS" ? "hits" : "fs"}`} style={{ "--durability": `${durabilityPercent(selectedUnit)}%` } as CSSProperties}>
                    <span>{selectedUnit.currentHealth}<small>/{selectedUnit.maximumHealth}</small></span><b>{selectedUnit.healthModel === "HITS" ? "HITS" : "FORCE STRENGTH"}</b>
                  </div>
                  <div className="class-metrics">
                    {unitMetrics(selectedUnit).map((metric) => <span key={metric.label}><small>{metric.label}</small><b>{metric.value}</b></span>)}
                  </div>
                  <div className="durability-doctrine"><span className="eyebrow">DURABILITY DOCTRINE</span><strong>{selectedUnit.healthModel === "HITS" ? "Vehicle integrity" : "Personnel force strength"}</strong><p>{selectedUnit.healthModel === "HITS" ? "Penetrating attacks remove Hits; subsystem failures remain explicit and repairable." : "Casualties reduce Force Strength and may reduce combat output. Valid medical aid cannot exceed maximum FS."}</p></div>
                </section>

                <div className="inspection-grid">
                  <section className="inspection-section weapons-section">
                    <header><div><span className="eyebrow">COMBAT PROFILE</span><h3>Weapons</h3></div><b>{selectedUnit.weapons.length}</b></header>
                    {selectedUnit.weapons.length ? selectedUnit.weapons.map((weapon) => (
                      <article className="weapon-card" key={weapon.id}>
                        <div><strong>{weapon.name}</strong><small>{weapon.tags.join(" · ") || "STANDARD WEAPON"}</small></div>
                        <dl><span><dt>DAMAGE</dt><dd>{weapon.damage.count > 1 ? `${weapon.damage.count}×` : ""}D{weapon.damage.sides}</dd></span><span><dt>AP</dt><dd>{weapon.armorPiercing}</dd></span><span><dt>RANGE</dt><dd>{weapon.range}</dd></span>{weapon.ammoCapacity !== undefined && <span><dt>AMMO</dt><dd>{selectedUnit.ammunition[weapon.id] ?? weapon.ammoCapacity}/{weapon.ammoCapacity}</dd></span>}</dl>
                      </article>
                    )) : <p className="section-empty">This unit has no active weapon profile.</p>}
                  </section>
                  <section className="inspection-section abilities-section">
                    <header><div><span className="eyebrow">CAPABILITY CATALOGUE // RESOLVER DEFERRED</span><h3>Abilities</h3></div><b>{selectedUnit.abilities.length}</b></header>
                    <div className="ability-list">
                      {selectedUnit.abilities.map((ability) => <article key={ability.id}><i className={ability.status.toLowerCase()} /><div><strong>{ability.name}</strong><p>{ability.description}</p></div><span>{ability.status === "CATALOGUE_ONLY" ? "FOUNDATION ONLY" : ability.status.replaceAll("_", " ")}</span></article>)}
                      {!selectedUnit.abilities.length && <p className="section-empty">No specialised abilities recorded.</p>}
                    </div>
                  </section>
                  <section className="inspection-section equipment-section">
                    <header><div><span className="eyebrow">PERSISTENT OWNERSHIP</span><h3>Equipment</h3></div><span className="equipment-header-actions"><b>{selectedUnit.equipment.length}</b><button disabled={mode !== "LIVE" || !["RESERVE", "ON_SHIP"].includes(selectedUnit.locationState)} onClick={() => setLoadoutOpen(true)}>MANAGE LOADOUT</button></span></header>
                    <div className="equipment-list">
                      {selectedUnit.equipment.map((equipment) => <article key={equipment.id}><EquipmentIcon definitionId={equipment.definitionId ?? equipment.id} label={equipment.name} className="inspection-equipment-icon" /><span>{equipment.slot}</span><div><strong>{equipment.name}</strong><p>{equipment.description}</p></div></article>)}
                      {!selectedUnit.equipment.length && <p className="section-empty">No installed equipment returned by the registry.</p>}
                    </div>
                    <div className="tag-cloud" aria-label="Unit tags">{selectedUnit.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                  </section>
                  <section className="inspection-section logistics-section">
                    <header><div><span className="eyebrow">OPERATIONAL STATE</span><h3>Systems & logistics</h3></div></header>
                    <div className="logistics-grid">
                      <article><span className="eyebrow">SUBSYSTEMS</span>{selectedUnit.subsystems.length ? selectedUnit.subsystems.map((system) => <div key={system.id}><span>{system.name}</span><b className={system.state.toLowerCase()}>{system.state}</b></div>) : <p>Not applicable</p>}</article>
                      <article><span className="eyebrow">SUPPLY</span>{Object.keys(selectedUnit.supplies).length ? Object.entries(selectedUnit.supplies).map(([type, quantity]) => <div key={type}><span>{readableId(type)}</span><b>{quantity}</b></div>) : <p>No carried supply</p>}</article>
                      <article><span className="eyebrow">CARGO MANIFEST</span>{selectedUnit.cargo.length ? selectedUnit.cargo.map((cargo) => <div key={cargo.id}><span>{cargo.label}</span><b>×{cargo.quantity}{cargo.transportMode ? ` · ${cargo.transportMode}` : ""}</b></div>) : <p>No embarked cargo</p>}</article>
                      <article><span className="eyebrow">STATUS EFFECTS</span>{selectedUnit.statusEffects.length ? selectedUnit.statusEffects.map((effect) => <div key={effect.id}><span>{readableId(effect.definitionId)}</span><b>{effect.expiresRound === undefined ? effect.status : `UNTIL R${effect.expiresRound}`}</b></div>) : <p>No active status effects</p>}</article>
                    </div>
                  </section>
                </div>
              </>
            )}

            <section className="service-history">
              <header><div><span className="eyebrow">PERSISTENT RECORD</span><h3>Service history</h3></div><span>{selectedUnit.serviceCampaigns} CAMPAIGN{selectedUnit.serviceCampaigns === 1 ? "" : "S"} · {selectedUnit.serviceRounds} ROUNDS · {selectedUnit.serviceObjectivesCompleted} OBJECTIVES · {selectedUnit.serviceUnitsDestroyed} KILLS · {selectedUnit.serviceCommendations} COMMENDATIONS · {selectedUnit.serviceDamageSustained} DAMAGE</span></header>
              <div className="history-list">
                {selectedUnit.history.map((entry) => <article key={entry.id}><time>{formatEventDate(entry.timestamp)}</time><i /><div><strong>{entry.type.replaceAll("_", " ")}</strong><p>{entry.summary}</p><small>{entry.campaign}{entry.round !== undefined ? ` · ROUND ${entry.round}` : ""}</small></div></article>)}
                {!selectedUnit.history.length && <p className="section-empty">No service events returned in this inspection window.</p>}
              </div>
            </section>
          </>
        ) : <div className="forces-empty"><strong>No force selected</strong><p>Choose a unit from the registry to inspect it.</p></div>}
        {detailLoading && <div className="detail-loading"><span /><p>Retrieving owner-scoped unit detail…</p></div>}
      </section>

      <aside className="forces-sidecar panel">
        <section className="battlegroup-card">
          <header><div><span className="eyebrow">OPERATIONAL FORMATION</span><h2>{activeBattlegroup ? `Battlegroup ${activeBattlegroup.name}` : "No battlegroup"}</h2></div><span>{battlegroupUnits.length}</span></header>
          <p>{activeBattlegroup?.objective || "No persistent formation is assigned to the selected unit."}</p>
          <div className="battlegroup-stack">
            {battlegroupUnits.map((unit) => <button key={unit.unitId} onClick={() => void inspect(unit)}><UnitPortrait definitionId={unit.definitionId} tags={unit.tags} label={unit.className} className={`force-marker small role-${unit.role.toLowerCase()}`} /><span><strong>{unit.callsign}</strong><small>{unit.className}</small></span><b className={unit.readiness?.ready ? "ready" : "blocked"}>{unit.readiness?.ready ? "READY" : "CHECK"}</b></button>)}
          </div>
          <button className="formation-action" disabled={mode !== "LIVE"} onClick={() => setBattlegroupOpen(true)}>MANAGE BATTLEGROUPS</button>
        </section>
        <section className="readiness-card">
          <header><span className="eyebrow">DEPLOYMENT GATE</span><h2>{selectedUnit?.readiness?.ready ? "Ready to deploy" : "Readiness check"}</h2></header>
          {selectedUnit?.readiness ? (
            <>
              <div className={`readiness-verdict ${selectedUnit.readiness.ready ? "ready" : "blocked"}`}><Glyph name={selectedUnit.readiness.ready ? "signal" : "target"} size={20} /><div><strong>{selectedUnit.readiness.ready ? "ALL REQUIREMENTS MET" : `${selectedUnit.readiness.blockers.length} BLOCKER${selectedUnit.readiness.blockers.length === 1 ? "" : "S"}`}</strong><small>{selectedUnit.callsign} · {selectedUnit.className}</small></div></div>
              <div className="requirement-list">
                {selectedUnit.readiness.requirements.map((requirement) => <div key={requirement.id} className={requirement.satisfied ? "satisfied" : "failed"}><i>{requirement.satisfied ? "✓" : "×"}</i><span>{requirement.label}</span></div>)}
                {selectedUnit.readiness.blockers.map((blocker) => <p key={blocker.code}><b>{blocker.code.replaceAll("_", " ")}</b>{blocker.message}</p>)}
                {selectedUnit.readiness.warnings.map((warning) => <p className="warning" key={warning.code}><b>{warning.code.replaceAll("_", " ")}</b>{warning.message}</p>)}
              </div>
            </>
          ) : <p className="section-empty">The server has not calculated readiness for this unit.</p>}
        </section>
        <section className="ship-capability-card">
          <span className="eyebrow">BATTALION SHIP SUPPORT</span>
          <h2>Corinth Ward</h2>
          <div><span>Infantry berths</span><b>AVAILABLE</b></div><div><span>Heavy vehicle bay</span><b>AVAILABLE</b></div><div><span>Aerospace support</span><b className="limited">1 BERTH FREE</b></div><div><span>Repair facilities</span><b>GROUND / INF</b></div>
          <p>Capability labels are presentation only in local showcase mode; live readiness is calculated by the server.</p>
        </section>
      </aside>

      {drawerOpen && <RequisitionDialog catalogue={catalogue} live={mode === "LIVE"} requisitionBalance={requisitionBalance} onClose={() => setDrawerOpen(false)} onPurchased={(unit) => { setUnits((current) => [unit, ...current]); setSelectedUnitId(unit.unitId); setDrawerOpen(false); setLoadoutOpen(true); onNotice({ tone: "success", message: `${unit.callsign} added. Quartermaster loadout opened.` }); void loadForces(true); }} />}
      {identityOpen && selectedUnit && <IdentityDialog unit={selectedUnit} onClose={() => setIdentityOpen(false)} onSaved={identitySaved} onConflict={async () => { await inspect(selectedUnit); }} />}
      {loadoutOpen && selectedUnit && <LoadoutDialog unit={selectedUnit} onClose={() => setLoadoutOpen(false)} onSaved={() => { onNotice({ tone: "success", message: `${selectedUnit.callsign} effective loadout committed.` }); void inspect(selectedUnit); }} />}
      {battlegroupOpen && <BattlegroupDialog units={units} selectedUnit={selectedUnit} onClose={() => setBattlegroupOpen(false)} onChanged={(message) => { onNotice({ tone: "success", message }); void loadForces(true); }} />}
    </main>
  );
}
