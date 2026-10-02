/**
 * Boolean flags on catalog items live in `metadata` (e.g. an employment
 * status's `isActiveHeadcount`, a case status's `isClosed`, a recruitment
 * stage's `isHired`): what a code *means* is data on the item, never a code
 * list in application logic (AGENTS.md §2).
 *
 * Items saved before a flag existed don't carry it. For those, and only
 * for the codes the platform itself seeded with that meaning, `legacyCodes`
 * keeps the old answer, so existing data reads exactly as before without a
 * migration. An explicit `true`/`false` on the item always wins.
 */
export function catalogFlag(item: { code: string; metadata?: unknown }, key: string, legacyCodes: ReadonlySet<string> = new Set()): boolean {
  const metadata = item.metadata;
  if (metadata && typeof metadata === "object" && key in metadata) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === "boolean") return value;
  }
  return legacyCodes.has(item.code);
}

/**
 * The codes flagged `key` across a catalog. Legacy codes with no catalog
 * item at all still count, so an organization that never configured the
 * catalog (or recorded values before it did) keeps the old behaviour.
 */
export function codesWithFlag(items: { code: string; metadata?: unknown }[], key: string, legacyCodes: ReadonlySet<string> = new Set()): Set<string> {
  const codes = new Set<string>();
  const configured = new Set(items.map((item) => item.code));
  for (const item of items) if (catalogFlag(item, key, legacyCodes)) codes.add(item.code);
  for (const code of legacyCodes) if (!configured.has(code)) codes.add(code);
  return codes;
}

/**
 * A number setting on a catalog item's metadata (e.g. an employment type's
 * `regularizeAfterMonths`). An explicit positive number on the item wins;
 * items saved before the setting existed fall back to `legacyDefaults` for
 * the codes the platform seeded with that meaning; otherwise null (not set).
 */
export function catalogNumber(item: { code: string; metadata?: unknown }, key: string, legacyDefaults: Readonly<Record<string, number>> = {}): number | null {
  const metadata = item.metadata;
  if (metadata && typeof metadata === "object" && key in metadata) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (value === null || value === false || value === 0) return null; // explicitly switched off
  }
  return legacyDefaults[item.code] ?? null;
}
