import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildScheduleCsv, buildScheduleWorkbook, formatShiftHours } from "@/domains/attendance/schedule-export";
import { monthDays, type ScheduleMonthView } from "@/domains/attendance/schedule-service";

const DAY = { shiftTemplateId: "s1", code: "D", name: "Day", kind: "work" as const, startTime: "08:00", endTime: "17:00" };
const NIGHT = { shiftTemplateId: "s2", code: "N", name: "Night", kind: "work" as const, startTime: "22:00", endTime: "07:00" };
const REST = { shiftTemplateId: "s3", code: "RD", name: "Rest day", kind: "rest" as const, startTime: null, endTime: null };

const VIEW: ScheduleMonthView = {
  month: "2026-10",
  label: "October 2026",
  days: monthDays("2026-10"),
  rows: [
    {
      employeeId: "e1",
      employeeNumber: "EMP-001",
      name: "Angela Santos",
      cells: {
        "2026-10-01": { ...DAY, projectId: "p1", projectName: "EGI Rufino" },
        "2026-10-02": { ...NIGHT, projectId: null, projectName: null },
        "2026-10-03": { ...REST, projectId: null, projectName: null },
      },
    },
    { employeeId: "e2", employeeNumber: "EMP-002", name: "Carlos Villanueva, Jr.", cells: {} },
  ],
};

const SHIFTS = [
  { code: "D", name: "Day", kind: "work" as const, startTime: "08:00", endTime: "17:00" },
  { code: "N", name: "Night", kind: "work" as const, startTime: "22:00", endTime: "07:00" },
  { code: "RD", name: "Rest day", kind: "rest" as const, startTime: null, endTime: null },
];

describe("formatShiftHours", () => {
  it("marks an overnight shift as ending the next day, and rest days as no hours", () => {
    expect(formatShiftHours("08:00", "17:00")).toBe("08:00-17:00");
    expect(formatShiftHours("22:00", "07:00")).toBe("22:00-07:00 (+1 day)");
    expect(formatShiftHours(null, null)).toBe("");
  });
});

describe("buildScheduleCsv", () => {
  it("writes one row per scheduled day, with a BOM so Excel reads names correctly", () => {
    const csv = buildScheduleCsv(VIEW);
    const lines = csv.replace(/^﻿/, "").split("\n");

    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe('"Employee #","Employee","Date","Day","Shift code","Shift","Hours","Project"');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('"EMP-001","Angela Santos","2026-10-01","Thu","D","Day","08:00-17:00","EGI Rufino"');
    expect(lines[3]).toBe('"EMP-001","Angela Santos","2026-10-03","Sat","RD","Rest day","",""');
  });
});

describe("buildScheduleWorkbook", () => {
  it("lays out a month grid: title, day + weekday headers, shift codes, frozen headers", async () => {
    const workbook = buildScheduleWorkbook(VIEW, { organizationName: "Project Concepts", shifts: SHIFTS });
    const grid = workbook.getWorksheet("Schedule")!;

    expect(grid.getCell("A1").value).toBe("Project Concepts: schedule for October 2026");
    expect(grid.getCell("C3").value).toBe(1);
    expect(grid.getCell("C4").value).toBe("Thu");
    expect(grid.getCell("AG3").value).toBe(31);
    expect(grid.getCell("A5").value).toBe("EMP-001");
    expect(grid.getCell("B5").value).toBe("Angela Santos");
    expect(grid.getCell("C5").value).toBe("D");
    expect(grid.getCell("E5").value).toBe("RD");
    expect(grid.getCell("C6").value).toBeNull();
    expect(grid.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: 4 });

    // It must also survive a real save/load round-trip.
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(await workbook.xlsx.writeBuffer());
    expect(reloaded.getWorksheet("Schedule")!.getCell("B5").value).toBe("Angela Santos");
  });

  it("shades rest days and weekend columns so the month reads at a glance", () => {
    const grid = buildScheduleWorkbook(VIEW, { organizationName: "Acme", shifts: SHIFTS }).getWorksheet("Schedule")!;
    const fillOf = (address: string) => (grid.getCell(address).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

    expect(fillOf("E5")).toBeDefined(); // Oct 3, rest day
    expect(fillOf("C5")).toBeUndefined(); // Oct 1, a normal work shift
    expect(fillOf("E3")).toBeDefined(); // Oct 3 is a Saturday header
  });

  it("adds a legend of the shifts under the grid", () => {
    const grid = buildScheduleWorkbook(VIEW, { organizationName: "Acme", shifts: SHIFTS }).getWorksheet("Schedule")!;
    const legendRows: string[] = [];
    grid.eachRow((row) => {
      const code = row.getCell(1).value;
      const name = row.getCell(2).value;
      if (code === "N" && name === "Night") legendRows.push(String(row.getCell(3).value));
    });
    expect(legendRows).toEqual(["22:00-07:00 (+1 day)"]);
  });

  it("includes a filterable Details sheet with the project for each day", () => {
    const details = buildScheduleWorkbook(VIEW, { organizationName: "Acme", shifts: SHIFTS }).getWorksheet("Details")!;

    expect(details.getRow(1).values).toEqual([undefined, "Employee #", "Employee", "Date", "Day", "Shift code", "Shift", "Hours", "Project"]);
    expect(details.getCell("H2").value).toBe("EGI Rufino");
    expect(details.rowCount).toBe(4);
    expect(details.autoFilter).toBeTruthy();
  });
});
