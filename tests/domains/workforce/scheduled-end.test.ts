import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, EmploymentModel, PayrollRecordModel } from "@/server/db/models";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { addDays, dateKeyToDate, dateToDateKey, localDateKey } from "@/lib/date-key";
import { seedEmployee, seedPayrollOrganization } from "../payroll/fixtures";

// Payroll plan Phase 5a slice 3 (owner, 2026-11-15): a resignation with notice. A last day after today is
// scheduled; the employee stays active until then, and the daily job ends the employment the day after.
const HR = { userId: new Types.ObjectId().toString() };

async function seedWithEmployment() {
  const org = await seedPayrollOrganization();
  const employeeId = await seedEmployee(org.organizationId, "Lia", { compensation: { rateType: "daily", rate: 1000 } });
  const employment = await EmploymentModel.findOne({ employeeId }).lean();
  return { ...org, employeeId, employmentId: employment!._id.toString() };
}

describe("scheduled end of employment", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("schedules a future last day without ending anything yet, and refuses a second schedule", async () => {
    const { organizationId, employeeId, employmentId } = await seedWithEmployment();
    const lastDay = addDays(localDateKey(), 10);
    await EmploymentService.terminate(employmentId, organizationId, { status: "resigned", effectiveTo: dateKeyToDate(lastDay), terminationReason: "30-day notice" }, HR);

    const stored = await EmploymentModel.findById(employmentId).lean();
    expect(stored).toMatchObject({ status: "active" });
    expect(stored?.effectiveTo).toBeUndefined();
    expect(stored?.scheduledEnd).toMatchObject({ status: "resigned", terminationReason: "30-day notice" });
    expect(dateToDateKey(stored!.scheduledEnd!.effectiveTo)).toBe(lastDay);
    expect(await AuditLogModel.exists({ resourceId: employmentId, action: "employment.end_scheduled" })).toBeTruthy();
    expect((await EmploymentService.getEndingState(employeeId, organizationId)).scheduledEnd).toEqual({ status: "resigned", lastDay, reason: "30-day notice" });

    await expect(EmploymentService.terminate(employmentId, organizationId, { status: "resigned", effectiveTo: dateKeyToDate(addDays(lastDay, 5)) }, HR)).rejects.toThrow(/already scheduled/);
  });

  it("is applied by the daily job the day after the last day, credited to whoever scheduled it, and only once", async () => {
    const { organizationId, employmentId } = await seedWithEmployment();
    const lastDay = addDays(localDateKey(), 3);
    await EmploymentService.terminate(employmentId, organizationId, { status: "resigned", effectiveTo: dateKeyToDate(lastDay) }, HR);

    expect(await EmploymentService.applyDueScheduledEnds({ organizationId, today: lastDay })).toBe(0);
    expect(await EmploymentService.applyDueScheduledEnds({ organizationId, today: addDays(lastDay, 1) })).toBe(1);
    expect(await EmploymentService.applyDueScheduledEnds({ organizationId, today: addDays(lastDay, 2) })).toBe(0);

    const stored = await EmploymentModel.findById(employmentId).lean();
    expect(stored).toMatchObject({ status: "resigned" });
    expect(dateToDateKey(stored!.effectiveTo!)).toBe(lastDay);
    expect(stored?.scheduledEnd).toBeUndefined();
    expect(stored?.endingHistory.map((entry: { action: string }) => entry.action)).toEqual(["end_scheduled", "ended"]);
    const audit = await AuditLogModel.findOne({ resourceId: employmentId, action: "employment.terminated" }).lean();
    expect(audit?.actorUserId?.toString()).toBe(HR.userId);
    expect(audit?.metadata).toMatchObject({ scheduled: true });
  });

  it("can be cancelled with a reason before it applies; ending now replaces it", async () => {
    const { organizationId, employeeId, employmentId } = await seedWithEmployment();
    const lastDay = addDays(localDateKey(), 7);
    await EmploymentService.terminate(employmentId, organizationId, { status: "resigned", effectiveTo: dateKeyToDate(lastDay) }, HR);
    await expect(EmploymentService.cancelScheduledEnd(employeeId, organizationId, { reason: " " }, HR)).rejects.toThrow(/why/);
    await EmploymentService.cancelScheduledEnd(employeeId, organizationId, { reason: "Resignation withdrawn" }, HR);
    expect((await EmploymentModel.findById(employmentId).lean())?.scheduledEnd).toBeUndefined();
    await expect(EmploymentService.cancelScheduledEnd(employeeId, organizationId, { reason: "Again" }, HR)).rejects.toThrow(/No end is scheduled/);

    await EmploymentService.terminate(employmentId, organizationId, { status: "resigned", effectiveTo: dateKeyToDate(lastDay) }, HR);
    await EmploymentService.terminate(employmentId, organizationId, { status: "resigned", effectiveTo: dateKeyToDate(localDateKey()) }, HR);
    const stored = await EmploymentModel.findById(employmentId).lean();
    expect(stored).toMatchObject({ status: "resigned" });
    expect(stored?.scheduledEnd).toBeUndefined();
  });

  it("stops payroll after the scheduled last day, even before the job applies it", async () => {
    const { organizationId, employeeId, employmentId } = await seedWithEmployment();
    // A future semi-monthly half-month, with the last working day on its 5th day.
    const start = addDays(localDateKey(), 30).slice(0, 8) + "01";
    const lastDay = addDays(start, 4);
    await EmploymentService.terminate(employmentId, organizationId, { status: "resigned", effectiveTo: dateKeyToDate(lastDay) }, HR);

    const run = await PayrollRunService.prepare({ organizationId, payPeriodStart: start, payPeriodEnd: addDays(start, 14), payDate: addDays(start, 19) }, HR);
    // Only the workdays up to the last day are eligible; a colleague with no scheduled end gets the whole period.
    const colleague = await seedEmployee(organizationId, "Max", { compensation: { rateType: "daily", rate: 1000 } });
    await PayrollRunService.act(run._id.toString(), { organizationId, action: "recompute" }, HR);
    const records = await PayrollRecordModel.find({ payrollRunId: run._id }).lean();
    const eligible = (id: string) => records.find((row) => row.employeeId.toString() === id)!.attendance!.eligibleDays as number;
    expect(eligible(employeeId)).toBeGreaterThan(0);
    expect(eligible(employeeId)).toBeLessThanOrEqual(5);
    expect(eligible(colleague)).toBeGreaterThan(eligible(employeeId));
  });
});
