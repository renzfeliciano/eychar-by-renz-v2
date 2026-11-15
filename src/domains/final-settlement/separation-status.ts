// Phase 5a slice 2 (payroll plan): the employment status a separation type means, so the clearance and the
// employment record can be checked against each other. Data on the catalog item (`metadata.employmentStatusCode`,
// ENGINEERING.md §2); the codes the platform seeded keep a default so existing data reads right without a migration.

/**
 * Seeded separation types with an obvious employment status. End of contract, retirement, redundancy and death
 * have no seeded status of their own, so they stay unset (no check) until HR sets one. An explicit value wins.
 */
const LEGACY_EMPLOYMENT_STATUS: Readonly<Record<string, string>> = {
  resignation: "resigned",
  termination: "terminated",
};

/** The employment status this separation type ends in, or null when none is set (no check then). */
export function employmentStatusForSeparation(item: { code: string; metadata?: unknown } | null | undefined, code?: string): string | null {
  const key = item?.code ?? code;
  if (!key) return null;
  const metadata = item?.metadata;
  if (metadata && typeof metadata === "object" && "employmentStatusCode" in metadata) {
    const value = (metadata as Record<string, unknown>).employmentStatusCode;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value === null || value === "") return null;
  }
  return LEGACY_EMPLOYMENT_STATUS[key] ?? null;
}
