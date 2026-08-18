import type {
  RuleAvailabilityStatusV1,
  RuleDefinitionGroupV1,
  RuleDefinitionKindV1,
  RuleDefinitionRecordV1,
  RuleImplementationOverlayV1,
  RuleOverlayDefinitionKindV1,
  RuleRelationEndpointV1,
  RuleRelationGroupV1,
  RuleRelationRecordV1,
  RulesCatalogueEnvelopeV1,
} from "../../domain/src/rules-catalogue-contract";

export type Immutable<T> =
  T extends (...args: never[]) => unknown ? T
    : T extends readonly (infer Item)[] ? readonly Immutable<Item>[]
      : T extends object ? { readonly [Key in keyof T]: Immutable<T[Key]> }
        : T;

export type ImmutableRulesCatalogueEnvelopeV1 = Immutable<RulesCatalogueEnvelopeV1>;
export type ImmutableRuleDefinitionRecordV1 = Immutable<RuleDefinitionRecordV1>;
export type ImmutableRuleImplementationOverlayV1 = Immutable<RuleImplementationOverlayV1>;
export type ImmutableRuleRelationRecordV1 = Immutable<RuleRelationRecordV1>;

export type RuleDefinitionForKindV1<Kind extends RuleDefinitionKindV1> =
  Immutable<Omit<RuleDefinitionRecordV1, "kind"> & { kind: Kind }>;

export type RuleOverlayForKindV1<Kind extends RuleOverlayDefinitionKindV1> =
  Immutable<Omit<RuleImplementationOverlayV1, "definitionKind"> & { definitionKind: Kind }>;

export type CatalogueLookupResultV1<Value> =
  | { readonly found: true; readonly value: Value }
  | {
    readonly found: false;
    readonly code: "DEFINITION_NOT_FOUND" | "DEFINITION_KIND_MISMATCH" | "OVERLAY_NOT_FOUND" | "RELATION_NOT_FOUND";
    readonly id: string;
    readonly expectedKind?: RuleDefinitionKindV1;
    readonly actualKind?: RuleDefinitionKindV1;
  };

export type CatalogueRuntimeModeV1 = "PRODUCTION" | "DEVELOPMENT";

export type CatalogueAvailabilityCodeV1 =
  | "AVAILABLE"
  | "AVAILABLE_IN_DEVELOPMENT"
  | "DEFINITION_NOT_FOUND"
  | "OVERLAY_NOT_FOUND"
  | "BLOCKED"
  | "DEV_ONLY"
  | "HIDDEN";

export type CatalogueExecutabilityCodeV1 =
  | "EXECUTABLE"
  | "DEFINITION_NOT_FOUND"
  | "OVERLAY_NOT_FOUND"
  | "UNAVAILABLE"
  | "CATALOGUE_ONLY"
  | "NOT_EXECUTABLE"
  | "HANDLER_NOT_DECLARED"
  | "HANDLER_NOT_REGISTERED";

export interface CatalogueAvailabilityDecisionV1 {
  readonly allowed: boolean;
  readonly code: CatalogueAvailabilityCodeV1;
  readonly status: RuleAvailabilityStatusV1 | null;
}

export interface CatalogueExecutabilityDecisionV1 {
  readonly allowed: boolean;
  readonly code: CatalogueExecutabilityCodeV1;
  readonly handlerId: string | null;
}

export interface CatalogueDefinitionDecisionV1 {
  readonly definition: ImmutableRuleDefinitionRecordV1 | null;
  readonly overlay: ImmutableRuleImplementationOverlayV1 | null;
  readonly availability: CatalogueAvailabilityDecisionV1;
  readonly executability: CatalogueExecutabilityDecisionV1;
  readonly purchasable: boolean;
}

export type CatalogueHandlerRegistryIssueCodeV1 =
  | "CATALOGUE_HANDLER_MISSING_FROM_REGISTRY"
  | "REGISTRY_HANDLER_NOT_DECLARED";

