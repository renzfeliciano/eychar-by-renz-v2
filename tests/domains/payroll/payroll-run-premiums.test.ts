import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { zonedInstant } from "@/lib/app-time";
import { connectMongoDB } from "@/server/db/connection";
import { AttendancePolicyModel, HolidayModel, PayrollRecordModel, PayrollRunModel } from "@/server/db/models";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { BusinessRuleError } from "@/shared/errors";
import { dateKeyToDate, dateKeysBetween, weekdayOf } from "@/lib/date-key";
import { seedEmployee, seedPayrollOrganization } from "./fixtures";

// Attendance plan Phase 5: a new regular run pays overtime, rest-day, holiday
// and night premiums from the stored attendance day results (GATE 3 rates).
// Oct 1-15, 2026; Oct 9 (Fri) is a regular holiday nobody works.
const PERIOD = { payPeriodStart: "2026-10-01", payPeriodEnd: "2026-10-15", payDate: "2026-10-20" };
const HOLIDAY = "2026-10-09";
const WORKDAYS = dateKeysBetween("2026-10-01", "2026-10-15").filter((date) => ![0, 6].includes(weekdayOf(date)) && date !== HOLIDAY);
const HR = { userId: new Types.ObjectId().toString() };
const at = (date: string, time: string) => zonedInstant(date, time);

async function seed() {
  const org = await seedPayrollOrganization();
  const { organizationId } = org;
  await AttendancePolicyModel.create({
    organizationId,
    name: "Office",
    standardStartTime: "08:00",
    standardEndTime: "17:00",
    gracePeriodMinutes: 0,
    breakMinutes: 60,
    workDays: [1, 2, 3, 4, 5],
    effectiveFrom: dateKeyToDate("2026-01-01"),
  });
  await HolidayModel.create({ organizationId, date: dateKeyToDate(HOLIDAY), name: "Regular holiday", type: "regular" });
  // ₱25,000 a month: daily ₱1,149.43, hourly ₱143.68 (the GATE 3 example).
  const monthly = await seedEmployee(organizationId, "Mara", { projectId: org.projectId, compensation: { rateType: "monthly", rate: 25000 } });
  const daily = await seedEmployee(organizationId, "Dino", { projectId: org.projectId, compensation: { rateType: "daily", rate: 695, minimumWageEarner: true } });

  for (const employeeId of [monthly, daily]) {
    for (const date of WORKDAYS) {
      await AttendanceService.record({ organizationId, employeeId, date: dateKeyToDate(date), checkInAt: at(date, "08:00"), checkOutAt: at(date, date === "2026-10-05" ? "19:00" : "17:00") }, HR);
    }
  }
  // Mara also works Saturday Oct 3 (a rest day), and her Oct 5 overtime is approved; Dino's isn't.
  await AttendanceService.record({ organizationId, employeeId: monthly, date: dateKeyToDate("2026-10-03"), checkInAt: at("2026-10-03", "08:00"), checkOutAt: at("2026-10-03", "17:00") }, HR);
  const { AttendanceRecordModel } = await import("@/server/db/models");
  const overtimeDay = await AttendanceRecordModel.findOne({ employeeId: monthly, date: dateKeyToDate("2026-10-05") }).lean<{ _id: Types.ObjectId }>();
  await AttendanceService.adjust(overtimeDay!._id.toString(), organizationId, { overtimeApproved: true }, HR);
  return { organizationId, monthly, daily };
}

const recordOf = (runId: string, employeeId: string) => PayrollRecordModel.findOne({ payrollRunId: runId, employeeId }).lean();
const codes = (warnings: { code: string }[]) => warnings.map((warning) => warning.code);

