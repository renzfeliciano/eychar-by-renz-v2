import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, FinalSettlementModel, PayrollRecordModel, PayrollRunModel } from "@/server/db/models";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { PriorEmploymentService } from "@/domains/payroll/prior-employment-service";
import { PH_STATUTORY_2025 } from "@/domains/payroll/templates/ph-statutory-2025";
import { PH_YEAR_END_2023 } from "@/domains/payroll/templates/ph-year-end-2023";
import { yearEndReportData, yearEndTable } from "@/domains/payroll/year-end-report";
import { BusinessRuleError, ConflictError } from "@/shared/errors";
import { dateKeysBetween, weekdayOf } from "@/lib/date-key";
import { markAttendance, seedEmployee, seedPayrollOrganization } from "./fixtures";

const HR = { userId: new Types.ObjectId().toString() };
const WORKDAYS = dateKeysBetween("2026-10-01", "2026-10-15").filter((date) => ![0, 6].includes(weekdayOf(date)));

async function release(runId: string, organizationId: string) {
  const run = await PayrollRunModel.findById(runId).lean();
  const exclusionReasons = (run?.exclusions ?? []).map((exclusion: { employeeId: Types.ObjectId }) => ({ employeeId: exclusion.employeeId.toString(), reason: "Test: not in this run" }));
  await PayrollRunService.act(runId, { organizationId, action: "submit", exclusionReasons }, HR);
  await PayrollRunService.act(runId, { organizationId, action: "approve" }, HR);
  return PayrollRunService.act(runId, { organizationId, action: "release", releasedOn: run!.payDate.toISOString().slice(0, 10) }, HR);
}

/** Oct 1–15 released for three employees; Carla separated with an approved final settlement. */
async function seedYear() {
  const org = await seedPayrollOrganization();
  const { organizationId } = org;
  const angela = await seedEmployee(organizationId, "Angela", { compensation: { rateType: "monthly", rate: 30000 } });
  const carlos = await seedEmployee(organizationId, "Carlos", { compensation: { rateType: "monthly", rate: 40000 } });
  const carla = await seedEmployee(organizationId, "Carla", { compensation: { rateType: "monthly", rate: 25000 } });
  for (const employeeId of [angela, carlos, carla]) for (const day of WORKDAYS) await markAttendance(organizationId, employeeId, day, "present");
  const october = await PayrollRunService.prepare({ organizationId, payPeriodStart: "2026-10-01", payPeriodEnd: "2026-10-15", payDate: "2026-10-20" }, HR);
  await release(october._id.toString(), organizationId);
  await FinalSettlementModel.create({ organizationId, clearanceCaseId: new Types.ObjectId(), employeeId: carla, status: "approved", inputs: { lastWorkingDay: "2026-10-31" } });
  return { ...org, angela, carlos, carla, october };
}

const addYearEndRules = (organizationId: string) =>
  PayrollRuleVersionService.create({ organizationId, ...PH_STATUTORY_2025, ...PH_YEAR_END_2023, name: "Philippines 2026 with year-end", effectiveFrom: "2026-12-01" }, {});

const recordOf = async (runId: unknown, employeeId: string) => PayrollRecordModel.findOne({ payrollRunId: runId, employeeId }).lean();

