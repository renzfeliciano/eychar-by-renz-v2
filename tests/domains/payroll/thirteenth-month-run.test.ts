import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, FinalSettlementModel, PayrollAdjustmentModel, PayrollRecordModel, PayrollRunModel } from "@/server/db/models";
import { thirteenthMonthPaid } from "@/domains/payroll/thirteenth-month-ledger";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { BusinessRuleError, ConflictError } from "@/shared/errors";
import { dateKeysBetween, weekdayOf } from "@/lib/date-key";
import { markAttendance, seedEmployee, seedPayrollOrganization } from "./fixtures";
import { SeparationTypeService } from "@/domains/catalog/separation-type-service";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { FinalSettlementService } from "@/domains/final-settlement/final-settlement-service";

const HR = { userId: new Types.ObjectId().toString() };
const OCT_1_15 = { payPeriodStart: "2026-10-01", payPeriodEnd: "2026-10-15", payDate: "2026-10-20" };
const WORKDAYS = dateKeysBetween("2026-10-01", "2026-10-15").filter((date) => ![0, 6].includes(weekdayOf(date)));

async function release(runId: string, organizationId: string) {
  const run = await PayrollRunModel.findById(runId).lean();
  const exclusionReasons = (run?.exclusions ?? []).map((exclusion: { employeeId: Types.ObjectId }) => ({ employeeId: exclusion.employeeId.toString(), reason: "Test: not in this run" }));
  await PayrollRunService.act(runId, { organizationId, action: "submit", exclusionReasons }, HR);
  await PayrollRunService.act(runId, { organizationId, action: "approve" }, HR);
  return PayrollRunService.act(runId, { organizationId, action: "release", releasedOn: run!.payDate.toISOString().slice(0, 10) }, HR);
}

/** A semi-monthly organization with Oct 1–15 released; the rest of the year is not in any approved run. */
async function seedYear() {
  const org = await seedPayrollOrganization();
  const { organizationId } = org;
  const angela = await seedEmployee(organizationId, "Angela", { compensation: { rateType: "monthly", rate: 30000 } });
  const carlos = await seedEmployee(organizationId, "Carlos", { compensation: { rateType: "daily", rate: 700 } });
  const carla = await seedEmployee(organizationId, "Carla", { compensation: { rateType: "monthly", rate: 25000 } });
  for (const employeeId of [angela, carlos, carla]) for (const day of WORKDAYS) await markAttendance(organizationId, employeeId, day, "present");

  const october = await PayrollRunService.prepare({ organizationId, ...OCT_1_15 }, HR);
  // 1,000 of Angela's 13th month was advanced in October.
  await PayrollRunService.addAdjustment(october._id.toString(), { organizationId, employeeId: angela, category: "thirteenth_month", label: "13th month advance", direction: "earning", amount: 1000, taxable: false }, HR);
  await release(october._id.toString(), organizationId);

  // Carla separated; her final settlement (approved) already carries her 13th month.
  await FinalSettlementModel.create({ organizationId, clearanceCaseId: new Types.ObjectId(), employeeId: carla, status: "approved", inputs: { lastWorkingDay: "2026-10-31" } });
  return { ...org, angela, carlos, carla };
}

const recordOf = async (runId: unknown, employeeId: string) => PayrollRecordModel.findOne({ payrollRunId: runId, employeeId }).lean();

