/**
 * How a holiday is observed. These follow Philippine labor-law categories
 * (regular / special non-working / special working), which also cover what
 * most other calendars need; pay treatment stays in payroll policy, not here.
 */
export const HOLIDAY_TYPES = ["regular", "special_non_working", "special_working"] as const;
export type HolidayType = (typeof HOLIDAY_TYPES)[number];

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  regular: "Regular holiday",
  special_non_working: "Special non-working day",
  special_working: "Special working day",
};

/** Whether the day is normally a day off for staff (a special *working* day isn't). */
export function isDayOff(type: HolidayType): boolean {
  return type !== "special_working";
}

/** A holiday as the UI reads it. */
export type HolidayView = {
  id: string;
  date: string;
  name: string;
  type: HolidayType;
  scope: string | null;
  source: string | null;
  presetKey: string | null;
};
