import type { HolidayType } from "../holiday-types";

export type PresetHoliday = { date: string; name: string; type: HolidayType; source: string };

export type PresetYear = {
  year: number;
  entries: PresetHoliday[];
  /**
   * True when every date was checked against that year's official
   * proclamation; false when it's the standard dates by rule, which a
   * proclamation can move or add to. The UI says which.
   */
  verified: boolean;
  /** Where the list comes from, shown above the preview. */
  basis: string;
  /** Things HR should still check or add by hand (Eid holidays, local days…). */
  notes: string[];
};

/**
 * A country's holiday preset: rules and official lists that *propose*
 * holidays for a year. Nothing is used until HR reviews the preview and
 * saves the ones they want into the organization's own calendar, so the
 * preset never becomes business logic (AGENTS.md: model the business).
 */
export type HolidayPreset = {
  key: string;
  country: string;
  forYear(year: number): PresetYear;
};