describe("payroll run premiums (attendance plan Phase 5)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("a new run computes the premiums from attendance and snapshots what it used", async () => {
    const { organizationId, monthly, daily } = await seed();
    const run = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);
    expect(run.computePremiums).toBe(true);

    const mara = (await recordOf(run._id.toString(), monthly))!;
    expect(mara.earnings).toEqual(
      expect.arrayContaining([
        { code: "overtime", label: "Overtime, ordinary day (2 h)", amount: 359.2, taxable: true },
        { code: "rest_day_pay", label: "Rest day pay (8 h)", amount: 1494.26, taxable: true },
      ]),
    );
    // The holiday is in basic for a monthly rate, and isn't missing attendance.
    expect(mara.earnings.some((line: { code: string }) => line.code === "holiday_pay")).toBe(false);
    expect(mara.attendance).toMatchObject({ missingDays: 0, absentDays: 0 });
    expect(codes(mara.warnings)).not.toContain("rest_day_work");
    expect(mara.premiumInputs).toMatchObject({ engineVersion: 1, unworkedRegularHolidaysPaid: 1 });
    expect(mara.premiumInputs?.rates).toMatchObject({ regularHolidayMultiplier: 2, overtimeMultiplier: 1.25 });
    expect(mara.premiumInputs?.days).toEqual(expect.arrayContaining([expect.objectContaining({ date: "2026-10-03", dayType: "rest_day", restDay: true, inBasic: false, regularMinutes: 480 })]));

    const dino = (await recordOf(run._id.toString(), daily))!;
    expect(dino.earnings).toContainEqual({ code: "holiday_pay", label: "Regular holiday pay, not worked (1 day)", amount: 695, taxable: true });
    expect(dino.earnings.some((line: { code: string }) => line.code === "overtime")).toBe(false);
    expect(codes(dino.warnings)).toContain("unapproved_overtime");
  });

  it("refuses a manual premium adjustment on a run that computes premiums", async () => {
    const { organizationId, monthly } = await seed();
    const run = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);
    await expect(
      PayrollRunService.addAdjustment(run._id.toString(), { organizationId, employeeId: monthly, category: "overtime", label: "Overtime", direction: "earning", amount: 500, taxable: true }, HR),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("a run made before premiums existed recomputes exactly as before", async () => {
    const { organizationId, monthly } = await seed();
    const run = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);
    await PayrollRunModel.collection.updateOne({ _id: run._id }, { $unset: { computePremiums: "" } });

    await PayrollRunService.act(run._id.toString(), { organizationId, action: "recompute" }, HR);

    const mara = (await recordOf(run._id.toString(), monthly))!;
    expect(mara.earnings.map((line: { code: string }) => line.code)).toEqual(["basic"]);
    expect(codes(mara.warnings)).toContain("rest_day_work");
    expect(mara.premiumInputs).toBeUndefined();
  });
});

// Plan Phase 7: history (§59) and reproducibility (§46).
describe("payroll premiums over time (attendance plan Phase 7)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  const strip = (record: { earnings: unknown; premiumInputs?: unknown; netPay: number } | null) => JSON.parse(JSON.stringify({ earnings: record?.earnings, premiumInputs: record?.premiumInputs, netPay: record?.netPay }));

  it("recomputing gives the same payslip, snapshot included", async () => {
    const { organizationId, monthly } = await seed();
    const run = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);
    const first = strip(await recordOf(run._id.toString(), monthly));

    await PayrollRunService.act(run._id.toString(), { organizationId, action: "recompute" }, HR);

    expect(strip(await recordOf(run._id.toString(), monthly))).toEqual(first);
  });

  it("a later payroll or attendance policy doesn't change a period computed under the earlier ones", async () => {
    const { organizationId, monthly } = await seed();
    const run = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);
    const before = strip(await recordOf(run._id.toString(), monthly));

    const { PayrollPolicyModel, AttendancePolicyModel: Policies } = await import("@/server/db/models");
    await PayrollPolicyModel.create({ organizationId, name: "Richer", payFrequency: "semi-monthly", restDayMultiplier: 2, overtimeMultiplier: 2, effectiveFrom: dateKeyToDate("2026-11-01") });
    await Policies.create({ organizationId, name: "Later", standardStartTime: "07:00", standardEndTime: "16:00", gracePeriodMinutes: 0, workDays: [1, 2, 3, 4, 5, 6], effectiveFrom: dateKeyToDate("2026-11-01") });
    const { DayResultService } = await import("@/domains/attendance/day-result");
    await DayResultService.recalculate({ organizationId, from: PERIOD.payPeriodStart, to: PERIOD.payPeriodEnd }, HR);
    await PayrollRunService.act(run._id.toString(), { organizationId, action: "recompute" }, HR);

    expect(strip(await recordOf(run._id.toString(), monthly))).toEqual(before);
  });
});
