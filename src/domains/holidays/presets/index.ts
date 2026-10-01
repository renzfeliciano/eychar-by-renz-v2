import { philippinesPreset } from "./philippines";
import type { HolidayPreset } from "./types";

export type { HolidayPreset, PresetHoliday, PresetYear } from "./types";

/** Country presets HR can load from. Add a country by adding its module here. */
export const HOLIDAY_PRESETS: Record<string, HolidayPreset> = {
  [philippinesPreset.key]: philippinesPreset,
};

export function holidayPreset(key: string): HolidayPreset | null {
  return HOLIDAY_PRESETS[key] ?? null;
}
