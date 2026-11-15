import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, PayrollRecordModel, PayrollRunModel } from "@/server/db/models";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { employeeYears } from "@/domains/payroll/year-end-data";
import { createBonusRunSchema } from "@/shared/validation/payroll";
import { BusinessRuleError } from "@/shared/errors";
import { seedEmployee, seedPayrollOrganization } from "./fixtures";

const HR = { userId: new Types.ObjectId().toString() };
const recordOf = async (runId: unknown, employeeId: string) => PayrollRecordModel.findOne({ payrollRunId: runId, employeeId }).lean();

async function seedCrew() {
  const org = await seedPayrollOrganization();
  const { organizationId, projectId } = org;
  const angela = await seedEmployee(organizationId, "Angela", { compensation: { rateType: "monthly", rate: 30000 }, projectId });
  const carlos = await seedEmployee(organizationId, "Carlos", { compensation: { rateType: "daily", rate: 700 } });
  // Hired July 1: half a year of service.
  const nina = await seedEmployee(organizationId, "Nina", { hiredOn: "2026-07-01", compensation: { rateType: "monthly", rate: 20000 } });
  // Resigned before the pay date: not current staff, so not paid.
  const rita = await seedEmployee(organizationId, "Rita", { status: "resigned", compensation: { rateType: "monthly", rate: 20000 } });
  return { ...org, angela, carlos, nina, rita };
}

const base = (organizationId: string) => ({ organizationId, year: 2026, payDate: "2026-12-15", label: "Christmas bonus" });

async function release(runId: string, organizationId: string) {
  const run = await PayrollRunModel.findById(runId).lean();
  const exclusionReasons = (run?.exclusions ?? []).map((exclusion: { employeeId: Types.ObjectId }) => ({ employeeId: exclusion.employeeId.toString(), reason: "Test: not in this run" }));
  await PayrollRunService.act(runId, { organizationId, action: "submit", exclusionReasons }, HR);
  await PayrollRunService.act(runId, { organizationId, action: "approve" }, HR);
  return PayrollRunService.act(runId, { organizationId, action: "release", releasedOn: "2026-12-15" }, HR);
}

