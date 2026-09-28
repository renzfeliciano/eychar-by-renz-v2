import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, EmploymentModel, ProjectModel, AttendanceRecordModel } from "@/server/db/models";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { AttendanceStatusService } from "@/domains/catalog/attendance-status-service";
import { ShiftTemplateService } from "@/domains/attendance/shift-template-service";
import { ScheduleService, dateKeyToDate } from "@/domains/attendance/schedule-service";
import { AttendanceReportService, formatReportRange } from "@/domains/attendance/attendance-report";

async function seedOrganization() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-report-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  await EmploymentStatusService.create({ organizationId, code: "active", name: "Active", metadata: { isActiveHeadcount: true } }, {});
  await EmploymentStatusService.create({ organizationId, code: "resigned", name: "Resigned", metadata: { isActiveHeadcount: false } }, {});
  await AttendanceStatusService.create({ organizationId, code: "present", name: "Present" }, {});
  await AttendanceStatusService.create({ organizationId, code: "late", name: "Late" }, {});
  const project = await ProjectModel.create({ organizationId, name: "EGI Rufino", code: `RUF-${Math.random()}` });
  return { organizationId, projectId: project._id.toString() };
}

async function seedEmployee(organizationId: string, firstName: string, status = "active") {
  const person = await PersonModel.create({ organizationId, firstName, lastName: "Santos" });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${firstName}` });
  await EmploymentModel.create({ organizationId, employeeId: employee._id, employmentType: "regular", status });
  return employee._id.toString();
}

describe("formatReportRange", () => {
  it("reads naturally for a day, a range within a month, and across months", () => {
    expect(formatReportRange("2026-10-05", "2026-10-05")).toBe("October 5, 2026");
    expect(formatReportRange("2026-10-01", "2026-10-15")).toBe("October 1–15, 2026");
    expect(formatReportRange("2026-09-28", "2026-10-03")).toBe("September 28 – October 3, 2026");
    expect(formatReportRange("2026-12-28", "2027-01-03")).toBe("December 28, 2026 – January 3, 2027");
  });
});

describe("AttendanceReportService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("lists every current employee for every day, the way the daily roster shows them", async () => {
    const { organizationId, projectId } = await seedOrganization();
    const angela = await seedEmployee(organizationId, "Angela");
    await seedEmployee(organizationId, "Carlos");
    const ben = await seedEmployee(organizationId, "Ben", "resigned");
    await seedEmployee(organizationId, "Dan", "resigned");

    const day = await ShiftTemplateService.create({ organizationId, name: "Day", code: "D", kind: "work", startTime: "08:00", endTime: "17:00" }, {});
    await ScheduleService.saveEntries(organizationId, [{ employeeId: angela, date: "2026-10-05", shiftTemplateId: day._id.toString(), projectId }], {});

    await AttendanceRecordModel.create({
      organizationId,
      employeeId: angela,
      date: dateKeyToDate("2026-10-05"),
      status: "late",
      checkInAt: new Date(2026, 9, 5, 8, 12),
      checkOutAt: new Date(2026, 9, 5, 17, 42),
      projectId,
      checkIn: { at: new Date(2026, 9, 5, 8, 12), verified: true, distanceMeters: 35 },
    });
    // Someone who has since left still appears on the days they have a record for.
    await AttendanceRecordModel.create({ organizationId, employeeId: ben, date: dateKeyToDate("2026-10-06"), status: "present", notes: "Recorded by HR" });

    const report = await AttendanceReportService.build(organizationId, "2026-10-05", "2026-10-06");

    expect(report.label).toBe("October 5–6, 2026");
    expect(report.statuses).toEqual([
      { code: "present", name: "Present" },
      { code: "late", name: "Late" },
    ]);
    expect(report.rows.map((row) => `${row.date} ${row.name}`)).toEqual([
      "2026-10-05 Angela Santos",
      "2026-10-05 Ben Santos",
      "2026-10-05 Carlos Santos",
      "2026-10-06 Angela Santos",
      "2026-10-06 Ben Santos",
      "2026-10-06 Carlos Santos",
    ]);

    expect(report.rows[0]).toEqual({
      date: "2026-10-05",
      weekday: 1,
      employeeId: angela,
      employeeNumber: "EMP-Angela",
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
    });
    expect(report.rows[4]).toMatchObject({ statusName: "Present", source: "HR", verified: null, checkIn: "", hoursWorked: null, notes: "Recorded by HR" });
    expect(report.rows[2]).toMatchObject({ statusCode: null, statusName: "No record", source: "", scheduled: "", site: "" });
  });
});