describe("13th-month run (payroll plan Phase 3)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("pays basic earned ÷ 12 plus the December estimate, less what was advanced, and stores how", async () => {
    const { organizationId, angela, carlos, carla } = await seedYear();

    const run = await PayrollRunService.prepareThirteenthMonth({ organizationId, year: 2026, payDate: "2026-12-20" }, HR);

    expect(run).toMatchObject({ runType: "thirteenth_month", status: "draft" });
    expect(run.payPeriodStart.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(run.payPeriodEnd.toISOString().slice(0, 10)).toBe("2026-12-31");

    // Angela: 15,000 earned (Oct 1–15) + 75,000 estimated (five unpaid half-months) = 90,000 ÷ 12 = 7,500, less the 1,000 advance.
    const a = (await recordOf(run._id, angela))!;
    expect(a.earnings).toEqual([{ code: "thirteenth_month", label: "13th month pay (2026)", amount: 6500, taxable: false }]);
    expect(a).toMatchObject({ grossPay: 6500, netPay: 6500, tax: 0, employeeContributions: 0, contributions: [], deductions: [] });
    expect(a.thirteenthMonth).toMatchObject({ year: 2026, basicEarned: 15000, estimatedBasic: 75000, estimatedFrom: "2026-10-16", divisor: 12, alreadyPaid: 1000, monthsWithPay: 1 });
    expect(a.warnings.map((warning: { code: string }) => warning.code)).toEqual(["thirteenth_month_estimate"]);

    // Carlos (daily 700): 11 days paid + 55 scheduled workdays Oct 16–Dec 31 = 66 × 700 = 46,200 ÷ 12 = 3,850.
    expect((await recordOf(run._id, carlos))!.netPay).toBe(3850);

    // Carla: left to her final settlement.
    expect(await recordOf(run._id, carla)).toBeNull();
    expect(run.exclusions.map((exclusion: { employeeName: string; reason: string }) => [exclusion.employeeName, exclusion.reason])).toEqual([
      ["Carla Santos", "13th month is part of the final settlement (approved, last day Oct 31, 2026)"],
    ]);
    expect(run.totals).toMatchObject({ employees: 2, netPay: 10350, tax: 0 });

    const audit = await AuditLogModel.findOne({ resourceId: run._id, action: "payroll-run.prepared" }).lean();
    expect(audit?.metadata).toMatchObject({ runType: "thirteenth_month" });
  });

  it("allows one per year, notes a pay date after Dec 24, takes no adjustments, and goes through approval", async () => {
    const { organizationId, angela } = await seedYear();

    const late = await PayrollRunService.prepareThirteenthMonth({ organizationId, year: 2026, payDate: "2026-12-28" }, HR);
    expect(late.history[0].note).toMatch(/after the Dec 24, 2026 deadline/);

    await expect(PayrollRunService.prepareThirteenthMonth({ organizationId, year: 2026, payDate: "2026-12-20" }, HR)).rejects.toThrow(ConflictError);
    await expect(
      PayrollRunService.addAdjustment(late._id.toString(), { organizationId, employeeId: angela, category: "cash_advance", label: "Cash advance", direction: "deduction", amount: 100, taxable: false }, HR),
    ).rejects.toThrow(BusinessRuleError);

    const released = await release(late._id.toString(), organizationId);
    expect(released.status).toBe("released");
    expect((await recordOf(late._id, angela))!.netPay).toBe(6500);

    // A cancelled 13th-month run frees the year again.
    const other = await seedPayrollOrganization();
    const draft = await PayrollRunService.prepareThirteenthMonth({ organizationId: other.organizationId, year: 2026, payDate: "2026-12-20" }, HR);
    await PayrollRunService.act(draft._id.toString(), { organizationId: other.organizationId, action: "cancel", reason: "Wrong pay date" }, HR);
    await expect(PayrollRunService.prepareThirteenthMonth({ organizationId: other.organizationId, year: 2026, payDate: "2026-12-21" }, HR)).resolves.toBeTruthy();
  });

  it("counts a released 13th-month run as paid when the employee's final settlement is prepared later", async () => {
    const { organizationId, angela } = await seedYear();
    const run = await PayrollRunService.prepareThirteenthMonth({ organizationId, year: 2026, payDate: "2026-12-20" }, HR);
    await release(run._id.toString(), organizationId);
    const paid = (await recordOf(run._id, angela))!.netPay;

    await SeparationTypeService.create({ organizationId, code: "resignation", name: "Resignation" }, {});
    const clearance = await ClearanceService.open({ organizationId, employeeId: angela, separationTypeCode: "resignation", noticeDate: "2026-12-01", lastWorkingDay: "2026-12-28", noticeReference: "Email" }, {});
    const settlement = await FinalSettlementService.prepare(clearance._id.toString(), organizationId, {});

    // The 1,000 October advance plus the 13th-month run's 6,500.
    expect(settlement.inputs).toMatchObject({ thirteenthMonthPaidThisYear: 1000 + paid });
  });

  it("trues up in January: refuses while the year has unapproved payroll, then adds the difference once", async () => {
    const { organizationId, angela, carlos, carla } = await seedYear();
    const thirteenth = await PayrollRunService.prepareThirteenthMonth({ organizationId, year: 2026, payDate: "2026-12-20" }, HR);
    await release(thirteenth._id.toString(), organizationId); // Angela 6,500, Carlos 3,850 (both partly estimated)

    // Oct 16–31 is the year's last payroll here: everyone works it all, including Carla, whose 13th month is in her
    // final settlement and who (in this test) stays employed.
    for (const day of dateKeysBetween("2026-10-16", "2026-10-31").filter((date) => ![0, 6].includes(weekdayOf(date)))) {
      await markAttendance(organizationId, angela, day, "present");
      await markAttendance(organizationId, carlos, day, "present");
      await markAttendance(organizationId, carla, day, "present");
    }
    const lateOctober = await PayrollRunService.prepare({ organizationId, payPeriodStart: "2026-10-16", payPeriodEnd: "2026-10-31", payDate: "2026-11-05" }, HR);
    const january = await PayrollRunService.prepare({ organizationId, payPeriodStart: "2027-01-01", payPeriodEnd: "2027-01-15", payDate: "2027-01-20" }, HR);
    const januaryId = january._id.toString();

    await expect(PayrollRunService.addThirteenthMonthTrueUp(januaryId, { organizationId, year: 2026 }, HR)).rejects.toThrow(/Approve or cancel 2026's remaining payroll first/);
    await release(lateOctober._id.toString(), organizationId);

    const result = await PayrollRunService.addThirteenthMonthTrueUp(januaryId, { organizationId, year: 2026 }, HR);
    expect(result).toMatchObject({ added: 2, underpaid: 0, overpaid: 2 });
    // Angela: 30,000 earned ÷ 12 = 2,500 owed; 7,500 paid (1,000 advance + 6,500) → 5,000 back.
    // Carlos: (11 + 11 days) × 700 = 15,400 ÷ 12 = 1,283.33 owed; 3,850 paid → 2,566.67 back. Carla: settled in final pay, skipped.
    const lines = await PayrollAdjustmentModel.find({ payrollRunId: january._id }).sort({ amount: -1 }).lean();
    expect(lines.map((line) => [line.employeeId.toString(), line.direction, line.amount, line.thirteenthMonthYear, line.taxable])).toEqual([
      [angela, "deduction", 5000, 2026, false],
      [carlos, "deduction", 2566.67, 2026, false],
    ]);
    expect((await recordOf(january._id, angela))!.deductions).toContainEqual({ code: "thirteenth_month", label: "13th month 2026 overpaid", amount: 5000 });

    // Again: nothing more.
    expect(await PayrollRunService.addThirteenthMonthTrueUp(januaryId, { organizationId, year: 2026 }, HR)).toMatchObject({ added: 0, alreadyAdded: 2 });
    // The January lines belong to 2026, never to 2027's 13th month, and count for 2026 only once their run is approved.
    const orgId = new Types.ObjectId(organizationId);
    expect((await thirteenthMonthPaid(orgId, 2027)).size).toBe(0);
    expect((await thirteenthMonthPaid(orgId, 2026)).get(angela)).toBe(7500);
  });

  it("doesn't block or change a regular run over the same dates", async () => {
    const { organizationId } = await seedYear();
    await PayrollRunService.prepareThirteenthMonth({ organizationId, year: 2026, payDate: "2026-12-20" }, HR);
    await expect(PayrollRunService.prepare({ organizationId, payPeriodStart: "2026-10-16", payPeriodEnd: "2026-10-31", payDate: "2026-11-05" }, HR)).resolves.toMatchObject({ runType: "regular" });
  });
});
