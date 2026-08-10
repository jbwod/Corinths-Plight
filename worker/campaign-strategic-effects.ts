export type CampaignStrategicConsequence =
  | { type: "STRATEGIC_NODE_CAPTURED"; nodeId: string; control: "FRIENDLY" | "ENEMY" | "CONTESTED" | "NEUTRAL" | "UNKNOWN" }
  | { type: "ROUTE_UNLOCKED"; routeId: string }
  | { type: "OPERATION_ACTIVATED"; operationId: string };

interface ObjectiveResult {
  id: string;
  owner: string;
}

function record(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`CAMPAIGN_STRATEGIC_EFFECT_INVALID:${context}`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], context: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error(`CAMPAIGN_STRATEGIC_EFFECT_INVALID:${context}`);
  }
}

export function configuredCampaignStrategicConsequences(
  effectRulesJson: string,
  result: "VICTORY" | "DEFEAT",
  objectives: unknown[],
): CampaignStrategicConsequence[] {
  if (result !== "VICTORY") return [];
  let parsed: unknown;
  try { parsed = JSON.parse(effectRulesJson); } catch { throw new Error("CAMPAIGN_STRATEGIC_EFFECT_INVALID:json"); }
  if (!Array.isArray(parsed)) throw new Error("CAMPAIGN_STRATEGIC_EFFECT_INVALID:rules");
  const objectiveState = new Map<string, ObjectiveResult>();
  for (const [index, value] of objectives.entries()) {
    const objective = record(value, `objective.${index}`);
    exactKeys(objective, ["id", "owner", "status"], `objective.${index}`);
    if (typeof objective.id !== "string" || typeof objective.owner !== "string") {
      throw new Error(`CAMPAIGN_STRATEGIC_EFFECT_INVALID:objective.${index}`);
    }
    objectiveState.set(objective.id, { id: objective.id, owner: objective.owner });
  }
  const consequences: CampaignStrategicConsequence[] = [];
  for (const [ruleIndex, ruleValue] of parsed.entries()) {
    const rule = record(ruleValue, `rule.${ruleIndex}`);
    exactKeys(rule, ["when", "effects"], `rule.${ruleIndex}`);
    const when = record(rule.when, `rule.${ruleIndex}.when`);
    exactKeys(when, ["objectiveId", "owner"], `rule.${ruleIndex}.when`);
    if (typeof when.objectiveId !== "string" || typeof when.owner !== "string") {
      throw new Error(`CAMPAIGN_STRATEGIC_EFFECT_INVALID:rule.${ruleIndex}.when`);
    }
    if (objectiveState.get(when.objectiveId)?.owner !== when.owner) continue;
    if (!Array.isArray(rule.effects)) throw new Error(`CAMPAIGN_STRATEGIC_EFFECT_INVALID:rule.${ruleIndex}.effects`);
    for (const [effectIndex, effectValue] of rule.effects.entries()) {
      const effect = record(effectValue, `rule.${ruleIndex}.effect.${effectIndex}`);
      if (effect.type === "STRATEGIC_NODE_CAPTURED") {
        exactKeys(effect, ["type", "nodeId", "control"], `rule.${ruleIndex}.effect.${effectIndex}`);
        if (
          typeof effect.nodeId !== "string" ||
          !["FRIENDLY", "ENEMY", "CONTESTED", "NEUTRAL", "UNKNOWN"].includes(String(effect.control))
        ) throw new Error(`CAMPAIGN_STRATEGIC_EFFECT_INVALID:rule.${ruleIndex}.effect.${effectIndex}`);
        const control = effect.control as Extract<CampaignStrategicConsequence, { type: "STRATEGIC_NODE_CAPTURED" }>["control"];
        consequences.push({
          type: "STRATEGIC_NODE_CAPTURED",
          nodeId: effect.nodeId,
          control,
        });
      } else if (effect.type === "ROUTE_UNLOCKED") {
        exactKeys(effect, ["type", "routeId"], `rule.${ruleIndex}.effect.${effectIndex}`);
        if (typeof effect.routeId !== "string") throw new Error(`CAMPAIGN_STRATEGIC_EFFECT_INVALID:rule.${ruleIndex}.effect.${effectIndex}`);
        consequences.push({ type: "ROUTE_UNLOCKED", routeId: effect.routeId });
      } else if (effect.type === "OPERATION_ACTIVATED") {
        exactKeys(effect, ["type", "operationId"], `rule.${ruleIndex}.effect.${effectIndex}`);
        if (typeof effect.operationId !== "string") throw new Error(`CAMPAIGN_STRATEGIC_EFFECT_INVALID:rule.${ruleIndex}.effect.${effectIndex}`);
        consequences.push({ type: "OPERATION_ACTIVATED", operationId: effect.operationId });
      } else {
        throw new Error(`CAMPAIGN_STRATEGIC_EFFECT_UNSUPPORTED:${String(effect.type)}`);
      }
    }
  }
  const unique = new Map<string, CampaignStrategicConsequence>();
  for (const effect of consequences) {
    const targetId = effect.type === "STRATEGIC_NODE_CAPTURED"
      ? effect.nodeId
      : effect.type === "ROUTE_UNLOCKED"
        ? effect.routeId
        : effect.operationId;
    unique.set(`${effect.type}:${targetId}`, effect);
  }
  return [...unique.values()];
}
