import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, PayrollPolicyModel, PayrollRecordModel, PayrollScheduleModel } from "@/server/db/models";
import { MONTHLY_PAY_ACKNOWLEDGEMENT, isLastCutoffOfMonth, periodsPerMonth } from "@/domains/payroll/engine/pay-frequency";
import { nextPeriod, periodContaining, periodEndingOnOrBefore } from "@/domains/payroll/engine/pay-periods";
import { estimateRemainingBasic } from "@/domains/payroll/engine/thirteenth-month";
import { computeProgressiveBracketTax } from "@/domains/payroll/payroll-tax";
import { describeCutoffs } from "@/domains/payroll/payroll-labels";
import { PH_STATUTORY_2025 } from "@/domains/payroll/templates/ph-statutory-2025";
import { PH_YEAR_END_2023 } from "@/domains/payroll/templates/ph-year-end-2023";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { PayrollScheduleService } from "@/domains/payroll/payroll-schedule-service";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { monthlyPayRisks } from "@/domains/dashboard/compliance-risks";
import { createPayrollPolicySchema, createPayrollScheduleSchema } from "@/shared/validation/payroll";
import { seedEmployee, seedPayrollOrganization } from "./fixtures";

// Payroll plan Phase 6: pay frequency is HR's choice. Bi-weekly is new (14-day periods from an anchor date,
// annual tax table ÷ 26); monthly stays available but needs an acknowledgement of the Art. 103 risk.

const HR = { userId: new Types.ObjectId().toString() };
const BI_WEEKLY = { payFrequency: "bi-weekly" as const, cutoffDay: 5, payDateOffsetDays: 5, anchorDate: "2026-11-13" };

const policyInput = (organizationId: string, payFrequency: "monthly" | "bi-weekly" | "semi-monthly", extra: Record<string, unknown> = {}) => ({
  organizationId,
  name: `${payFrequency} pay`,
  payFrequency,
  workDaysPerYear: 261,
  hoursPerDay: 8,
  finalPayDeadlineDays: 30,
  workWeekDays: [1, 2, 3, 4, 5],
  deductLateAndUndertime: true,
  contributionTiming: "every_cutoff" as const,
  effectiveFrom: "2026-01-01",
  ...extra,
});

describe("bi-weekly pay periods", () => {
  it("are 14 days long, counted from the anchor in both directions", () => {
    expect(periodEndingOnOrBefore(BI_WEEKLY, "2026-11-20")).toEqual({ start: "2026-10-31", end: "2026-11-13", payDate: "2026-11-18" });
    expect(nextPeriod(BI_WEEKLY, periodEndingOnOrBefore(BI_WEEKLY, "2026-11-20"))).toEqual({ start: "2026-11-14", end: "2026-11-27", payDate: "2026-12-02" });
    expect(periodEndingOnOrBefore(BI_WEEKLY, "2026-11-01")).toEqual({ start: "2026-10-17", end: "2026-10-30", payDate: "2026-11-04" });
    expect(periodContaining(BI_WEEKLY, "2026-11-13")).toMatchObject({ start: "2026-10-31", end: "2026-11-13" });
    expect(periodContaining(BI_WEEKLY, "2026-11-14")).toMatchObject({ start: "2026-11-14", end: "2026-11-27" });
  });

  it("deduct monthly contributions on the month's last period, and average 26 ÷ 12 periods a month", () => {
    expect(isLastCutoffOfMonth("bi-weekly", "2026-11-13")).toBe(false);
    expect(isLastCutoffOfMonth("bi-weekly", "2026-11-27")).toBe(true);
    expect(periodsPerMonth("bi-weekly")).toBeCloseTo(26 / 12, 10);
    expect(describeCutoffs("bi-weekly", 5)).toBe("Every two weeks, ending Friday");
  });

  it("estimate the rest of the year's basic for the 13th month at 12 ÷ 26 of the salary per period", () => {
    const base = { rate: 26000, rateType: "monthly" as const, workDaysPerYear: 261, workWeekDays: [1, 2, 3, 4, 5], isEmployed: () => true };
    expect(estimateRemainingBasic({ ...base, payFrequency: "bi-weekly", from: "2026-12-01", to: "2026-12-28" })).toBe(24000);
  });
});

describe("the bi-weekly withholding table", () => {
  const biWeekly = PH_STATUTORY_2025.taxTables.find((table) => table.payFrequency === "bi-weekly")!.brackets;

  it("is the annual TRAIN table ÷ 26, so 26 periods of tax add up to the annual tax", () => {
    expect(biWeekly).toHaveLength(PH_YEAR_END_2023.annualTaxTable.length);
    for (const annualIncome of [200000, 330600, 600000, 1500000, 5000000, 9000000]) {
      const perPeriod = computeProgressiveBracketTax(Math.round((annualIncome / 26) * 100) / 100, biWeekly);
      expect(perPeriod * 26).toBeCloseTo(computeProgressiveBracketTax(annualIncome, PH_YEAR_END_2023.annualTaxTable), -1);
    }
  });
});

