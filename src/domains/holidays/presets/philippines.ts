import { addDays, dateToDateKey } from "@/lib/date-key";
import type { HolidayType } from "../holiday-types";
import type { HolidayPreset, PresetHoliday, PresetYear } from "./types";

const RA_9492 = "Republic Act No. 9492";
const RA_10966 = "Republic Act No. 10966";
const PROCLAIMED = "Declared yearly by proclamation";

/** Easter Sunday (Gregorian), "YYYY-MM-DD" — the anonymous computus. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateToDateKey(new Date(Date.UTC(year, month - 1, day)));
}

/** The last Monday of August (National Heroes Day). */
export function lastMondayOfAugust(year: number): string {
  const lastDay = new Date(Date.UTC(year, 7, 31));
  const back = (lastDay.getUTCDay() + 6) % 7; // days since Monday
  return dateToDateKey(new Date(Date.UTC(year, 7, 31 - back)));
}

// Lunar New Year falls on a different day each year; known dates only.
const CHINESE_NEW_YEAR: Record<number, string> = {
  2025: "2025-01-29",
  2026: "2026-02-17",
  2027: "2027-02-06",
  2028: "2028-01-26",
  2029: "2029-02-13",
  2030: "2030-02-03",
};

const pad = (n: number) => String(n).padStart(2, "0");
const on = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const entry = (date: string, name: string, type: HolidayType, source: string): PresetHoliday => ({ date, name, type, source });

/**
 * The standard Philippine holidays for a year by rule: fixed dates from
 * law, Holy Week from Easter, and National Heroes Day as the last Monday
 * of August. A proclamation can still move or add days, so a year built
 * this way is marked unverified.
 */
function standardYear(year: number): PresetHoliday[] {
  const easter = easterSunday(year);
  const entries: PresetHoliday[] = [
    entry(on(year, 1, 1), "New Year's Day", "regular", RA_9492),
    entry(addDays(easter, -3), "Maundy Thursday", "regular", RA_9492),
    entry(addDays(easter, -2), "Good Friday", "regular", RA_9492),
    entry(addDays(easter, -1), "Black Saturday", "special_non_working", PROCLAIMED),
    entry(on(year, 4, 9), "Araw ng Kagitingan", "regular", RA_9492),
    entry(on(year, 5, 1), "Labor Day", "regular", RA_9492),
    entry(on(year, 6, 12), "Independence Day", "regular", RA_9492),
    entry(on(year, 8, 21), "Ninoy Aquino Day", "special_non_working", RA_9492),
    entry(lastMondayOfAugust(year), "National Heroes Day", "regular", RA_9492),
    entry(on(year, 11, 1), "All Saints' Day", "special_non_working", RA_9492),
    entry(on(year, 11, 30), "Bonifacio Day", "regular", RA_9492),
    entry(on(year, 12, 8), "Feast of the Immaculate Conception of Mary", "special_non_working", RA_10966),
    entry(on(year, 12, 25), "Christmas Day", "regular", RA_9492),
    entry(on(year, 12, 30), "Rizal Day", "regular", RA_9492),
    entry(on(year, 12, 31), "Last Day of the Year", "special_non_working", RA_9492),
  ];
  const lunar = CHINESE_NEW_YEAR[year];
  if (lunar) entries.push(entry(lunar, "Chinese New Year", "special_non_working", PROCLAIMED));
  return entries;
}

const PROC_1006 = "Proclamation No. 1006, s. 2025";

/** Years checked line by line against their official proclamations. */
const VERIFIED: Record<number, { basis: string; entries: PresetHoliday[]; notes: string[] }> = {
  2026: {
    basis: "Proclamation No. 1006, s. 2025 (holidays for 2026) and Proclamation No. 1264, s. 2026 (Eid'l Adha).",
    entries: [
      entry("2026-01-01", "New Year's Day", "regular", PROC_1006),
      entry("2026-02-17", "Chinese New Year", "special_non_working", PROC_1006),
      entry("2026-02-25", "EDSA People Power Revolution Anniversary", "special_working", PROC_1006),
      entry("2026-04-02", "Maundy Thursday", "regular", PROC_1006),
      entry("2026-04-03", "Good Friday", "regular", PROC_1006),
      entry("2026-04-04", "Black Saturday", "special_non_working", PROC_1006),
      entry("2026-04-09", "Araw ng Kagitingan", "regular", PROC_1006),
      entry("2026-05-01", "Labor Day", "regular", PROC_1006),
      entry("2026-05-27", "Eid'l Adha (Feast of Sacrifice)", "regular", "Proclamation No. 1264, s. 2026"),
      entry("2026-06-12", "Independence Day", "regular", PROC_1006),
      entry("2026-08-21", "Ninoy Aquino Day", "special_non_working", PROC_1006),
      entry("2026-08-31", "National Heroes Day", "regular", PROC_1006),
      entry("2026-11-01", "All Saints' Day", "special_non_working", PROC_1006),
      entry("2026-11-02", "All Souls' Day", "special_non_working", PROC_1006),
      entry("2026-11-30", "Bonifacio Day", "regular", PROC_1006),
      entry("2026-12-08", "Feast of the Immaculate Conception of Mary", "special_non_working", PROC_1006),
      entry("2026-12-24", "Christmas Eve", "special_non_working", PROC_1006),
      entry("2026-12-25", "Christmas Day", "regular", PROC_1006),
      entry("2026-12-30", "Rizal Day", "regular", PROC_1006),
      entry("2026-12-31", "Last Day of the Year", "special_non_working", PROC_1006),
    ],
    notes: ["Eid'l Fitr is declared by its own proclamation; add it by hand if it isn't listed.", "Local special days (city or provincial foundation days) aren't included; add them by hand."],
  },
};

export const philippinesPreset: HolidayPreset = {
  key: "PH",
  country: "Philippines",
  forYear(year: number): PresetYear {
    const verified = VERIFIED[year];
    if (verified) return { year, entries: [...verified.entries], verified: true, basis: verified.basis, notes: verified.notes };
    return {
      year,
      entries: standardYear(year).sort((a, b) => a.date.localeCompare(b.date)),
      verified: false,
      basis: "The standard dates by law and rule. Check them against that year's holiday proclamation before saving: it can move a holiday or add days.",
      notes: [
        "Eid'l Fitr and Eid'l Adha are declared by separate proclamations; add them by hand once announced.",
        "Additional special days (often All Souls' Day, Christmas Eve) and special working days are set by each year's proclamation.",
        ...(CHINESE_NEW_YEAR[year] ? [] : ["Chinese New Year isn't known for this year; add it by hand."]),
      ],
    };
  },
};
