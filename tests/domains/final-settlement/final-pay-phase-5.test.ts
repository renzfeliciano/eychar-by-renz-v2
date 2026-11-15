import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import {
  AuditLogModel,
  ClearanceCaseModel,
  EmployeeDocumentModel,
  EmployeeModel,
  EmploymentModel,
  FinalSettlementModel,
  LeaveBalanceModel,
  LeaveTypeModel,
  PayrollRecordModel,
  PayrollRunModel,
  PersonModel,
  UserModel,
} from "@/server/db/models";
import { ClearanceDepartmentService } from "@/domains/catalog/clearance-department-service";
import { SeparationTypeService } from "@/domains/catalog/separation-type-service";
import { PaymentMethodService } from "@/domains/catalog/payment-method-service";
import { ClearanceChecklistService } from "@/domains/clearance/clearance-checklist-service";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { FinalSettlementService } from "@/domains/final-settlement/final-settlement-service";
import { computeSettlement } from "@/domains/final-settlement/settlement-calculator";
import { settlementHash } from "@/domains/final-settlement/settlement-hash";
import { runFinalPayChecks, severitiesOf, FINAL_PAY_CHECK_DEFAULTS } from "@/domains/final-settlement/final-pay-checks";
import { employmentStatusForSeparation } from "@/domains/final-settlement/separation-status";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { PH_STATUTORY_2025 } from "@/domains/payroll/templates/ph-statutory-2025";
import { PH_YEAR_END_2023 } from "@/domains/payroll/templates/ph-year-end-2023";
import { AuthorizationError, BusinessRuleError } from "@/shared/errors";
import { dateKeyToDate, dateKeysBetween, weekdayOf } from "@/lib/date-key";
import { markAttendance, seedEmployee, seedPayrollOrganization } from "../payroll/fixtures";

describe("final pay: the Gate D worked example (payroll plan Phase 5)", () => {
  it("Carla, resigned Oct 21: salary balance, leave, 13th month, contributions, tax refund and the charger → ₱28,663.85", () => {
    const result = computeSettlement({
      lastWorkingDay: "2026-10-21",
      lastPaidThrough: "2026-10-15",
      rateType: "monthly",
      rate: 25000,
      workDaysPerYear: 261,
      workWeekDays: [1, 2, 3, 4, 5],
      basicEarnedThisYear: 237500,
      thirteenthMonthPaidThisYear: 0,
      thirteenthMonthDivisor: 12,
      convertibleLeave: [{ leaveTypeName: "Vacation Leave", days: 3 }],
      accountabilities: [{ itemId: "charger", label: "Laptop charger", amount: 1500 }],
      manualLines: [],
      deMinimisLeaveDays: 10,
      statutory: {
        contributions: [
          { code: "SSS", name: "SSS", employee: 625, employer: 1250, extra: 15, basis: "" },
          { code: "PHIC", name: "PhilHealth", employee: 312.5, employer: 312.5, extra: 0, basis: "" },
          { code: "HDMF", name: "Pag-IBIG", employee: 100, employer: 100, extra: 0, basis: "" },
        ],
        taxDifference: -2980.53,
        taxBasis: "Tax due 0 on 221,347.72, less 2,980.53 withheld",
      },
    });

    expect(result.dailyRate).toBe(1149.43);
    const amount = (code: string) => result.lines.filter((line) => line.code === code).map((line) => line.amount);
    expect(amount("salary_balance")).toEqual([4597.72]);
    expect(amount("leave_encashment")).toEqual([3448.29]);
    expect(result.lines.find((line) => line.code === "leave_encashment")?.taxable).toBe(false);
    expect(amount("thirteenth_month")).toEqual([20174.81]);
    expect(amount("tax_refund")).toEqual([2980.53]);
    expect(amount("contribution")).toEqual([625, 312.5, 100]);
    expect(amount("accountability")).toEqual([1500]);
    expect(result.totals.net).toBe(28663.85);
  });

  it("taxes leave days beyond the de minimis limit as a separate line", () => {
    const result = computeSettlement({
      lastWorkingDay: "2026-10-21",
      lastPaidThrough: "2026-10-21",
      rateType: "daily",
      rate: 1000,
      workDaysPerYear: 261,
      workWeekDays: [1, 2, 3, 4, 5],
      basicEarnedThisYear: 0,
      thirteenthMonthPaidThisYear: 0,
      convertibleLeave: [{ leaveTypeName: "Vacation Leave", days: 12 }],
      accountabilities: [],
      manualLines: [],
      deMinimisLeaveDays: 10,
    });
    expect(result.lines.map((line) => [line.label, line.amount, line.taxable])).toEqual([
      ["Leave encashment: Vacation Leave (non-taxable part)", 10000, false],
      ["Leave encashment: Vacation Leave (taxable part)", 2000, true],
    ]);
  });
});