describe("choosing monthly pay", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("needs the acknowledgement ticked, in the form and in the service", async () => {
    const { organizationId } = await seedPayrollOrganization({ withPolicy: false });
    expect(createPayrollPolicySchema.safeParse(policyInput(organizationId, "monthly")).success).toBe(false);
    expect(createPayrollPolicySchema.safeParse(policyInput(organizationId, "monthly", { acknowledgeMonthlyPay: true })).success).toBe(true);
    expect(createPayrollPolicySchema.safeParse(policyInput(organizationId, "bi-weekly")).success).toBe(true);
    await expect(PayrollPolicyService.create(policyInput(organizationId, "monthly"), HR)).rejects.toThrow(/acknowledgement/);
  });

  it("stores who acknowledged it, when and the text they saw, and audits it", async () => {
    const { organizationId } = await seedPayrollOrganization({ withPolicy: false });
    const policy = await PayrollPolicyService.create(policyInput(organizationId, "monthly", { acknowledgeMonthlyPay: true }), HR);
    const stored = await PayrollPolicyModel.findById(policy._id).lean();
    expect(stored?.monthlyPayAcknowledgement).toMatchObject({ statement: MONTHLY_PAY_ACKNOWLEDGEMENT });
    expect(stored?.monthlyPayAcknowledgement?.by?.toString()).toBe(HR.userId);
    const audit = await AuditLogModel.findOne({ resourceId: policy._id, action: "payroll-policy.created" }).lean();
    expect(audit?.after).toMatchObject({ payFrequency: "monthly", monthlyPayAcknowledged: MONTHLY_PAY_ACKNOWLEDGEMENT });
  });

  it("lets HR acknowledge a monthly policy from before the acknowledgement existed, and only a monthly one", async () => {
    const { organizationId } = await seedPayrollOrganization({ withPolicy: false });
    const legacy = await PayrollPolicyModel.create({ organizationId, name: "Old monthly", payFrequency: "monthly", effectiveFrom: new Date("2025-01-01") });
    const semi = await PayrollPolicyService.create(policyInput(organizationId, "semi-monthly"), HR);

    await PayrollPolicyService.updateStatus(legacy._id.toString(), organizationId, { acknowledgeMonthlyPay: true }, HR);
    expect((await PayrollPolicyModel.findById(legacy._id).lean())?.monthlyPayAcknowledgement?.statement).toBe(MONTHLY_PAY_ACKNOWLEDGEMENT);
    await expect(PayrollPolicyService.updateStatus(semi._id.toString(), organizationId, { acknowledgeMonthlyPay: true }, HR)).rejects.toThrow(/Only a monthly policy/);
  });

  it("puts an unacknowledged monthly policy on the dashboard until it is acknowledged", () => {
    const rows = monthlyPayRisks([
      { id: "a", name: "Old monthly", payFrequency: "monthly", status: "active", acknowledged: false },
      { id: "b", name: "Chosen monthly", payFrequency: "monthly", status: "active", acknowledged: true },
      { id: "c", name: "Retired monthly", payFrequency: "monthly", status: "inactive", acknowledged: false },
      { id: "d", name: "Semi-monthly", payFrequency: "semi-monthly", status: "active", acknowledged: false },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["monthly-pay-a"]);
    expect(rows[0]).toMatchObject({ kind: "monthly-pay", href: "/payroll/policies" });
  });
});

describe("payroll schedules (Phase 6)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  const scheduleInput = (organizationId: string, extra: Record<string, unknown>) => ({ organizationId, name: "Crew", cutoffDay: 15, payDateOffsetDays: 5, autoPrepare: false, startsOn: "2026-11-01", ...extra });

  it("need an anchor date for bi-weekly, and take the cutoff weekday from it", async () => {
    const { organizationId } = await seedPayrollOrganization({ withPolicy: false });
    expect(createPayrollScheduleSchema.safeParse(scheduleInput(organizationId, { payFrequency: "bi-weekly", cutoffDay: 5 })).success).toBe(false);
    const schedule = await PayrollScheduleService.create(createPayrollScheduleSchema.parse(scheduleInput(organizationId, { payFrequency: "bi-weekly", cutoffDay: 0, anchorDate: "2026-11-13" })), HR);
    expect(schedule.cutoffDay).toBe(5);
    const [listed] = await PayrollScheduleService.list(organizationId, "2026-11-20");
    expect(listed.currentPeriod).toMatchObject({ start: "2026-11-14", end: "2026-11-27" });
  });

  it("need the acknowledgement for monthly, and keep an existing monthly schedule working until its frequency is saved again", async () => {
    const { organizationId } = await seedPayrollOrganization({ withPolicy: false });
    await expect(PayrollScheduleService.create({ ...scheduleInput(organizationId, { payFrequency: "monthly", cutoffDay: 31 }), payFrequency: "monthly" }, HR)).rejects.toThrow(/acknowledgement/);
    const legacy = await PayrollScheduleModel.create({ organizationId, name: "Old", payFrequency: "monthly", cutoffDay: 31, startsOn: new Date("2026-01-01") });
    await PayrollScheduleService.update(legacy._id.toString(), { organizationId, name: "Old (renamed)" }, HR);
    await expect(PayrollScheduleService.update(legacy._id.toString(), { organizationId, payFrequency: "monthly", cutoffDay: 31 }, HR)).rejects.toThrow(/acknowledgement/);
    await PayrollScheduleService.update(legacy._id.toString(), { organizationId, payFrequency: "monthly", cutoffDay: 31, acknowledgeMonthlyPay: true }, HR);
    expect((await PayrollScheduleModel.findById(legacy._id).lean())?.monthlyPayAcknowledgement?.statement).toBe(MONTHLY_PAY_ACKNOWLEDGEMENT);
  });
});

