import { describe, it, expect } from "vitest";
import { buildMonthGrid, shiftMonth, groupByDate } from "@/domains/events/calendar";

describe("buildMonthGrid", () => {
  it("fills whole weeks, Sunday first, with the neighbouring months' days marked outside the month", () => {
    // September 2026 starts on a Tuesday and ends on a Wednesday.
    const cells = buildMonthGrid("2026-09");
    expect(cells).toHaveLength(35);
    expect(cells[0]).toMatchObject({ date: "2026-08-30", day: 30, inMonth: false, isWeekend: true });
    expect(cells[2]).toMatchObject({ date: "2026-09-01", day: 1, inMonth: true, isWeekend: false });
    expect(cells[31]).toMatchObject({ date: "2026-09-30", inMonth: true });
    expect(cells[34]).toMatchObject({ date: "2026-10-03", inMonth: false, isWeekend: true });
  });

  it("uses six weeks when the month needs them", () => {
    // August 2026 starts on a Saturday.
    expect(buildMonthGrid("2026-08")).toHaveLength(42);
  });
});

describe("shiftMonth", () => {
  it("moves across year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
  });
});

describe("groupByDate", () => {
  it("groups by day in date order, keeping each day's timed events in time order, untimed last", () => {
    const groups = groupByDate([
      { id: "a", date: "2026-09-30", time: null },
      { id: "b", date: "2026-09-29", time: "14:00" },
      { id: "c", date: "2026-09-29", time: "09:30" },
    ]);
    expect(groups.map((group) => group.date)).toEqual(["2026-09-29", "2026-09-30"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["c", "b"]);
  });
});