describe("final pay checks and helpers", () => {
  const quiet = { net: 100, taxableLeaveDays: 0, thirteenthMonthPaid: 0, thirteenthMonthPending: [], recentPayChange: null, recentPayChangeDays: 60, missingGovernmentIds: [], taxDifference: 0, employmentProblem: null, unfinishedRegularRuns: [], inputsChanged: [] };

  it("fires each check at its default severity, and lets the policy change or switch one off", () => {
    expect(runFinalPayChecks(quiet, severitiesOf(null))).toEqual([]);
    const loud = { ...quiet, net: -1, thirteenthMonthPending: ["PR-2026-0009"], missingGovernmentIds: ["TIN"], employmentProblem: "Not ended", unfinishedRegularRuns: ["PR-2026-0010"] };
    expect(runFinalPayChecks(loud, severitiesOf(null)).map((check) => [check.code, check.severity])).toEqual([
      ["negative_net", "blocking"],
      ["thirteenth_month_pending", "blocking"],
      ["missing_government_ids", "warning"],
      ["employment_not_ended", "blocking"],
      ["unfinished_payroll", "blocking"],
    ]);
    const tuned = severitiesOf({ finalPayChecks: [{ code: "missing_government_ids", severity: "blocking" }, { code: "negative_net", severity: "off" }] });
    expect(runFinalPayChecks(loud, tuned).map((check) => [check.code, check.severity])).toContainEqual(["missing_government_ids", "blocking"]);
    expect(runFinalPayChecks(loud, tuned).some((check) => check.code === "negative_net")).toBe(false);
    expect(Object.keys(FINAL_PAY_CHECK_DEFAULTS)).toHaveLength(10);
  });

  it("maps seeded separation types to employment statuses, with the catalog item's own value winning", () => {
    expect(employmentStatusForSeparation({ code: "resignation" })).toBe("resigned");
    expect(employmentStatusForSeparation({ code: "termination" })).toBe("terminated");
    expect(employmentStatusForSeparation({ code: "retirement" })).toBeNull();
    expect(employmentStatusForSeparation({ code: "retirement", metadata: { employmentStatusCode: "retired" } })).toBe("retired");
    expect(employmentStatusForSeparation({ code: "resignation", metadata: { employmentStatusCode: null } })).toBeNull();
  });

  it("hashes the same content the same way, and any change differently", () => {
    const base = { version: 2, employeeId: new Types.ObjectId("64b000000000000000000001"), clearanceCaseId: "c1", lines: [{ code: "salary_balance", amount: 100.004 }], totals: { net: 100 }, inputs: { b: 1, a: 2, computedAt: new Date() }, manualLines: [] };
    const same = { ...base, inputs: { a: 2, b: 1, computedAt: new Date(0) } };
    expect(settlementHash(base)).toBe(settlementHash(same));
    expect(settlementHash(base)).not.toBe(settlementHash({ ...base, totals: { net: 101 } }));
  });
});

// ---- End to end -------------------------------------------------------------------------------------

const OCT_1_15 = dateKeysBetween("2026-10-01", "2026-10-15").filter((date) => ![0, 6].includes(weekdayOf(date)));

