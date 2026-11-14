import type { HolidayType } from "@/domains/holidays/holiday-types";

/**
 * How each holiday type is treated for pay (plan Phase 4): the day type the
 * attendance day result records on such a day. Pay treatment, so it lives on
 * the payroll policy, not on the holiday (see holiday-types.ts). "workday"
 * means the organization doesn't observe that type: the day is ordinary.
 */
export const HOLIDAY_DAY_TYPE_CHOICES = ["regular_holiday", "special_holiday", "special_working", "workday"] as const;
export type HolidayDayType = (typeof HOLIDAY_DAY_TYPE_CHOICES)[number];

/**
 * Seeded defaults (Philippine categories, one to one). Configuration, not a
 * formula: each payroll policy can set its own. Also the fallback for a
 * policy saved before the mapping existed, so those read as before.
 */
export const HOLIDAY_DAY_TYPE_DEFAULTS: Record<HolidayType, HolidayDayType> = {
  regular: "regular_holiday",
  special_non_working: "special_holiday",
  special_working: "special_working",
};

export type HolidayDayTypes = Record<HolidayType, HolidayDayType>;

/** A policy's mapping, with the defaults filled in for whatever it leaves unset. */
export function holidayDayTypesOf(policy: { holidayDayTypes?: { [K in HolidayType]?: string | null } | null } | null | undefined): HolidayDayTypes {
  const set = policy?.holidayDayTypes ?? {};
  const pick = (type: HolidayType): HolidayDayType => {
    const value = set[type];
    return value && (HOLIDAY_DAY_TYPE_CHOICES as readonly string[]).includes(value) ? (value as HolidayDayType) : HOLIDAY_DAY_TYPE_DEFAULTS[type];
  };
  return { regular: pick("regular"), special_non_working: pick("special_non_working"), special_working: pick("special_working") };
}

/** Whether a day of this type is normally a day off (a special *working* day isn't). */
export function isDayOffDayType(dayType: HolidayDayType): boolean {
  return dayType === "regular_holiday" || dayType === "special_holiday";
}
