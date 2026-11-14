import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AttendanceRecordModel, AuditLogModel, OrganizationModel } from "@/server/db/models";
import { backfillAttendanceDates } from "@/domains/attendance/attendance-date-backfill";

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

async function seedOrganization() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-date-bf-${Date.now()}-${Math.random()}` });
  return organization._id.toString();
}

async function recordFor(organizationId: string, employeeId: Types.ObjectId, date: string, checkInAt?: string) {
  return AttendanceRecordModel.create({ organizationId, employeeId, date: day(date), status: "present", ...(checkInAt ? { checkInAt: new Date(checkInAt) } : {}) });
}

describe("backfillAttendanceDates (gap B3, plan item 1b)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("dry run reports records filed under the UTC day and changes nothing", async () => {
    const organizationId = await seedOrganization();
    const employee = new Types.ObjectId();
    // 02:00 Manila on the 16th, filed under the UTC day (15th) by the old code.
    const wrong = await recordFor(organizationId, employee, "2026-11-15", "2026-11-15T18:00:00Z");
    // 09:00 Manila on the 17th: already right.
    await recordFor(organizationId, employee, "2026-11-17", "2026-11-17T01:00:00Z");

    const report = await backfillAttendanceDates({ apply: false, organizationId });

    expect(report).toMatchObject({ scanned: 2, alreadyCorrect: 1, toMove: 1, moved: 0, collisions: [], withoutCheckIn: 0 });
    expect(report.moves).toEqual([{ recordId: wrong._id.toString(), employeeId: employee.toString(), from: "2026-11-15", to: "2026-11-16" }]);
    expect((await AttendanceRecordModel.findById(wrong._id).lean())?.date.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });

  it("apply moves the record to the Manila day, audits it, and a second run finds nothing", async () => {
    const organizationId = await seedOrganization();
    const wrong = await recordFor(organizationId, new Types.ObjectId(), "2026-11-15", "2026-11-15T18:00:00Z");

    const report = await backfillAttendanceDates({ apply: true, organizationId });

    expect(report).toMatchObject({ toMove: 1, moved: 1 });
    expect((await AttendanceRecordModel.findById(wrong._id).lean())?.date.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    const audits = await AuditLogModel.find({ resourceId: wrong._id, action: "attendance.date_corrected" }).lean();
    expect(audits).toHaveLength(1);
    expect(audits[0].before).toMatchObject({ date: "2026-11-15" });
    expect(audits[0].after).toMatchObject({ date: "2026-11-16" });

    const again = await backfillAttendanceDates({ apply: true, organizationId });
    expect(again).toMatchObject({ scanned: 1, alreadyCorrect: 1, toMove: 0, moved: 0 });
  });

  it("reports a collision with an existing record on the target day and touches neither", async () => {
    const organizationId = await seedOrganization();
    const employee = new Types.ObjectId();
    const wrong = await recordFor(organizationId, employee, "2026-11-15", "2026-11-15T18:00:00Z");
    const existing = await recordFor(organizationId, employee, "2026-11-16", "2026-11-16T01:00:00Z");

    const report = await backfillAttendanceDates({ apply: true, organizationId });

    expect(report).toMatchObject({ toMove: 1, moved: 0 });
    expect(report.collisions).toEqual([
      { recordId: wrong._id.toString(), employeeId: employee.toString(), from: "2026-11-15", to: "2026-11-16", existingRecordId: existing._id.toString() },
    ]);
    expect((await AttendanceRecordModel.findById(wrong._id).lean())?.date.toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(await AttendanceRecordModel.countDocuments({ organizationId })).toBe(2);
  });

  it("moves a run of consecutive early-morning clock-ins (night worker) without false collisions", async () => {
    const organizationId = await seedOrganization();
    const employee = new Types.ObjectId();
    // 01:00 Manila every day: each record sits one day early, on the day the previous one belongs to.
    const a = await recordFor(organizationId, employee, "2026-11-14", "2026-11-14T17:00:00Z");
    const b = await recordFor(organizationId, employee, "2026-11-15", "2026-11-15T17:00:00Z");
    const c = await recordFor(organizationId, employee, "2026-11-16", "2026-11-16T17:00:00Z");

    const dryRun = await backfillAttendanceDates({ apply: false, organizationId });
    expect(dryRun).toMatchObject({ toMove: 3, moved: 0, collisions: [] });

    const report = await backfillAttendanceDates({ apply: true, organizationId });

    expect(report).toMatchObject({ toMove: 3, moved: 3, collisions: [] });
    const dates = await Promise.all([a, b, c].map(async (r) => (await AttendanceRecordModel.findById(r._id).lean())?.date.toISOString().slice(0, 10)));
    expect(dates).toEqual(["2026-11-15", "2026-11-16", "2026-11-17"]);
  });

  it("leaves records without a check-in alone and counts them", async () => {
    const organizationId = await seedOrganization();
    await recordFor(organizationId, new Types.ObjectId(), "2026-11-15");

    const report = await backfillAttendanceDates({ apply: true, organizationId });

    expect(report).toMatchObject({ scanned: 1, withoutCheckIn: 1, toMove: 0, moved: 0 });
  });

  it("only touches the given organization", async () => {
    const organizationId = await seedOrganization();
    const otherOrganizationId = await seedOrganization();
    const other = await recordFor(otherOrganizationId, new Types.ObjectId(), "2026-11-15", "2026-11-15T18:00:00Z");

    await backfillAttendanceDates({ apply: true, organizationId });

    expect((await AttendanceRecordModel.findById(other._id).lean())?.date.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });
});