async function release(runId: string, organizationId: string) {
  const run = await PayrollRunModel.findById(runId).lean();
  const exclusionReasons = (run?.exclusions ?? []).map((exclusion: { employeeId: Types.ObjectId }) => ({ employeeId: exclusion.employeeId.toString(), reason: "Test" }));
  await PayrollRunService.act(runId, { organizationId, action: "submit", exclusionReasons }, {});
  await PayrollRunService.act(runId, { organizationId, action: "approve" }, {});
  return PayrollRunService.act(runId, { organizationId, action: "release", releasedOn: run!.payDate.toISOString().slice(0, 10) }, {});
}

/** Ana, ₱26,100/month (₱1,200/day), paid through Oct 15, resigns with Oct 21 as her last day; 5 VL days left. */
async function seed() {
  const { organizationId } = await seedPayrollOrganization();
  await PayrollRuleVersionService.create({ organizationId, ...PH_STATUTORY_2025, ...PH_YEAR_END_2023, name: "PH with year-end", effectiveFrom: "2026-06-01" }, {});
  const employeeId = await seedEmployee(organizationId, "Ana", { compensation: { rateType: "monthly", rate: 26_100 } });
  const employee = await EmployeeModel.findById(employeeId).lean();
  await PersonModel.updateOne({ _id: employee!.personId }, { $set: { sssNumber: "34-1234567-8", philHealthNumber: "12-345678901-2", pagIbigNumber: "1234-5678-9012", tinNumber: "123-456-789-000" } });
  for (const day of OCT_1_15) await markAttendance(organizationId, employeeId, day, "present");
  const october = await PayrollRunService.prepare({ organizationId, payPeriodStart: "2026-10-01", payPeriodEnd: "2026-10-15", payDate: "2026-10-20" }, {});
  await release(october._id.toString(), organizationId);

  await ClearanceDepartmentService.create({ organizationId, code: "it", name: "IT" }, {});
  await SeparationTypeService.create({ organizationId, code: "resignation", name: "Resignation" }, {});
  await PaymentMethodService.create({ organizationId, code: "bank_transfer", name: "Bank transfer" }, {});
  await ClearanceChecklistService.create({ organizationId, departmentCode: "it", title: "Return laptop", blocking: true, dueDaysAfterLastDay: 0 }, {});
  const vacation = await LeaveTypeModel.create({ organizationId, name: "Vacation Leave", code: "VL", convertibleAtSeparation: true });
  await LeaveBalanceModel.create({ organizationId, employeeId, leaveTypeId: vacation._id, year: 2026, entitledDays: 5 });
  const clearance = await ClearanceService.open({ organizationId, employeeId, separationTypeCode: "resignation", noticeDate: "2026-09-21", lastWorkingDay: "2026-10-21", noticeReference: "Letter" }, {});
  await ClearanceService.actOnItem(clearance._id.toString(), organizationId, clearance.items[0]._id.toString(), { action: "clear" }, {});
  await EmploymentModel.updateMany({ employeeId }, { $set: { status: "resigned", effectiveTo: dateKeyToDate("2026-10-21") } });

  const users = await Promise.all(["prep", "hr", "fin"].map((name) => UserModel.create({ username: `${name}.${Date.now()}.${Math.random()}`, passwordHash: "x" })));
  const [preparer, reviewer, approver] = users.map((user) => ({ userId: user._id.toString() }));
  const octoberRecord = (await PayrollRecordModel.findOne({ payrollRunId: october._id, employeeId }).lean())!;
  return { organizationId, employeeId, caseId: clearance._id.toString(), preparer, reviewer, approver, octoberRecord };
}

const warningsOf = (settlement: { checks: { code: string; severity: string }[] }) => settlement.checks.filter((check) => check.severity === "warning").map((check) => check.code);

