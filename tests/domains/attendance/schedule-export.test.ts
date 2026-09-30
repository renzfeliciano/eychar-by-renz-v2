import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildScheduleCsv, buildScheduleWorkbook, formatShiftHours } from "@/domains/attendance/schedule-export";
import { monthDays, type ScheduleMonthView } from "@/domains/attendance/schedule-service";
import { shiftColor } from "@/domains/attendance/shift-colors";

const EXTRA = { pattern: "fixed" as const, latestStartTime: null, requiredHours: null, customTimes: false };
const DAY = { shiftTemplateId: "s1", code: "D", name: "Day", kind: "work" as const, startTime: "08:00", endTime: "17:00", color: "blue", ...EXTRA };
const NIGHT = { shiftTemplateId: "s2", code: "N", name: "Night", kind: "work" as const, startTime: "22:00", endTime: "07:00", color: "violet", ...EXTRA };
const REST = { shiftTemplateId: "s3", code: "RD", name: "Rest day", kind: "rest" as const, startTime: null, endTime: null, color: "slate", ...EXTRA };
const FLEXI = {
  shiftTemplateId: "s4",
  code: "FX",
  name: "Flexi",
  kind: "work" as const,
  color: "teal",
  pattern: "flexible" as const,
  startTime: "07:00",
  endTime: null,
  latestStartTime: "10:00",
  requiredHours: 8,
  customTimes: false,
};

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
        "2026-10-04": { ...DAY, startTime: "10:00", endTime: "19:00", customTimes: true, projectId: null, projectName: null },
        "2026-10-05": { ...FLEXI, projectId: null, projectName: null },
      },
    },
    { employeeId: "e2", employeeNumber: "EMP-002", name: "Carlos Villanueva, Jr.", cells: {} },
  ],
};

const SHIFTS = [
  { code: "D", name: "Day", kind: "work" as const, startTime: "08:00", endTime: "17:00", color: "blue" },
  { code: "N", name: "Night", kind: "work" as const, startTime: "22:00", endTime: "07:00", color: "violet" },
  { code: "FX", name: "Flexi", kind: "work" as const, pattern: "flexible" as const, startTime: "07:00", endTime: null, latestStartTime: "10:00", requiredHours: 8, color: "teal" },
  { code: "RD", name: "Rest day", kind: "rest" as const, startTime: null, endTime: null, color: "slate" },
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
    expect(lines[0]).toBe('"Employee #","Employee","Date","Day","Shift code","Shift","Hours","Custom hours","Project"');
    expect(lines).toHaveLength(6);
    expect(lines[1]).toBe('"EMP-001","Angela Santos","2026-10-01","Thu","D","Day","08:00-17:00","","EGI Rufino"');
    expect(lines[3]).toBe('"EMP-001","Angela Santos","2026-10-03","Sat","RD","Rest day","","",""');
    expect(lines[4]).toBe('"EMP-001","Angela Santos","2026-10-04","Sun","D","Day","10:00-19:00","Yes",""');
    expect(lines[5]).toBe('"EMP-001","Angela Santos","2026-10-05","Mon","FX","Flexi","Flexi: start 07:00-10:00, 8h","",""');
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

  it("fills each scheduled day with its shift's color, and shades weekend headers", () => {
    const grid = buildScheduleWorkbook(VIEW, { organizationName: "Acme", shifts: SHIFTS }).getWorksheet("Schedule")!;
    const fillOf = (address: string) => (grid.getCell(address).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

    expect(fillOf("C5")).toBe(shiftColor("blue").excelFill); // Oct 1, Day
    expect(fillOf("D5")).toBe(shiftColor("violet").excelFill); // Oct 2, Night
    expect(fillOf("E5")).toBe(shiftColor("slate").excelFill); // Oct 3, rest day
    expect(grid.getCell("C5").font?.color?.argb).toBe(shiftColor("blue").excelFont);
    expect(fillOf("C6")).toBeUndefined(); // unscheduled
    expect(fillOf("E3")).toBeDefined(); // Oct 3 is a Saturday header
  });

  it("marks a day with custom hours and notes the actual times on the cell", () => {
    const grid = buildScheduleWorkbook(VIEW, { organizationName: "Acme", shifts: SHIFTS }).getWorksheet("Schedule")!;

    expect(grid.getCell("F5").value).toBe("D*");
    expect(JSON.stringify(grid.getCell("F5").note)).toContain("10:00-19:00");
    expect(grid.getCell("F5").fill).toMatchObject({ fgColor: { argb: shiftColor("blue").excelFill } });
  });

  it("colors the legend swatches and explains custom hours and flexi shifts", () => {
    const grid = buildScheduleWorkbook(VIEW, { organizationName: "Acme", shifts: SHIFTS }).getWorksheet("Schedule")!;
    const legend = new Map<string, ExcelJS.Row>();
    grid.eachRow((row) => {
      if (row.number > 6 && typeof row.getCell(1).value === "string") legend.set(String(row.getCell(1).value), row);
    });

    expect((legend.get("D")!.getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe(shiftColor("blue").excelFill);
    expect(legend.get("FX")!.getCell(3).value).toBe("Flexi: start 07:00-10:00, 8h");
    expect([...legend.keys()].some((text) => text.startsWith("*"))).toBe(true);
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

    expect(details.getRow(1).values).toEqual([undefined, "Employee #", "Employee", "Date", "Day", "Shift code", "Shift", "Hours", "Custom hours", "Project"]);
    expect(details.getCell("I2").value).toBe("EGI Rufino");
    expect((details.getCell("E2").fill as ExcelJS.FillPattern).fgColor?.argb).toBe(shiftColor("blue").excelFill);
    expect(details.rowCount).toBe(6);
    expect(details.autoFilter).toBeTruthy();
  });
});
