import { describe, it, expect } from "vitest";
import { HOLIDAY_DAY_TYPE_DEFAULTS, holidayDayTypesOf } from "@/domains/payroll/holiday-day-types";
import { HOLIDAY_TYPES } from "@/domains/holidays/holiday-types";

describe("holidayDayTypesOf (plan Phase 4)", () => {
  it("has a default for every holiday type", () => {
    for (const type of HOLIDAY_TYPES) expect(HOLIDAY_DAY_TYPE_DEFAULTS[type]).toBeTruthy();
  });

  it("fills the defaults for a policy saved before the mapping existed", () => {
    expect(holidayDayTypesOf(null)).toEqual(HOLIDAY_DAY_TYPE_DEFAULTS);
    expect(holidayDayTypesOf({})).toEqual(HOLIDAY_DAY_TYPE_DEFAULTS);
  });

  it("keeps what the policy sets and fills the rest", () => {
    expect(holidayDayTypesOf({ holidayDayTypes: { regular: "workday", special_working: null } })).toEqual({ ...HOLIDAY_DAY_TYPE_DEFAULTS, regular: "workday" });
  });
});