export interface CatalogueHandlerRegistryIssueV1 {
  readonly code: CatalogueHandlerRegistryIssueCodeV1;
  readonly handlerId: string;
  readonly message: string;
}

export interface RulesCatalogueRuntimeV1 {
  readonly envelope: ImmutableRulesCatalogueEnvelopeV1;
  readonly contentHash: string;

  listDefinitions<Kind extends RuleDefinitionKindV1>(kind: Kind): readonly RuleDefinitionForKindV1<Kind>[];
  lookupDefinition<Kind extends RuleDefinitionKindV1>(kind: Kind, id: string): CatalogueLookupResultV1<RuleDefinitionForKindV1<Kind>>;

  listOverlays<Kind extends RuleOverlayDefinitionKindV1>(kind: Kind): readonly RuleOverlayForKindV1<Kind>[];
  lookupOverlay<Kind extends RuleOverlayDefinitionKindV1>(kind: Kind, id: string): CatalogueLookupResultV1<RuleOverlayForKindV1<Kind>>;

  listRelations(group: RuleRelationGroupV1): readonly ImmutableRuleRelationRecordV1[];
  lookupRelation(id: string): CatalogueLookupResultV1<ImmutableRuleRelationRecordV1>;
  relationsFrom(endpoint: RuleRelationEndpointV1): readonly ImmutableRuleRelationRecordV1[];
  relationsTo(endpoint: RuleRelationEndpointV1): readonly ImmutableRuleRelationRecordV1[];

  decide(
    definitionKind: RuleOverlayDefinitionKindV1,
    definitionId: string,
    mode?: CatalogueRuntimeModeV1,
  ): CatalogueDefinitionDecisionV1;
}

export type RulesCatalogueRuntimeBuildResultV1 =
  | { readonly ok: true; readonly runtime: RulesCatalogueRuntimeV1 }
  | { readonly ok: false; readonly issues: readonly CatalogueHandlerRegistryIssueV1[] };

const definitionGroups = [
  "units",
  "weapons",
  "equipment",
  "actions",
  "orders",
  "structures",
  "terrain",
  "ships",
  "enemies",
  "movementProfiles",
  "durabilityProfiles",
  "cargoProfiles",
  "supplyProfiles",
  "deploymentProfiles",
  "deploymentMethods",
  "tags",
  "abilities",
  "statusEffects",
  "shipCapabilities",
] as const satisfies readonly RuleDefinitionGroupV1[];

const relationGroups = [
  "unitProfiles",
  "unitTags",
  "unitAbilities",
  "unitWeapons",
  "unitEquipmentSlots",
  "equipmentEligibility",
  "equipmentEffects",
  "shipModuleCapabilityGrants",
] as const satisfies readonly RuleRelationGroupV1[];

const emptyDefinitions = Object.freeze([]) as readonly ImmutableRuleDefinitionRecordV1[];
const emptyOverlays = Object.freeze([]) as readonly ImmutableRuleImplementationOverlayV1[];
const emptyRelations = Object.freeze([]) as readonly ImmutableRuleRelationRecordV1[];

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

function deepFreeze<T>(value: T): Immutable<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}

function freezeResult<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function overlayTargetKind(kind: RuleOverlayDefinitionKindV1): RuleDefinitionKindV1 {
  return kind === "SHIP_MODULE" ? "EQUIPMENT" : kind;
}

function appendEndpointRelation(
  index: Map<RuleDefinitionKindV1, Map<string, ImmutableRuleRelationRecordV1[]>>,
  endpoint: Immutable<RuleRelationEndpointV1>,
  relation: ImmutableRuleRelationRecordV1,
): void {
  let byId = index.get(endpoint.definitionKind);
  if (!byId) {
    byId = new Map();
    index.set(endpoint.definitionKind, byId);
  }
  let relations = byId.get(endpoint.definitionId);
  if (!relations) {
    relations = [];
    byId.set(endpoint.definitionId, relations);
  }
  relations.push(relation);
}

