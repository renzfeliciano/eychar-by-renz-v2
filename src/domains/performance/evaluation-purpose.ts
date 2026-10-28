import { codesWithFlag } from "@/domains/catalog/catalog-flags";

/**
 * Which evaluation types settle a probation: the EvaluationType catalog's
 * `metadata.isRegularization`. The seeded "regularization" code keeps that
 * meaning for an item saved before the flag existed (catalog-flags.ts);
 * flag the catalog item rather than extending this.
 */
export const LEGACY_REGULARIZATION_EVALUATION_CODES: ReadonlySet<string> = new Set(["regularization"]);

export function regularizationEvaluationCodes(types: { code: string; metadata?: unknown }[]): Set<string> {
  return codesWithFlag(types, "isRegularization", LEGACY_REGULARIZATION_EVALUATION_CODES);
}
