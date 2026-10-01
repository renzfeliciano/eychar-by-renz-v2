import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import {
  AuditLogModel,
  EmployeeAssignmentModel,
  EmployeeModel,
  EmploymentModel,
  LeaveTypeModel,
  LeaveBalanceModel,
  PersonModel,
  PositionModel,
  TravelOrderModel,
  UserModel,
  DeletedRecordModel,
  DeletionBatchModel,
} from "@/server/db/models";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { DeletionService } from "@/domains/deletion/deletion-service";
import { AuthorizationError, BusinessRuleError, ValidationError } from "@/shared/errors";
import { seedPayrollOrganization, seedEmployee } from "../payroll/fixtures";

async function seed() {
  const { organizationId } = await seedPayrollOrganization();
  const owner = await UserModel.create({ username: `owner.${Date.now()}.${Math.random()}`, passwordHash: "x" });
  const hr = await UserModel.create({ username: `hr.${Date.now()}.${Math.random()}`, passwordHash: "x" });
  await SuperAdminService.ensure(organizationId, owner._id.toString());
  const ana = await seedEmployee(organizationId, "Ana");
  const ben = await seedEmployee(organizationId, "Ben");
  // Ben reports to Ana; both travel together.
  await EmployeeAssignmentModel.create({ organizationId, employeeId: ben, reportsToEmployeeId: ana, effectiveFrom: new Date("2026-01-01") });
  const trip = await TravelOrderModel.create({ organizationId, employeeIds: [ana, ben], startDate: new Date("2026-10-01"), endDate: new Date("2026-10-03") });
  const selfService = await UserModel.create({ username: `ana.${Date.now()}.${Math.random()}`, passwordHash: "x", employeeId: ana });
  return { organizationId, owner: owner._id.toString(), hr: hr._id.toString(), ana, ben, tripId: trip._id, selfServiceId: selfService._id };
}