describe("Christmas bonus run", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("pays every current employee by the chosen basis, tax-free, and stores how each amount was worked out", async () => {
    const { organizationId, angela, carlos, rita } = await seedCrew();

    const run = await PayrollRunService.prepareBonus({ ...base(organizationId), basis: "months_of_pay", value: 0.5, prorate: false, minServiceMonths: 0 }, HR);

    expect(run).toMatchObject({ runType: "bonus", status: "draft", bonus: { label: "Christmas bonus", basis: "months_of_pay", value: 0.5 } });
    expect(run.payPeriodStart.toISOString().slice(0, 10)).toBe("2026-01-01");
    const a = (await recordOf(run._id, angela))!;
    expect(a.earnings).toEqual([{ code: "bonus", label: "Christmas bonus", amount: 15000, taxable: false }]);
    expect(a).toMatchObject({ grossPay: 15000, netPay: 15000, tax: 0, taxableIncome: 0, employeeContributions: 0 });
    expect(a.bonus).toMatchObject({ year: 2026, basis: "months_of_pay", value: 0.5, monthlyBasic: 30000, computed: 15000 });
    // Carlos, daily 700 × 261 ÷ 12 = 15,225 a month; half of it.
    expect((await recordOf(run._id, carlos))!.netPay).toBe(7612.5);
    expect(await recordOf(run._id, rita)).toBeNull();

    const audit = await AuditLogModel.findOne({ resourceId: run._id.toString(), action: "payroll-run.prepared" }).lean();
    expect(audit?.metadata).toMatchObject({ runType: "bonus", basis: "months_of_pay", value: 0.5 });
  });

  it("prorates by months served this year, and leaves out anyone short of the minimum service", async () => {
    const { organizationId, angela, nina } = await seedCrew();

    const prorated = await PayrollRunService.prepareBonus({ ...base(organizationId), basis: "fixed", value: 6000, prorate: true, minServiceMonths: 0 }, HR);
    expect((await recordOf(prorated._id, angela))!.netPay).toBe(6000);
    expect((await recordOf(prorated._id, nina))!).toMatchObject({ netPay: 3000, bonus: { prorated: true, monthsServed: 6 } });

    const strict = await PayrollRunService.prepareBonus({ ...base(organizationId), label: "Loyalty bonus", basis: "fixed", value: 6000, prorate: false, minServiceMonths: 12 }, HR);
    expect(await recordOf(strict._id, nina)).toBeNull();
    const exclusion = strict.exclusions.find((row: { employeeId: Types.ObjectId }) => row.employeeId.toString() === nina);
    expect(exclusion?.reason).toMatch(/5 months of service; this bonus needs 12/);
  });

  it("pays only one project's staff when a project is chosen", async () => {
    const { organizationId, projectId, angela, carlos } = await seedCrew();
    const run = await PayrollRunService.prepareBonus({ ...base(organizationId), projectId, basis: "fixed", value: 1000, prorate: false, minServiceMonths: 0 }, HR);
    expect(await recordOf(run._id, angela)).not.toBeNull();
    expect(await recordOf(run._id, carlos)).toBeNull();
  });

  it("lets HR change one person's amount or leave them out while it's a draft, and put it back", async () => {
    const { organizationId, angela, carlos } = await seedCrew();
    const run = await PayrollRunService.prepareBonus({ ...base(organizationId), basis: "fixed", value: 5000, prorate: false, minServiceMonths: 0 }, HR);
    const runId = run._id.toString();

    await PayrollRunService.setBonusAmount(runId, { organizationId, employeeId: angela, amount: 8000 }, HR);
    expect((await recordOf(runId, angela))!).toMatchObject({ netPay: 8000, bonus: { computed: 5000, overridden: true } });

    await PayrollRunService.setBonusAmount(runId, { organizationId, employeeId: carlos, amount: 0 }, HR);
    expect(await recordOf(runId, carlos)).toBeNull();
    const after = await PayrollRunModel.findById(runId).lean();
    expect(after!.exclusions.find((row: { employeeId: Types.ObjectId }) => row.employeeId.toString() === carlos)?.reason).toMatch(/Left out by HR/);
    // Angela 8,000 (set by HR) + Nina 5,000; Carlos left out.
    expect(after!.totals.grossPay).toBe(13000);

    await PayrollRunService.setBonusAmount(runId, { organizationId, employeeId: angela, amount: null }, HR);
    await PayrollRunService.setBonusAmount(runId, { organizationId, employeeId: carlos, amount: null }, HR);
    expect((await recordOf(runId, angela))!.netPay).toBe(5000);
    expect((await recordOf(runId, carlos))!.netPay).toBe(5000);

    const audit = await AuditLogModel.findOne({ resourceId: runId, action: "payroll-run.bonus-amount-set" }).lean();
    expect(audit?.metadata).toMatchObject({ employeeId: angela, amount: 8000 });
  });

  it("refuses amount changes once the run has left draft, or on another run type", async () => {
    const { organizationId, angela } = await seedCrew();
    const run = await PayrollRunService.prepareBonus({ ...base(organizationId), basis: "fixed", value: 5000, prorate: false, minServiceMonths: 0 }, HR);
    await release(run._id.toString(), organizationId);
    await expect(PayrollRunService.setBonusAmount(run._id.toString(), { organizationId, employeeId: angela, amount: 1 }, HR)).rejects.toThrow(BusinessRuleError);

    const regular = await PayrollRunService.prepare({ organizationId, payPeriodStart: "2026-11-01", payPeriodEnd: "2026-11-15", payDate: "2026-11-20" }, HR);
    await expect(PayrollRunService.setBonusAmount(regular._id.toString(), { organizationId, employeeId: angela, amount: 1 }, HR)).rejects.toThrow(BusinessRuleError);
  });

  it("allows a second bonus in the same year, warning on anyone who already got one", async () => {
    const { organizationId, angela } = await seedCrew();
    const first = await PayrollRunService.prepareBonus({ ...base(organizationId), label: "Mid-year bonus", payDate: "2026-06-15", basis: "fixed", value: 2000, prorate: false, minServiceMonths: 0 }, HR);
    await release(first._id.toString(), organizationId);

    const second = await PayrollRunService.prepareBonus({ ...base(organizationId), basis: "fixed", value: 5000, prorate: false, minServiceMonths: 0 }, HR);
    const record = (await recordOf(second._id, angela))!;
    expect(record.netPay).toBe(5000);
    expect(record.warnings).toEqual([expect.objectContaining({ code: "bonus_already_paid", blocking: false })]);
  });

  it("counts toward the year-end ₱90,000 benefits total once released", async () => {
    const { organizationId, angela } = await seedCrew();
    const run = await PayrollRunService.prepareBonus({ ...base(organizationId), basis: "fixed", value: 5000, prorate: false, minServiceMonths: 0 }, HR);
    await release(run._id.toString(), organizationId);

    const years = await employeeYears(new Types.ObjectId(organizationId), 2026, [new Types.ObjectId(angela)]);
    const lines = years.get(angela)?.lines ?? [];
    expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({ code: "bonus", amount: 5000, taxable: false })]));
  });

  it("holds up the year-end run while a bonus run is unfinished", async () => {
    const { organizationId } = await seedCrew();
    const run = await PayrollRunService.prepareBonus({ ...base(organizationId), basis: "fixed", value: 5000, prorate: false, minServiceMonths: 0 }, HR);
    await expect(PayrollRunService.prepareYearEnd({ organizationId, year: 2026, payDate: "2027-01-15" }, HR)).rejects.toThrow(run.runNumber);
  });
});

describe("bonus run input", () => {
  const input = { organizationId: "507f1f77bcf86cd799439011", year: 2026, payDate: "2026-12-15", basis: "fixed", value: 5000 };

  it("fills in a label and the defaults", () => {
    expect(createBonusRunSchema.parse(input)).toMatchObject({ label: "Christmas bonus", prorate: false, minServiceMonths: 0 });
  });

  it("refuses a zero amount, a percentage over 1,000, and a pay date before the year", () => {
    expect(createBonusRunSchema.safeParse({ ...input, value: 0 }).success).toBe(false);
    expect(createBonusRunSchema.safeParse({ ...input, basis: "percent_of_monthly", value: 1001 }).success).toBe(false);
    expect(createBonusRunSchema.safeParse({ ...input, payDate: "2025-12-15" }).success).toBe(false);
    expect(createBonusRunSchema.safeParse({ ...input, basis: "something" }).success).toBe(false);
  });
});