function endpointRelations(
  index: ReadonlyMap<RuleDefinitionKindV1, ReadonlyMap<string, readonly ImmutableRuleRelationRecordV1[]>>,
  endpoint: RuleRelationEndpointV1,
): readonly ImmutableRuleRelationRecordV1[] {
  return index.get(endpoint.definitionKind)?.get(endpoint.definitionId) ?? emptyRelations;
}

function handlerRegistryIssues(
  envelope: Pick<ImmutableRulesCatalogueEnvelopeV1, "content">,
  registryIds: ReadonlySet<string>,
): CatalogueHandlerRegistryIssueV1[] {
  const catalogueIds = new Set(envelope.content.handlers.map((handler) => handler.id));
  const issues: CatalogueHandlerRegistryIssueV1[] = [];

  for (const handlerId of catalogueIds) {
    if (!registryIds.has(handlerId)) {
      issues.push({
        code: "CATALOGUE_HANDLER_MISSING_FROM_REGISTRY",
        handlerId,
        message: `Catalogue handler ${handlerId} has no caller-supplied implementation.`,
      });
    }
  }
  for (const handlerId of registryIds) {
    if (!catalogueIds.has(handlerId)) {
      issues.push({
        code: "REGISTRY_HANDLER_NOT_DECLARED",
        handlerId,
        message: `Caller-supplied handler ${handlerId} is not declared by the catalogue.`,
      });
    }
  }

  return issues.sort((left, right) =>
    compareCodePoints(left.handlerId, right.handlerId) || compareCodePoints(left.code, right.code),
  );
}

export function verifyCatalogueHandlerRegistry(
  envelope: RulesCatalogueEnvelopeV1,
  registryIds: ReadonlySet<string>,
): readonly CatalogueHandlerRegistryIssueV1[] {
  return deepFreeze(handlerRegistryIssues(envelope as ImmutableRulesCatalogueEnvelopeV1, registryIds));
}

class RulesCatalogueRuntime implements RulesCatalogueRuntimeV1 {
  readonly envelope: ImmutableRulesCatalogueEnvelopeV1;
  readonly contentHash: string;

  readonly #handlerRegistryIds: ReadonlySet<string>;
  readonly #definitionsById = new Map<string, ImmutableRuleDefinitionRecordV1>();
  readonly #definitionsByKind = new Map<RuleDefinitionKindV1, readonly ImmutableRuleDefinitionRecordV1[]>();
  readonly #overlaysByKind = new Map<RuleOverlayDefinitionKindV1, Map<string, ImmutableRuleImplementationOverlayV1>>();
  readonly #overlayListsByKind = new Map<RuleOverlayDefinitionKindV1, readonly ImmutableRuleImplementationOverlayV1[]>();
  readonly #relationsById = new Map<string, ImmutableRuleRelationRecordV1>();
  readonly #relationsByGroup = new Map<RuleRelationGroupV1, readonly ImmutableRuleRelationRecordV1[]>();
  readonly #relationsFrom = new Map<RuleDefinitionKindV1, Map<string, ImmutableRuleRelationRecordV1[]>>();
  readonly #relationsTo = new Map<RuleDefinitionKindV1, Map<string, ImmutableRuleRelationRecordV1[]>>();

