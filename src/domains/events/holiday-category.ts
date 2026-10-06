import { catalogFlag, codesWithFlag } from "@/domains/catalog/catalog-flags";

/**
 * Which event categories put a day on the holiday calendar (ADR-049) is
 * data: `metadata.isHoliday` on the EventCategory item. The seeded
 * "holiday" code keeps that meaning for items saved before the flag existed.
 */
export const LEGACY_HOLIDAY_CATEGORY_CODES: ReadonlySet<string> = new Set(["holiday"]);

export function isHolidayCategory(category: { code: string; metadata?: unknown }): boolean {
  return catalogFlag(category, "isHoliday", LEGACY_HOLIDAY_CATEGORY_CODES);
}

/** The codes of a catalog's holiday categories, for the event form. */
export function holidayCategoryCodes(categories: { code: string; metadata?: unknown }[]): Set<string> {
  return codesWithFlag(categories, "isHoliday", LEGACY_HOLIDAY_CATEGORY_CODES);
}