describe("year-end adjustment run (payroll plan Phase 4)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("needs year-end rule data and a finished year before it can be prepared", async () => {
    const { organizationId } = await seedYear();
    const input = { organizationId, year: 2026, payDate: "2026-12-28" };

    await expect(PayrollRunService.prepareYearEnd(input, HR)).rejects.toThrow(/no annual tax table or Form 2316 box map/);
    await addYearEndRules(organizationId);

    const draft = await PayrollRunService.prepare({ organizationId, payPeriodStart: "2026-10-16", payPeriodEnd: "2026-10-31", payDate: "2026-11-05" }, HR);
    await expect(PayrollRunService.prepareYearEnd(input, HR)).rejects.toThrow(/Approve or cancel 2026's remaining payroll first/);
    await PayrollRunService.act(draft._id.toString(), { organizationId, action: "cancel", reason: "Test" }, HR);

    await expect(PayrollRunService.prepareYearEnd(input, HR)).resolves.toMatchObject({ runType: "year_end_adjustment", status: "draft" });
    await expect(PayrollRunService.prepareYearEnd(input, HR)).rejects.toThrow(ConflictError);
  });

  it("refunds over-withholding, collects with a previous employer's pay, and leaves separated staff to final pay", async () => {
    const { organizationId, angela, carlos, carla, october } = await seedYear();
    await addYearEndRules(organizationId);
    // Carlos earned ₱400,000 at a previous employer this year, which withheld nothing.
    await PriorEmploymentService.create({ organizationId, employeeId: carlos, year: 2026, employerName: "Previous Co.", taxableCompensation: 400000, nonTaxableCompensation: 0, taxWithheld: 0, concurrent: false }, HR);

    const run = await PayrollRunService.prepareYearEnd({ organizationId, year: 2026, payDate: "2026-12-28" }, HR);
    const octoberAngela = (await recordOf(october._id, angela))!;
    const octoberCarlos = (await recordOf(october._id, carlos))!;

    // Angela: ₱13,775 taxable this year is under ₱250,000, so no tax is due and all of it comes back.
    const a = (await recordOf(run._id, angela))!;
    expect(octoberAngela.taxableIncome).toBe(13775);
    expect(a.yearEnd).toMatchObject({ year: 2026, presentTaxable: 13775, previousTaxable: 0, taxDue: 0, presentWithheld: octoberAngela.tax, difference: -octoberAngela.tax });
    expect(a.earnings).toEqual([{ code: "year_end_tax_refund", label: "Tax refund 2026 (year-end)", amount: octoberAngela.tax, taxable: false }]);
    expect(a).toMatchObject({ grossPay: octoberAngela.tax, tax: 0, netPay: octoberAngela.tax });
    const boxes = Object.fromEntries(a.yearEnd!.boxes.map((box: { box: string; amount: number }) => [box.box, box.amount]));
    expect(boxes).toMatchObject({ "36": octoberAngela.employeeContributions, "39": 13775 });

    // Carlos: ₱400,000 + this year's taxable, by the annual table, less both employers' withholding.
    const c = (await recordOf(run._id, carlos))!;
    const grossTaxable = 400000 + octoberCarlos.taxableIncome;
    const taxDue = Math.round((22500 + 0.2 * (grossTaxable - 400000)) * 100) / 100;
    const difference = Math.round((taxDue - octoberCarlos.tax) * 100) / 100;
    expect(difference).toBeGreaterThan(0);
    expect(c.yearEnd).toMatchObject({ grossTaxable, taxDue, previousWithheld: 0, difference });
    expect(c).toMatchObject({ earnings: [], tax: difference, totalDeductions: difference, netPay: -difference });
    expect(c.warnings.map((warning: { code: string }) => warning.code)).toEqual(["year_end_collect", "year_end_two_employers"]);

    // Carla: separated, annualized in her final pay.
    expect(await recordOf(run._id, carla)).toBeNull();
    expect(run.exclusions.map((exclusion: { employeeName: string; reason: string }) => exclusion.reason)).toEqual(["Annualized in the final settlement (approved, last day Oct 31, 2026)"]);

    // Exports: Annex F lists only Angela (Carlos had two employers; Carla isn't on the run); the 2316 data covers all three.
    const data = await yearEndReportData((await PayrollRunModel.findById(run._id).lean())!);
    const context = { organizationName: "Org", runNumber: run.runNumber, statusLabel: "Draft" };
    expect(yearEndTable("annex-f", data, context).rows.map((row) => row[3])).toEqual(["Angela"]);
    const form = yearEndTable("form-2316", data, context);
    expect(form.rows).toHaveLength(3);
    const taxDueColumn = form.headers.indexOf("24 Tax due");
    const adjustedColumn = form.headers.indexOf("25A Withheld, present (as adjusted)");
    const angelaRow = form.rows.find((row) => row[5] === "Angela")!;
    expect([angelaRow[taxDueColumn], angelaRow[adjustedColumn]]).toEqual([0, 0]);

    const audit = await AuditLogModel.findOne({ resourceId: run._id, action: "payroll-run.prepared" }).lean();
    expect(audit?.metadata).toMatchObject({ runType: "year_end_adjustment" });
  });

  it("freezes a year's previous-employer entries once its year-end run is approved", async () => {
    const { organizationId, carlos } = await seedYear();
    await addYearEndRules(organizationId);
    const entry = await PriorEmploymentService.create({ organizationId, employeeId: carlos, year: 2026, employerName: "Previous Co.", taxableCompensation: 1000, nonTaxableCompensation: 0, taxWithheld: 0, concurrent: false }, HR);
    const run = await PayrollRunService.prepareYearEnd({ organizationId, year: 2026, payDate: "2026-12-28" }, HR);
    await release(run._id.toString(), organizationId);

    await expect(PriorEmploymentService.remove(entry._id.toString(), organizationId, HR)).rejects.toThrow(BusinessRuleError);
    await expect(PriorEmploymentService.create({ organizationId, employeeId: carlos, year: 2026, employerName: "Another", taxableCompensation: 1, nonTaxableCompensation: 0, taxWithheld: 0, concurrent: false }, HR)).rejects.toThrow(/already approved/);
  });
});