describe("DeletionService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("previews everything an employee takes with them, with the name to type", async () => {
    const s = await seed();

    const preview = await DeletionService.preview("employee", s.ana, s.organizationId);

    expect(preview.label).toBe("Ana Santos");
    expect(preview.blockers).toEqual([]);
    expect(preview.summary).toEqual(
      expect.arrayContaining([
        { label: "Employee record", count: 1 },
        { label: "Employment history", count: 1 },
        { label: "Pay terms", count: 1 },
        { label: "Login accounts", count: 1 },
        { label: "Travel orders shared with others (removed from them)", count: 1 },
        { label: "People reporting to them (manager cleared)", count: 1 },
      ]),
    );
  });

  it("moves an employee and their records to the recycle bin, and restores them exactly", async () => {
    const s = await seed();

    const batch = await DeletionService.remove("employee", s.ana, s.organizationId, { confirm: "Ana Santos" }, { userId: s.owner });

    expect(await EmployeeModel.exists({ _id: s.ana })).toBeNull();
    expect(await EmploymentModel.countDocuments({ employeeId: s.ana })).toBe(0);
    expect(await UserModel.exists({ _id: s.selfServiceId })).toBeNull();
    expect((await TravelOrderModel.findById(s.tripId).lean())?.employeeIds.map(String)).toEqual([s.ben]);
    expect((await EmployeeAssignmentModel.findOne({ employeeId: s.ben }).lean())?.reportsToEmployeeId).toBeUndefined();
    expect(batch).toMatchObject({ entityType: "employee", label: "Ana Santos", status: "in_bin" });
    expect(await AuditLogModel.countDocuments({ action: "record.deleted", resourceId: s.ana })).toBe(1);

    await DeletionService.restore(batch._id.toString(), s.organizationId, { userId: s.owner });

    expect(await EmployeeModel.exists({ _id: s.ana })).toBeTruthy();
    expect(await PersonModel.countDocuments({ organizationId: s.organizationId, firstName: "Ana" })).toBe(1);
    expect(await UserModel.exists({ _id: s.selfServiceId })).toBeTruthy();
    expect((await TravelOrderModel.findById(s.tripId).lean())?.employeeIds.map(String).sort()).toEqual([s.ana, s.ben].sort());
    expect((await EmployeeAssignmentModel.findOne({ employeeId: s.ben }).lean())?.reportsToEmployeeId?.toString()).toBe(s.ana);
    expect((await DeletionBatchModel.findById(batch._id).lean())?.status).toBe("restored");
    expect(await DeletedRecordModel.countDocuments({ batchId: batch._id })).toBe(0);
  });

  it("is for the Super Administrator only, and needs the exact name typed", async () => {
    const s = await seed();

    await expect(DeletionService.remove("employee", s.ana, s.organizationId, { confirm: "Ana Santos" }, { userId: s.hr })).rejects.toThrow(AuthorizationError);
    await expect(DeletionService.remove("employee", s.ana, s.organizationId, { confirm: "ana" }, { userId: s.owner })).rejects.toThrow(ValidationError);
  });

  it("refuses to delete something still in use, and says where", async () => {
    const s = await seed();
    const position = await PositionModel.create({ organizationId: s.organizationId, title: "Engineer", code: `ENG-${Math.random()}` });
    await EmployeeAssignmentModel.create({ organizationId: s.organizationId, employeeId: s.ana, positionId: position._id, effectiveFrom: new Date("2026-01-01") });
    const leaveType = await LeaveTypeModel.create({ organizationId: s.organizationId, name: "Vacation", code: `VL-${Math.random()}` });
    await LeaveBalanceModel.create({ organizationId: s.organizationId, employeeId: s.ana, leaveTypeId: leaveType._id, year: 2026, entitledDays: 5 });

    const preview = await DeletionService.preview("position", position._id.toString(), s.organizationId);
    expect(preview.blockers).toEqual(["Used by 1 job assignment"]);
    await expect(DeletionService.remove("position", position._id.toString(), s.organizationId, { confirm: "Engineer" }, { userId: s.owner })).rejects.toThrow(BusinessRuleError);
    expect((await DeletionService.preview("leave-type", leaveType._id.toString(), s.organizationId)).blockers).toEqual(["Used by 1 leave balance"]);
  });

  it("protects the Super Administrator's own account", async () => {
    const s = await seed();
    expect((await DeletionService.preview("staff-account", s.owner, s.organizationId)).blockers).toContain("The Super Administrator's account can't be deleted");
  });

  it("purges batches past their 30 days for good, leaving the audit trail", async () => {
    const s = await seed();
    const batch = await DeletionService.remove("employee", s.ana, s.organizationId, { confirm: "Ana Santos" }, { userId: s.owner });
    await DeletionBatchModel.updateOne({ _id: batch._id }, { purgeAfter: new Date(Date.now() - 1000) });

    const purged = await DeletionService.purgeExpired(s.organizationId);

    expect(purged).toBe(1);
    expect(await DeletedRecordModel.countDocuments({ batchId: batch._id })).toBe(0);
    expect((await DeletionBatchModel.findById(batch._id).lean())?.status).toBe("purged");
    await expect(DeletionService.restore(batch._id.toString(), s.organizationId, { userId: s.owner })).rejects.toThrow(BusinessRuleError);
  });

  it("lists what's in the bin for the organization", async () => {
    const s = await seed();
    await DeletionService.remove("employee", s.ana, s.organizationId, { confirm: "Ana Santos" }, { userId: s.owner });

    const bin = await DeletionService.listBin(s.organizationId);

    expect(bin).toHaveLength(1);
    expect(bin[0]).toMatchObject({ label: "Ana Santos", entityType: "employee", recordCount: expect.any(Number) });
    expect(new Types.ObjectId(bin[0].deletedBy!.toString()).toString()).toBe(s.owner);
  });
});
