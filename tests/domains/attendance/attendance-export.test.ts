import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildAttendanceCsv, buildAttendanceWorkbook } from "@/domains/attendance/attendance-export";
import type { AttendanceReport, AttendanceReportRow } from "@/domains/attendance/attendance-report";
import { attendanceExportQuerySchema } from "@/shared/validation/attendance";

const BASE: AttendanceReportRow = {
  date: "2026-10-05",
  weekday: 1,
  employeeId: "e1",
  employeeNumber: "EMP-001",
  name: "Angela Santos",
  statusCode: "late",
  statusName: "Late",
  checkIn: "08:12",
  checkOut: "17:42",
  hoursWorked: 9.5,
  site: "EGI Rufino",
  distanceMeters: 35,
  verified: true,
  source: "Self-service",
  scheduled: "D 08:00-17:00",
  notes: "",
};

const NO_RECORD = {
  statusCode: null,
  statusName: "No record",
  checkIn: "",
  checkOut: "",
  hoursWorked: null,
  site: "",
  distanceMeters: null,
  verified: null,
  source: "" as const,
  scheduled: "",
};

const REPORT: AttendanceReport = {
  from: "2026-10-05",
  to: "2026-10-06",
  label: "October 5–6, 2026",
  statuses: [
    { code: "present", name: "Present" },
    { code: "late", name: "Late" },
  ],
  rows: [
    BASE,
    { ...BASE, employeeId: "e2", employeeNumber: "EMP-002", name: "Carlos Villanueva, Jr.", ...NO_RECORD },
    { ...BASE, date: "2026-10-06", weekday: 2, ...NO_RECORD },
    { ...BASE, date: "2026-10-06", weekday: 2, employeeId: "e2", employeeNumber: "EMP-002", name: "Carlos Villanueva, Jr.", statusCode: "present", statusName: "Present", hoursWorked: 8, source: "HR", verified: null },
  ],
};

describe("buildAttendanceCsv", () => {
  it("writes one row per employee-day with readable values", () => {
    const lines = buildAttendanceCsv(REPORT).replace(/^﻿/, "").split("\n");
    expect(lines[0]).toBe(
      '"Date","Day","Employee #","Employee","Status","Check-in","Check-out","Hours worked","Scheduled shift","Site","Distance from site (m)","Biometric verified","Recorded by","Notes"',
    );
    expect(lines[1]).toBe('"2026-10-05","Mon","EMP-001","Angela Santos","Late","08:12","17:42","9.5","D 08:00-17:00","EGI Rufino","35","Yes","Self-service",""');
    expect(lines[2]).toContain('"Carlos Villanueva, Jr.","No record","","","","","","",""');
    expect(lines).toHaveLength(5);
  });
});

describe("buildAttendanceWorkbook", () => {
  it("builds a filterable log and a per-employee summary", async () => {
    const workbook = buildAttendanceWorkbook(REPORT, { organizationName: "Acme" });
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await workbook.xlsx.writeBuffer());

    const log = loaded.getWorksheet("Attendance")!;
    expect(log.getCell("A1").value).toBe("Acme: attendance for October 5–6, 2026");
    expect(log.getCell("A3").value).toBe("Date");
    expect(log.getCell("E4").value).toBe("Late");
    expect(log.getCell("H4").value).toBe(9.5);
    expect(log.rowCount).toBe(7);

    const summary = loaded.getWorksheet("Summary")!;
    expect(summary.getRow(3).values).toEqual([undefined, "Employee #", "Employee", "Present", "Late", "No record", "Hours worked"]);
    expect(summary.getRow(4).values).toEqual([undefined, "EMP-001", "Angela Santos", 0, 1, 1, 9.5]);
    expect(summary.getRow(5).values).toEqual([undefined, "EMP-002", "Carlos Villanueva, Jr.", 1, 0, 1, 8]);
  });
});

describe("attendanceExportQuerySchema", () => {
  const base = { organizationId: "507f1f77bcf86cd799439011", format: "xlsx" };

  it("accepts a range of up to 31 days", () => {
    expect(attendanceExportQuerySchema.safeParse({ ...base, from: "2026-10-01", to: "2026-10-31" }).success).toBe(true);
    expect(attendanceExportQuerySchema.safeParse({ ...base, from: "2026-10-05", to: "2026-10-05" }).success).toBe(true);
  });

  it("rejects an end before the start, and ranges longer than 31 days", () => {
    const backwards = attendanceExportQuerySchema.safeParse({ ...base, from: "2026-10-06", to: "2026-10-05" });
    expect(backwards.error?.issues[0].message).toBe("The end date can't be before the start date.");
    const tooLong = attendanceExportQuerySchema.safeParse({ ...base, from: "2026-10-01", to: "2026-11-01" });
    expect(tooLong.error?.issues[0].message).toBe("Export up to 31 days at a time.");
  });
});