describe("final pay end to end (payroll plan Phase 5)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("adds the month's contributions and the year's tax true-up from the payroll engine", async () => {
    const s = await seed();
    const settlement = await FinalSettlementService.prepare(s.caseId, s.organizationId, s.preparer);
    const line = (code: string) => settlement.lines.filter((entry) => entry.code === code).map((entry) => entry.amount);

    expect(line("salary_balance")).toEqual([4800]); // Oct 16, 19, 20, 21 × 1,200
    expect(line("leave_encashment")).toEqual([6000]); // 5 days, within the 10-day de minimis limit
    expect(line("thirteenth_month")).toEqual([1487.5]); // (13,050 + 4,800) ÷ 12
    // October's employee share is 2,152.50; Oct 1–15 deducted half.
    expect(s.octoberRecord.employeeContributions).toBe(1076.25);
    expect(line("contribution")).toEqual([650, 326.25, 100]);
    // Taxable for the year: 11,973.75 + 4,800 − 1,076.25 = 15,697.50, under ₱250,000, so October's withholding comes back.
    expect(s.octoberRecord.tax).toBe(233.56);
    expect(line("tax_refund")).toEqual([233.56]);
    expect(settlement.totals?.net).toBe(11444.81);
    expect(warningsOf(settlement)).toEqual(["tax_true_up"]);
  });

  it("enforces review and approval by others, confirmed warnings, and the approved hash; disbursal creates the final run", async () => {
    const s = await seed();
    const id = (await FinalSettlementService.prepare(s.caseId, s.organizationId, s.preparer))._id.toString();
    await FinalSettlementService.act(id, s.organizationId, { action: "submit" }, s.preparer);
    await expect(FinalSettlementService.act(id, s.organizationId, { action: "review" }, s.preparer)).rejects.toThrow(AuthorizationError);
    await FinalSettlementService.act(id, s.organizationId, { action: "review" }, s.reviewer);
    await expect(FinalSettlementService.act(id, s.organizationId, { action: "approve" }, s.approver)).rejects.toThrow(/Confirm you've checked each warning/);
    // The reviewer may approve (Gate D Q3: only the preparer is barred).
    const approved = (await FinalSettlementService.act(id, s.organizationId, { action: "approve", acknowledgedWarnings: ["tax_true_up"] }, s.reviewer))!;
    expect(approved.approval).toMatchObject({ version: 1, acknowledgedWarnings: ["tax_true_up"] });
    expect(approved.approval!.hash).toBe(settlementHash(approved));

    // Tampering with the approved figures outside the workflow is caught at disbursal.
    await FinalSettlementModel.updateOne({ _id: id }, { $set: { "totals.net": 99999 } });
    await expect(FinalSettlementService.act(id, s.organizationId, { action: "disburse", paymentMethodCode: "bank_transfer", paymentReference: "BDO-1" }, s.approver)).rejects.toThrow(/changed after it was approved/);
    expect(await AuditLogModel.countDocuments({ resourceId: id, action: "final-settlement.hash-mismatch" })).toBe(1);
    await FinalSettlementModel.updateOne({ _id: id }, { $set: { "totals.net": 11444.81 } });

    const paid = (await FinalSettlementService.act(id, s.organizationId, { action: "disburse", paymentMethodCode: "bank_transfer", paymentReference: "BDO-2" }, s.approver))!;
    expect(paid.status).toBe("disbursed");
    expect(await ClearanceCaseModel.findById(s.caseId).lean()).toMatchObject({ status: "closed" });

    const run = (await PayrollRunModel.findById(paid.payrollRunId).lean())!;
    expect(run).toMatchObject({ runType: "final", status: "released", paymentReference: "BDO-2" });
    expect([run.payPeriodStart.toISOString().slice(0, 10), run.payPeriodEnd.toISOString().slice(0, 10)]).toEqual(["2026-10-16", "2026-10-21"]);
    expect(run.employeeId!.toString()).toBe(s.employeeId);
    expect(run.finalSettlementId!.toString()).toBe(id);
    const record = (await PayrollRecordModel.findOne({ payrollRunId: run._id }).lean())!;
    expect(record.earnings.map((line: { code: string; amount: number; taxable: boolean }) => [line.code, line.amount, line.taxable])).toEqual([
      ["basic", 4800, true],
      ["leave_encashment", 6000, false],
      ["thirteenth_month", 1487.5, false],
      ["year_end_tax_refund", 233.56, false],
    ]);
    expect(record).toMatchObject({ employeeContributions: 1076.25, tax: 0, netPay: 11444.81 });
    expect(record.finalSettlement).toMatchObject({ version: 1, hash: approved.approval!.hash, lastWorkingDay: "2026-10-21" });

    // A regular run over the same days leaves her out: those days were paid in final pay.
    await EmploymentModel.updateMany({ employeeId: s.employeeId }, { $set: { status: "active" } }); // as if still on the books for the period
    const later = await PayrollRunService.prepare({ organizationId: s.organizationId, payPeriodStart: "2026-10-16", payPeriodEnd: "2026-10-31", payDate: "2026-11-05" }, {});
    expect(await PayrollRecordModel.findOne({ payrollRunId: later._id, employeeId: s.employeeId }).lean()).toBeNull();
    expect(later.exclusions.map((exclusion: { reason: string }) => exclusion.reason)).toContainEqual(expect.stringMatching(/^Paid in final pay \(PR-2026-\d+, to Oct 21, 2026\)$/));
  });

  it("blocks while the employment disagrees with the clearance or unfinished payroll covers the final days", async () => {
    const s = await seed();
    await EmploymentModel.updateMany({ employeeId: s.employeeId }, { $set: { status: "terminated" } });
    const id = (await FinalSettlementService.prepare(s.caseId, s.organizationId, s.preparer))._id.toString();
    await expect(FinalSettlementService.act(id, s.organizationId, { action: "submit" }, s.preparer)).rejects.toThrow(/clearance says Resignation, which ends employment as "resigned", but the employment is recorded as "terminated"/);

    await EmploymentModel.updateMany({ employeeId: s.employeeId }, { $set: { status: "active" } });
    const draft = await PayrollRunService.prepare({ organizationId: s.organizationId, payPeriodStart: "2026-10-16", payPeriodEnd: "2026-10-31", payDate: "2026-11-05" }, {});
    await EmploymentModel.updateMany({ employeeId: s.employeeId }, { $set: { status: "resigned" } });
    await expect(FinalSettlementService.act(id, s.organizationId, { action: "submit" }, s.preparer)).rejects.toThrow(new RegExp(`Payroll ${draft.runNumber} covers days in this settlement`));

    await PayrollRunService.act(draft._id.toString(), { organizationId: s.organizationId, action: "cancel", reason: "Test" }, {});
    await expect(FinalSettlementService.act(id, s.organizationId, { action: "submit" }, s.preparer)).resolves.toMatchObject({ status: "submitted" });
  });

  it("needs a document from the employee's file on a manual line, and a taxable choice on earnings", async () => {
    const s = await seed();
    const id = (await FinalSettlementService.prepare(s.caseId, s.organizationId, s.preparer))._id.toString();
    const someoneElse = await EmployeeDocumentModel.create({ organizationId: s.organizationId, employeeId: new Types.ObjectId(), title: "Other", documentType: "memo", fileName: "x.pdf", fileType: "application/pdf", fileSize: 1, fileData: "eA==" });
    await expect(
      FinalSettlementService.addManualLine(id, s.organizationId, { direction: "earning", label: "Bonus", amount: 1000, reason: "Memo", documentId: someoneElse._id.toString() }, s.preparer),
    ).rejects.toThrow(/Attach a supporting document/);

    const memo = await EmployeeDocumentModel.create({ organizationId: s.organizationId, employeeId: s.employeeId, title: "Bonus memo", documentType: "memo", fileName: "m.pdf", fileType: "application/pdf", fileSize: 1, fileData: "eA==" });
    const settlement = await FinalSettlementService.addManualLine(id, s.organizationId, { direction: "earning", label: "Gift", amount: 1000, reason: "Memo", taxable: false, documentId: memo._id.toString() }, s.preparer);
    expect(settlement.lines.find((line) => line.code === "manual")).toMatchObject({ amount: 1000, taxable: false });
    expect(settlement.manualLines[0].documentId!.toString()).toBe(memo._id.toString());
    await expect(FinalSettlementService.act(id, s.organizationId, { action: "submit" }, s.preparer)).resolves.toBeTruthy();
    await expect(FinalSettlementService.act(id, s.organizationId, { action: "approve" }, s.approver)).rejects.toThrow(BusinessRuleError);
  });
});
