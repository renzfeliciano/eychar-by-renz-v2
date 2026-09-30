import { describe, it, expect } from "vitest";
import { SHIFT_COLOR_KEYS, nextShiftColor, shiftColor } from "@/domains/attendance/shift-colors";
import { describeShiftHours } from "@/domains/attendance/shift-display";

describe("shift colors", () => {
  it("offers a curated palette where every color has grid and Excel values", () => {
    expect(SHIFT_COLOR_KEYS.length).toBeGreaterThanOrEqual(10);
    for (const key of SHIFT_COLOR_KEYS) {
      const color = shiftColor(key);
      expect(color.cellClassName).toBeTruthy();
      expect(color.excelFill).toMatch(/^FF[0-9A-F]{6}$/);
      expect(color.excelFont).toMatch(/^FF[0-9A-F]{6}$/);
    }
  });

  it("gives a new work shift the first color no other shift uses", () => {
    expect(nextShiftColor([], "work")).toBe(SHIFT_COLOR_KEYS[0]);
    expect(nextShiftColor([SHIFT_COLOR_KEYS[0], SHIFT_COLOR_KEYS[2]], "work")).toBe(SHIFT_COLOR_KEYS[1]);
  });

  it("gives a rest day the neutral color, and falls back to a neutral for unknown keys", () => {
    expect(nextShiftColor([], "rest")).toBe("slate");
    expect(shiftColor("not-a-color").key).toBe("slate");
    expect(shiftColor(null).key).toBe("slate");
  });

  it("keeps assigning once every color is taken, instead of failing", () => {
    expect(SHIFT_COLOR_KEYS).toContain(nextShiftColor([...SHIFT_COLOR_KEYS], "work"));
  });
});

describe("describeShiftHours", () => {
  it("describes fixed, overnight, flexi and rest shifts", () => {
    expect(describeShiftHours({ kind: "work", startTime: "08:00", endTime: "17:00" })).toBe("08:00–17:00");
    expect(describeShiftHours({ kind: "work", startTime: "22:00", endTime: "07:00" })).toBe("22:00–07:00 (+1 day)");
    expect(describeShiftHours({ kind: "work", pattern: "flexible", startTime: "07:00", latestStartTime: "10:00", requiredHours: 8 })).toBe(
      "Flexi: start 07:00–10:00, 8h",
    );
    expect(describeShiftHours({ kind: "rest" })).toBe("Day off");
  });

  it("uses a plain hyphen for exports", () => {
    expect(describeShiftHours({ kind: "work", startTime: "22:00", endTime: "07:00" }, { dash: "-" })).toBe("22:00-07:00 (+1 day)");
    expect(describeShiftHours({ kind: "rest" }, { dash: "-", restLabel: "" })).toBe("");
  });
});