  constructor(envelope: RulesCatalogueEnvelopeV1, registryIds: ReadonlySet<string>) {
    this.envelope = deepFreeze(structuredClone(envelope));
    this.contentHash = this.envelope.contentHash;
    this.#handlerRegistryIds = new Set(registryIds);

    const definitionsByKind = new Map<RuleDefinitionKindV1, ImmutableRuleDefinitionRecordV1[]>();
    for (const group of definitionGroups) {
      for (const definition of this.envelope.content[group]) {
        this.#definitionsById.set(definition.id, definition);
        const definitions = definitionsByKind.get(definition.kind) ?? [];
        definitions.push(definition);
        definitionsByKind.set(definition.kind, definitions);
      }
    }
    for (const [kind, definitions] of definitionsByKind) {
      this.#definitionsByKind.set(kind, Object.freeze(definitions));
    }

    const overlayLists = new Map<RuleOverlayDefinitionKindV1, ImmutableRuleImplementationOverlayV1[]>();
    for (const overlay of this.envelope.content.overlays) {
      let byId = this.#overlaysByKind.get(overlay.definitionKind);
      if (!byId) {
        byId = new Map();
        this.#overlaysByKind.set(overlay.definitionKind, byId);
      }
      byId.set(overlay.definitionId, overlay);
      const overlays = overlayLists.get(overlay.definitionKind) ?? [];
      overlays.push(overlay);
      overlayLists.set(overlay.definitionKind, overlays);
    }
    for (const [kind, overlays] of overlayLists) {
      this.#overlayListsByKind.set(kind, Object.freeze(overlays));
    }

    for (const group of relationGroups) {
      const relations = this.envelope.content.relations[group];
      this.#relationsByGroup.set(group, relations);
      for (const relation of relations) {
        this.#relationsById.set(relation.id, relation);
        appendEndpointRelation(this.#relationsFrom, relation.from, relation);
        if (relation.to !== null) appendEndpointRelation(this.#relationsTo, relation.to, relation);
      }
    }
    for (const byId of [...this.#relationsFrom.values(), ...this.#relationsTo.values()]) {
      for (const relations of byId.values()) Object.freeze(relations);
    }
  }

  listDefinitions<Kind extends RuleDefinitionKindV1>(kind: Kind): readonly RuleDefinitionForKindV1<Kind>[] {
    return (this.#definitionsByKind.get(kind) ?? emptyDefinitions) as readonly RuleDefinitionForKindV1<Kind>[];
  }

  lookupDefinition<Kind extends RuleDefinitionKindV1>(
    kind: Kind,
    id: string,
  ): CatalogueLookupResultV1<RuleDefinitionForKindV1<Kind>> {
    const definition = this.#definitionsById.get(id);
    if (!definition) return freezeResult({ found: false, code: "DEFINITION_NOT_FOUND", id });
    if (definition.kind !== kind) {
      return freezeResult({
        found: false,
        code: "DEFINITION_KIND_MISMATCH",
        id,
        expectedKind: kind,
        actualKind: definition.kind,
      });
    }
    return freezeResult({ found: true, value: definition as RuleDefinitionForKindV1<Kind> });
  }

  listOverlays<Kind extends RuleOverlayDefinitionKindV1>(kind: Kind): readonly RuleOverlayForKindV1<Kind>[] {
    return (this.#overlayListsByKind.get(kind) ?? emptyOverlays) as readonly RuleOverlayForKindV1<Kind>[];
  }

  lookupOverlay<Kind extends RuleOverlayDefinitionKindV1>(
    kind: Kind,
    id: string,
  ): CatalogueLookupResultV1<RuleOverlayForKindV1<Kind>> {
    const overlay = this.#overlaysByKind.get(kind)?.get(id);
    if (!overlay) return freezeResult({ found: false, code: "OVERLAY_NOT_FOUND", id });
    return freezeResult({ found: true, value: overlay as RuleOverlayForKindV1<Kind> });
  }

  listRelations(group: RuleRelationGroupV1): readonly ImmutableRuleRelationRecordV1[] {
    return this.#relationsByGroup.get(group) ?? emptyRelations;
  }

  lookupRelation(id: string): CatalogueLookupResultV1<ImmutableRuleRelationRecordV1> {
    const relation = this.#relationsById.get(id);
    return relation
      ? freezeResult({ found: true, value: relation })
      : freezeResult({ found: false, code: "RELATION_NOT_FOUND", id });
  }

  relationsFrom(endpoint: RuleRelationEndpointV1): readonly ImmutableRuleRelationRecordV1[] {
    return endpointRelations(this.#relationsFrom, endpoint);
  }

  relationsTo(endpoint: RuleRelationEndpointV1): readonly ImmutableRuleRelationRecordV1[] {
    return endpointRelations(this.#relationsTo, endpoint);
  }

  decide(
    definitionKind: RuleOverlayDefinitionKindV1,
    definitionId: string,
    mode: CatalogueRuntimeModeV1 = "PRODUCTION",
  ): CatalogueDefinitionDecisionV1 {
    const definition = this.#definitionsById.get(definitionId);
    if (!definition || definition.kind !== overlayTargetKind(definitionKind)) {
      return deepFreeze({
        definition: null,
        overlay: null,
        availability: { allowed: false, code: "DEFINITION_NOT_FOUND", status: null },
        executability: { allowed: false, code: "DEFINITION_NOT_FOUND", handlerId: null },
        purchasable: false,
      });
    }

    const overlay = this.#overlaysByKind.get(definitionKind)?.get(definitionId) ?? null;
    if (!overlay) {
      return deepFreeze({
        definition,
        overlay: null,
        availability: { allowed: false, code: "OVERLAY_NOT_FOUND", status: null },
        executability: { allowed: false, code: "OVERLAY_NOT_FOUND", handlerId: null },
        purchasable: false,
      });
    }

    const availability = this.#availability(overlay.availabilityStatus, mode);
    const executability = this.#executability(overlay, availability.allowed);
    return deepFreeze({
      definition,
      overlay,
      availability,
      executability,
      purchasable: availability.allowed && overlay.purchasable,
    });
  }

  #availability(
    status: RuleAvailabilityStatusV1,
    mode: CatalogueRuntimeModeV1,
  ): CatalogueAvailabilityDecisionV1 {
    if (status === "AVAILABLE") return freezeResult({ allowed: true, code: "AVAILABLE", status });
    if (status === "DEV_ONLY" && mode === "DEVELOPMENT") {
      return freezeResult({ allowed: true, code: "AVAILABLE_IN_DEVELOPMENT", status });
    }
    return freezeResult({ allowed: false, code: status, status });
  }

  #executability(
    overlay: ImmutableRuleImplementationOverlayV1,
    available: boolean,
  ): CatalogueExecutabilityDecisionV1 {
    if (!available) {
      return freezeResult({ allowed: false, code: "UNAVAILABLE", handlerId: overlay.handlerId });
    }
    if (overlay.implementationStatus === "CATALOGUE_ONLY") {
      return freezeResult({ allowed: false, code: "CATALOGUE_ONLY", handlerId: overlay.handlerId });
    }
    if (!overlay.executable) {
      return freezeResult({ allowed: false, code: "NOT_EXECUTABLE", handlerId: overlay.handlerId });
    }
    if (overlay.handlerId === null) {
      return freezeResult({ allowed: false, code: "HANDLER_NOT_DECLARED", handlerId: null });
    }
    if (!this.#handlerRegistryIds.has(overlay.handlerId)) {
      return freezeResult({ allowed: false, code: "HANDLER_NOT_REGISTERED", handlerId: overlay.handlerId });
    }
    return freezeResult({ allowed: true, code: "EXECUTABLE", handlerId: overlay.handlerId });
  }
}

export function createRulesCatalogueRuntime(
  envelope: RulesCatalogueEnvelopeV1,
  handlerRegistryIds: ReadonlySet<string>,
): RulesCatalogueRuntimeBuildResultV1 {
  const issues = verifyCatalogueHandlerRegistry(envelope, handlerRegistryIds);
  if (issues.length > 0) return freezeResult({ ok: false, issues });
  return freezeResult({
    ok: true,
    runtime: Object.freeze(new RulesCatalogueRuntime(envelope, handlerRegistryIds)),
  });
}