describe("a bi-weekly run", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("pays 12 ÷ 26 of a monthly salary and withholds tax from the bi-weekly table", async () => {
    const { organizationId } = await seedPayrollOrganization({ withPolicy: false });
    await PayrollPolicyService.create(policyInput(organizationId, "bi-weekly"), HR);
    await seedEmployee(organizationId, "Bea", { compensation: { rateType: "monthly", rate: 30000 } });

    const run = await PayrollRunService.prepare({ organizationId, payPeriodStart: "2026-11-14", payPeriodEnd: "2026-11-27", payDate: "2026-12-02" }, HR);
    expect(run).toMatchObject({ payFrequency: "bi-weekly" });
    const [record] = await PayrollRecordModel.find({ payrollRunId: run._id }).lean();
    expect(record.grossPay).toBeCloseTo(13846.15, 2);
    // Contributions on ₱30,000 a month (₱2,450) split over 26 ÷ 12 periods; tax on the rest from the bi-weekly table.
    expect(record.employeeContributions).toBeCloseTo(1130.77, 1);
    expect(record.tax).toBeCloseTo(465, 0);
  });

  it("stops with a clear message when the rule version has no bi-weekly table", async () => {
    const { organizationId } = await seedPayrollOrganization({ withPolicy: false, withRules: false });
    await PayrollPolicyService.create(policyInput(organizationId, "bi-weekly"), HR);
    const taxTables = PH_STATUTORY_2025.taxTables.filter((table) => table.payFrequency !== "bi-weekly");
    await PayrollRuleVersionService.create({ organizationId, ...PH_STATUTORY_2025, taxTables, effectiveFrom: "2026-01-01" }, {});
    await seedEmployee(organizationId, "Cy");

    await expect(PayrollRunService.prepare({ organizationId, payPeriodStart: "2026-11-14", payPeriodEnd: "2026-11-27", payDate: "2026-12-02" }, HR)).rejects.toThrow(
      /has no bi-weekly withholding tax table\. Publish a new rule version/,
    );
  });
});

describe("schedule and policy frequencies (gaps B28)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("won't prepare a scheduled run when the schedule's frequency differs from the policy's, and records why", async () => {
    const { organizationId } = await seedPayrollOrganization(); // a semi-monthly policy
    await seedEmployee(organizationId, "Dee");
    const schedule = await PayrollScheduleService.create(
      createPayrollScheduleSchema.parse({ organizationId, name: "Crew bi-weekly", payFrequency: "bi-weekly", cutoffDay: 5, anchorDate: "2026-11-13", payDateOffsetDays: 5, autoPrepare: true, startsOn: "2026-11-01" }),
      HR,
    );

    const [listed] = await PayrollScheduleService.list(organizationId, "2026-11-20");
    expect(listed.policy).toMatchObject({ name: "Standard", payFrequency: "semi-monthly" });

    const outcomes = await PayrollScheduleService.prepareDue({ organizationId, today: "2026-11-14" });
    expect(outcomes).toEqual([expect.objectContaining({ outcome: "failed", error: expect.stringMatching(/"Crew bi-weekly" is bi-weekly, but the payroll policy "Standard" pays semi-monthly/) })]);
    expect((await PayrollScheduleModel.findById(schedule._id).lean())?.lastError).toMatch(/so they match/);
  });

  it("lists an unacknowledged monthly schedule on the dashboard, next to policies", () => {
    const rows = monthlyPayRisks(
      [],
      [
        { id: "s1", name: "Office monthly", payFrequency: "monthly", status: "active", acknowledged: false },
        { id: "s2", name: "Acknowledged", payFrequency: "monthly", status: "active", acknowledged: true },
      ],
    );
    expect(rows).toEqual([expect.objectContaining({ id: "monthly-schedule-s1", kind: "monthly-pay", href: "/payroll/schedules" })]);
  });
});
