import { useEffect, useMemo, useRef, useState } from "react";

import { EquipmentIcon } from "./EquipmentVisual";

interface CatalogueItem {
  id: string;
  name: string;
  category: string;
  slot: string;
  rules: string;
  access: string;
  cost: number | null;
  requisitionStatus: string;
  implementationStatus: string;
  availabilityStatus: string;
  executable: boolean;
  purchasable: boolean;
  reasonCode: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function publicCatalogueItems(payload: unknown): CatalogueItem[] {
  const root = record(payload);
  if (!root || !Array.isArray(root.equipment)) return [];
  const accessById = new Map<string, Record<string, unknown>>();
  const relations = record(root.relations);
  const eligibility = relations?.equipmentEligibility;
  if (Array.isArray(eligibility)) {
    for (const raw of eligibility) {
      const relation = record(raw);
      const from = record(relation?.from);
      const parameters = record(relation?.parameters);
      const id = text(from?.definitionId);
      if (id && parameters) accessById.set(id, parameters);
    }
  }
  return root.equipment.flatMap((raw): CatalogueItem[] => {
    const definition = record(raw);
    const parameters = record(definition?.parameters);
    const sourceDefinition = record(parameters?.definition);
    const store = record(sourceDefinition?.storeCatalogue);
    const implementation = record(definition?.implementation);
    const sourcedNumbers = record(definition?.sourcedNumbers);
    const requisitionCost = record(sourcedNumbers?.requisitionCost);
    const id = text(definition?.id);
    if (!id || !store) return [];
    const eligibilityParameters = accessById.get(id);
    const rule = record(eligibilityParameters?.rule);
    const slots = Array.isArray(eligibilityParameters?.slotTypes)
      ? eligibilityParameters.slotTypes.filter((value): value is string => typeof value === "string")
      : [];
    return [{
      id,
      name: text(definition?.name, id),
      category: text(parameters?.category, "EQUIPMENT"),
      slot: text(store.sourceSlot, slots.join(" / ") || text(parameters?.slotType, "EQUIPMENT")),
      rules: text(store.rulesText, "Effect text not recorded."),
      access: text(store.unitAccessText, text(rule?.sourceAccess, "Rules-defined units")),
      cost: typeof requisitionCost?.value === "number" ? requisitionCost.value : null,
      requisitionStatus: text(implementation?.requisitionStatus, text(requisitionCost?.status, "BALANCE_REQUIRED")),
      implementationStatus: text(implementation?.implementationStatus, "CATALOGUE_ONLY"),
      availabilityStatus: text(implementation?.availabilityStatus, "BLOCKED"),
      executable: implementation?.executable === true,
      purchasable: implementation?.purchasable === true,
      reasonCode: text(implementation?.reasonCode),
    }];
  }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
}

function readable(value: string): string {
  return value.replaceAll("_", " ");
}

export function EquipmentCatalogueDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [error, setError] = useState<string>();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    void fetch("/api/rulesets/v5-core-curated")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Catalogue request failed (${response.status}).`);
        return response.json();
      })
      .then((payload) => setItems(publicCatalogueItems(payload)))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Catalogue unavailable."));
    return () => dialog?.close();
  }, []);

  const categories = useMemo(() => [...new Set(items.map((item) => item.category))].sort(), [items]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (category === "ALL" || item.category === category)
      && (!needle || `${item.name} ${item.rules} ${item.access}`.toLowerCase().includes(needle)));
  }, [category, items, query]);

  return <dialog ref={ref} className="equipment-catalogue-dialog" aria-labelledby="equipment-catalogue-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header>
      <div><span className="eyebrow">THE STORE // AUTHORITATIVE EQUIPMENT CATALOGUE</span><h2 id="equipment-catalogue-title">Equipment & upgrades</h2><p>{items.length || "…"} entries with source effects and unit restrictions.</p></div>
      <button type="button" aria-label="Close equipment catalogue" onClick={onClose}>×</button>
    </header>
    <div className="equipment-catalogue-controls">
      <label>SEARCH<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, effect or unit access" autoFocus /></label>
      <label>CATEGORY<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">ALL EQUIPMENT</option>{categories.map((value) => <option key={value} value={value}>{readable(value)}</option>)}</select></label>
      <span>{filtered.length} SHOWN</span>
    </div>
    {error ? <p className="equipment-catalogue-error" role="alert">{error}</p> : <div className="equipment-catalogue-grid">
      {filtered.map((item) => <article key={item.id} className={item.executable ? "executable" : "catalogue-only"}>
        <EquipmentIcon definitionId={item.id} label={item.name} className="equipment-catalogue-art" decorative={false} />
        <div className="equipment-catalogue-copy">
          <span className="equipment-catalogue-category">{readable(item.category)}</span>
          <h3>{item.name}</h3>
          <p>{item.rules}</p>
          <dl><div><dt>SLOT</dt><dd>{item.slot || "Rules-defined"}</dd></div><div><dt>UNIT ACCESS</dt><dd>{item.access || "See restrictions"}</dd></div></dl>
        </div>
        <footer>
          <span>{item.cost === null ? "BALANCE REQUIRED" : `${item.cost} RP`}</span>
          <b className={item.purchasable ? "available" : "blocked"}>{item.purchasable ? "REQUISITION READY" : readable(item.reasonCode || item.implementationStatus)}</b>
        </footer>
      </article>)}
    </div>}
  </dialog>;
}
