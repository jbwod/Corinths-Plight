import {
  projectPublicRulesCatalogue,
  type RulesCatalogueEnvelopeV1,
} from "../packages/domain/src/rules-catalogue-contract";
import { V5_CORE_CURATED_2_CATALOGUE } from "../packages/rules-engine/src/generated/v5-core-curated-2";
import { json } from "./http";

const publicRulesCatalogue = projectPublicRulesCatalogue(
  V5_CORE_CURATED_2_CATALOGUE as unknown as RulesCatalogueEnvelopeV1,
);

export function rulesCatalogueResponse(): Response {
  return json(publicRulesCatalogue);
}
