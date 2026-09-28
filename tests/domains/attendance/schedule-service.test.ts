import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, EmploymentModel, ProjectModel, ScheduleEntryModel, AuditLogModel } from "@/server/db/models";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { ShiftTemplateService } from "@/domains/attendance/shift-template-service";
import { ScheduleService, monthDays } from "@/domains/attendance/schedule-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

async function seedOrganization(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-sched-${suffix}-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  await EmploymentStatusService.create({ organizationId, code: "active", name: "Active", metadata: { isActiveHeadcount: true } }, {});
  await EmploymentStatusService.create({ organizationId, code: "resigned", name: "Resigned", metadata: { isActiveHeadcount: false } }, {});
  const day = await ShiftTemplateService.create({ organizationId, name: "Day", code: "D", kind: "work", startTime: "08:00", endTime: "17:00" }, {});
  const rest = await ShiftTemplateService.create({ organizationId, name: "Rest day", code: "RD", kind: "rest" }, {});
  const project = await ProjectModel.create({ organizationId, name: "EGI Rufino", code: `RUF-${Math.random()}` });
  return { organizationId, dayId: day._id.toString(), restId: rest._id.toString(), projectId: project._id.toString() };
}

async function seedEmployee(organizationId: string, firstName: string, status = "active") {
  const person = await PersonModel.create({ organizationId, firstName, lastName: "Santos" });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${firstName}-${Math.random()}` });
  await EmploymentModel.create({ organizationId, employeeId: employee._id, employmentType: "regular", status });
  return employee._id.toString();
}

describe("monthDays", () => {
  it("lists every calendar day of the month with its weekday", () => {
    const days = monthDays("2026-02");
    expect(days).toHaveLength(28);
    expect(days[0]).toEqual({ date: "2026-02-01", day: 1, weekday: 0, isWeekend: true });
    expect(days[1].weekday).toBe(1);
    expect(monthDays("2028-02")).toHaveLength(29);
  });
});

describe("ScheduleService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("saves shifts with their project and shows them in the month view", async () => {
    const { organizationId, dayId, restId, projectId } = await seedOrganization("1");
    const employeeId = await seedEmployee(organizationId, "Angela");

    const result = await ScheduleService.saveEntries(
      organizationId,
      [
        { employeeId, date: "2026-10-05", shiftTemplateId: dayId, projectId },
        { employeeId, date: "2026-10-06", shiftTemplateId: restId },
      ],
      {},
    );

    expect(result).toEqual({ saved: 2, cleared: 0 });
    const view = await ScheduleService.getMonthView(organizationId, "2026-10");
    const row = view.rows.find((candidate) => candidate.employeeId === employeeId)!;
    expect(row.name).toBe("Angela Santos");
    expect(row.cells["2026-10-05"]).toMatchObject({ code: "D", kind: "work", startTime: "08:00", endTime: "17:00", projectId, projectName: "EGI Rufino" });
    expect(row.cells["2026-10-06"]).toMatchObject({ code: "RD", kind: "rest" });
    expect(view.days).toHaveLength(31);
  });

  it("keeps the shift as scheduled even if the template is edited later", async () => {
    const { organizationId, dayId } = await seedOrganization("2");
    const employeeId = await seedEmployee(organizationId, "Carlos");
    await ScheduleService.saveEntries(organizationId, [{ employeeId, date: "2026-10-05", shiftTemplateId: dayId }], {});

    await ShiftTemplateService.update(dayId, organizationId, { startTime: "09:00", endTime: "18:00" }, {});

    const view = await ScheduleService.getMonthView(organizationId, "2026-10");
    expect(view.rows[0].cells["2026-10-05"].startTime).toBe("08:00");
  });

  it("overwrites the same day instead of duplicating it, and clears a day with null", async () => {
    const { organizationId, dayId, restId } = await seedOrganization("3");
    const employeeId = await seedEmployee(organizationId, "Maria");
    await ScheduleService.saveEntries(organizationId, [{ employeeId, date: "2026-10-05", shiftTemplateId: dayId }], {});

    await ScheduleService.saveEntries(organizationId, [{ employeeId, date: "2026-10-05", shiftTemplateId: restId }], {});
    expect(await ScheduleEntryModel.countDocuments({ employeeId })).toBe(1);

    const cleared = await ScheduleService.saveEntries(organizationId, [{ employeeId, date: "2026-10-05", shiftTemplateId: null }], {});
    expect(cleared).toEqual({ saved: 0, cleared: 1 });
    expect(await ScheduleEntryModel.countDocuments({ employeeId })).toBe(0);
  });

  it("never attaches a project to a rest day", async () => {
    const { organizationId, restId, projectId } = await seedOrganization("4");
    const employeeId = await seedEmployee(organizationId, "Miguel");

    await ScheduleService.saveEntries(organizationId, [{ employeeId, date: "2026-10-05", shiftTemplateId: restId, projectId }], {});

    const entry = await ScheduleEntryModel.findOne({ employeeId }).lean();
    expect(entry?.projectId).toBeUndefined();
  });

  it("rejects employees, shifts, and projects from another organization", async () => {
    const { organizationId, dayId } = await seedOrganization("5");
    const other = await seedOrganization("5b");
    const employeeId = await seedEmployee(organizationId, "Bea");
    const foreignEmployeeId = await seedEmployee(other.organizationId, "Foreign");

    await expect(ScheduleService.saveEntries(organizationId, [{ employeeId: foreignEmployeeId, date: "2026-10-05", shiftTemplateId: dayId }], {})).rejects.toThrow(NotFoundError);
    await expect(ScheduleService.saveEntries(organizationId, [{ employeeId, date: "2026-10-05", shiftTemplateId: other.dayId }], {})).rejects.toThrow(NotFoundError);
    await expect(
      ScheduleService.saveEntries(organizationId, [{ employeeId, date: "2026-10-05", shiftTemplateId: dayId, projectId: other.projectId }], {}),
    ).rejects.toThrow(NotFoundError);
    expect(await ScheduleEntryModel.countDocuments({ organizationId })).toBe(0);
  });

  it("rejects an inactive shift or project", async () => {
    const { organizationId, dayId, projectId } = await seedOrganization("6");
    const employeeId = await seedEmployee(organizationId, "Ramon");
    await ShiftTemplateService.updateStatus(dayId, organizationId, { status: "inactive" }, {});

    await expect(ScheduleService.saveEntries(organizationId, [{ employeeId, date: "2026-10-05", shiftTemplateId: dayId }], {})).rejects.toThrow(BusinessRuleError);

    const activeShift = await ShiftTemplateService.create({ organizationId, name: "Day 2", code: "D2", kind: "work", startTime: "07:00", endTime: "16:00" }, {});
    const activeDayId = activeShift._id.toString();
    await ProjectModel.updateOne({ _id: projectId }, { status: "inactive" });
    await expect(
      ScheduleService.saveEntries(organizationId, [{ employeeId, date: "2026-10-05", shiftTemplateId: activeDayId, projectId }], {}),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("lists active employees even with no shifts yet, and hides departed ones unless they were scheduled that month", async () => {
    const { organizationId, dayId } = await seedOrganization("7");
    const activeId = await seedEmployee(organizationId, "Active");
    const resignedId = await seedEmployee(organizationId, "Gone", "resigned");
    const resignedButScheduledId = await seedEmployee(organizationId, "Lastmonth", "resigned");
    await ScheduleService.saveEntries(organizationId, [{ employeeId: resignedButScheduledId, date: "2026-10-01", shiftTemplateId: dayId }], {});

    const ids = (await ScheduleService.getMonthView(organizationId, "2026-10")).rows.map((row) => row.employeeId);

    expect(ids).toContain(activeId);
    expect(ids).toContain(resignedButScheduledId);
    expect(ids).not.toContain(resignedId);
    expect((await ScheduleService.getMonthView(organizationId, "2026-11")).rows.map((row) => row.employeeId)).not.toContain(resignedButScheduledId);
  });

  it("only returns the requested month's shifts", async () => {
    const { organizationId, dayId } = await seedOrganization("8");
    const employeeId = await seedEmployee(organizationId, "Nina");
    await ScheduleService.saveEntries(
      organizationId,
      [
        { employeeId, date: "2026-09-30", shiftTemplateId: dayId },
        { employeeId, date: "2026-10-31", shiftTemplateId: dayId },
        { employeeId, date: "2026-11-01", shiftTemplateId: dayId },
      ],
      {},
    );

    const cells = (await ScheduleService.getMonthView(organizationId, "2026-10")).rows[0].cells;

    expect(Object.keys(cells)).toEqual(["2026-10-31"]);
  });

  it("audits each employee's changes", async () => {
    const { organizationId, dayId } = await seedOrganization("9");
    const employeeId = await seedEmployee(organizationId, "Lara");

    await ScheduleService.saveEntries(organizationId, [{ employeeId, date: "2026-10-05", shiftTemplateId: dayId }], { userId: undefined });

    const audits = await AuditLogModel.find({ resourceId: employeeId, action: "schedule.updated" }).lean();
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata).toMatchObject({ changes: [{ date: "2026-10-05", shift: "D" }] });
  });

  it("finds a single day's entry (used to pre-select the clock-in project)", async () => {
    const { organizationId, dayId, projectId } = await seedOrganization("10");
    const employeeId = await seedEmployee(organizationId, "Tess");
    await ScheduleService.saveEntries(organizationId, [{ employeeId, date: "2026-10-05", shiftTemplateId: dayId, projectId }], {});

    const entry = await ScheduleService.getEntryForDate(organizationId, employeeId, "2026-10-05");

    expect(entry?.projectId?.toString()).toBe(projectId);
    expect(await ScheduleService.getEntryForDate(organizationId, employeeId, "2026-10-06")).toBeNull();
  });
});
