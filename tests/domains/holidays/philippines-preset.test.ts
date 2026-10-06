import { describe, it, expect } from "vitest";
import { easterSunday, lastMondayOfAugust, philippinesPreset } from "@/domains/holidays/presets/philippines";
import { buildDayInfo } from "@/domains/holidays/day-info";
import { dayHeadcount } from "@/domains/attendance/day-headcount";

describe("Philippine holiday preset", () => {
  it("computes Easter and National Heroes Day", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(lastMondayOfAugust(2026)).toBe("2026-08-31");
    expect(lastMondayOfAugust(2027)).toBe("2027-08-30");
  });

  it("gives 2026 exactly as proclaimed (Proclamation No. 1006, s. 2025, plus Eid'l Adha)", () => {
    const year = philippinesPreset.forYear(2026);
    expect(year.verified).toBe(true);
    const byDate = Object.fromEntries(year.entries.map((entry) => [entry.date, entry]));
    expect(byDate["2026-08-31"]).toMatchObject({ name: "National Heroes Day", type: "regular" });
    expect(byDate["2026-02-25"]).toMatchObject({ type: "special_working" });
    expect(byDate["2026-05-27"]).toMatchObject({ name: "Eid'l Adha (Feast of Sacrifice)", type: "regular" });
    expect(year.entries.filter((entry) => entry.type === "regular")).toHaveLength(11);
    expect(year.entries).toHaveLength(20);
  });

  it("proposes the standard dates for other years and says to check them", () => {
    const year = philippinesPreset.forYear(2027);
    expect(year.verified).toBe(false);
    const dates = year.entries.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort());
    expect(year.entries.find((entry) => entry.name === "Good Friday")?.date).toBe("2027-03-26");
    expect(year.entries.find((entry) => entry.name === "Chinese New Year")?.date).toBe("2027-02-06");
    expect(year.notes.join(" ")).toMatch(/Eid'l Fitr/);
  });
});

describe("buildDayInfo", () => {
  it("groups holidays, events (timed first) and notes by day", () => {
    const info = buildDayInfo(
      [{ id: "h1", date: "2026-12-25", name: "Christmas Day", type: "regular", scope: null, source: null, presetKey: "PH", eventId: null }],
      [
        { id: "e2", date: "2026-12-25", title: "Party", time: null, category: "social" },
        { id: "e1", date: "2026-12-25", title: "Mass", time: "08:00", category: "social" },
      ],
      { "2026-12-24": "Half day" },
    );
    expect(Object.keys(info).sort()).toEqual(["2026-12-24", "2026-12-25"]);
    expect(info["2026-12-25"].events.map((event) => event.id)).toEqual(["e1", "e2"]);
    expect(info["2026-12-24"]).toEqual({ holidays: [], events: [], note: "Half day" });
  });
});

describe("dayHeadcount", () => {
  it("counts working, off and unscheduled, by shift", () => {
    const work = { code: "D", name: "Day", kind: "work" as const, color: "blue" };
    const rest = { code: "RD", name: "Rest day", kind: "rest" as const, color: "slate" };
    const rows: { cells: Record<string, typeof work | typeof rest> }[] = [{ cells: { "2026-10-01": work } }, { cells: { "2026-10-01": work } }, { cells: { "2026-10-01": rest } }, { cells: {} }];
    expect(dayHeadcount(rows, "2026-10-01")).toEqual({
      working: 2,
      off: 1,
      unscheduled: 1,
      byShift: [
        { ...work, count: 2 },
        { ...rest, count: 1 },
      ],
    });
  });
});
