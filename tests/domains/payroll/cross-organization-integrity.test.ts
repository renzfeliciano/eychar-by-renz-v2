import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { CompensationModel, PayrollRecordModel, PayrollRuleVersionModel, PayrollPolicyModel, PayrollScheduleModel } from "@/server/db/models";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { PayrollScheduleService } from "@/domains/payroll/payroll-schedule-service";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { PH_STATUTORY_2025 } from "@/domains/payroll/templates/ph-statutory-2025";
import { NotFoundError } from "@/shared/errors";
import { dateKeyToDate } from "@/lib/date-key";
import { seedEmployee, seedPayrollOrganization } from "./fixtures";

const PERIOD = { payPeriodStart: "2026-10-01", payPeriodEnd: "2026-10-15", payDate: "2026-10-20" };
const HR = { userId: new Types.ObjectId().toString() };
const TERMS = { rateType: "monthly" as const, rate: 99999, allowances: [], minimumWageEarner: false };

describe("payroll records never cross organizations", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  describe("pay terms", () => {
    it("refuses to create pay terms for another organization's employee", async () => {
      const orgA = await seedPayrollOrganization();
      const orgB = await seedPayrollOrganization();
      const victim = await seedEmployee(orgA.organizationId, "Victim", { compensation: null });

      await expect(CompensationService.create({ organizationId: orgB.organizationId, employeeId: victim, ...TERMS, effectiveFrom: "2025-01-01" }, {})).rejects.toThrow(NotFoundError);
      expect(await CompensationModel.countDocuments({ employeeId: victim })).toBe(0);
    });

    it("refuses a malformed employee id as not found, not a server error", async () => {
      const { organizationId } = await seedPayrollOrganization();
      await expect(CompensationService.create({ organizationId, employeeId: "not-an-id", ...TERMS }, {})).rejects.toThrow(NotFoundError);
    });

    it("refuses to revise another organization's employee's terms", async () => {
      const orgA = await seedPayrollOrganization();
      const orgB = await seedPayrollOrganization();
      const victim = await seedEmployee(orgA.organizationId, "Victim");

      await expect(CompensationService.revise(victim, orgB.organizationId, { ...TERMS, effectiveFrom: "2026-10-01" }, {})).rejects.toThrow(NotFoundError);
      expect(await CompensationModel.countDocuments({ employeeId: victim })).toBe(1);
    });

    it("only reads terms stored under the organization asking", async () => {
      const orgA = await seedPayrollOrganization();
      const orgB = await seedPayrollOrganization();
      const employee = await seedEmployee(orgA.organizationId, "Angela");

      expect((await CompensationService.getAsOf(employee, orgA.organizationId, "2026-10-01"))?.rate).toBe(30000);
      expect(await CompensationService.getAsOf(employee, orgB.organizationId, "2026-10-01")).toBeNull();
      expect((await CompensationService.getAsOfForEmployees([employee], orgB.organizationId, "2026-10-01")).size).toBe(0);
    });
  });

  it("a payroll run ignores a pay-terms row planted under another organization", async () => {
    const orgA = await seedPayrollOrganization();
    const orgB = await seedPayrollOrganization();
    const employee = await seedEmployee(orgB.organizationId, "Bea", { compensation: null });
    // A row claiming org A but naming org B's employee (as the old unchecked create allowed).
    await CompensationModel.create({ organizationId: orgA.organizationId, employeeId: employee, ...TERMS, effectiveFrom: dateKeyToDate("2025-01-01") });

    const run = await PayrollRunService.prepare({ organizationId: orgB.organizationId, ...PERIOD }, HR);

    expect(await PayrollRecordModel.countDocuments({ payrollRunId: run._id })).toBe(0);
    expect(run.exclusions.map((exclusion: { employeeId: Types.ObjectId }) => exclusion.employeeId.toString())).toContain(employee);
  });

  it("refuses a payroll run, schedule, policy or rule version scoped to another organization's project", async () => {
    const orgA = await seedPayrollOrganization();
    const orgB = await seedPayrollOrganization();
    const foreignProject = orgA.projectId;

    await expect(PayrollRunService.prepare({ organizationId: orgB.organizationId, projectId: foreignProject, ...PERIOD }, HR)).rejects.toThrow(NotFoundError);
    await expect(
      PayrollScheduleService.create(
        { organizationId: orgB.organizationId, projectId: foreignProject, name: "Foreign", payFrequency: "semi-monthly", cutoffDay: 10, payDateOffsetDays: 5, autoPrepare: true, startsOn: "2026-09-01" },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
    await expect(
      PayrollPolicyService.create(
        {
          organizationId: orgB.organizationId,
          projectId: foreignProject,
          name: "Foreign",
          payFrequency: "semi-monthly",
          workDaysPerYear: 261,
          hoursPerDay: 8,
          finalPayDeadlineDays: 30,
          workWeekDays: [1, 2, 3, 4, 5],
          deductLateAndUndertime: true,
          contributionTiming: "every_cutoff",
          effectiveFrom: "2026-01-01",
        },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
    await expect(PayrollRuleVersionService.create({ organizationId: orgB.organizationId, projectId: foreignProject, ...PH_STATUTORY_2025 }, {})).rejects.toThrow(NotFoundError);

    expect(await PayrollScheduleModel.countDocuments({ projectId: foreignProject })).toBe(0);
    expect(await PayrollPolicyModel.countDocuments({ projectId: foreignProject })).toBe(0);
  });

  it("refuses to move a schedule onto another organization's project", async () => {
    const orgA = await seedPayrollOrganization();
    const orgB = await seedPayrollOrganization();
    const schedule = await PayrollScheduleService.create(
      { organizationId: orgB.organizationId, name: "Org-wide", payFrequency: "semi-monthly", cutoffDay: 10, payDateOffsetDays: 5, autoPrepare: true, startsOn: "2026-09-01" },
      {},
    );

    await expect(PayrollScheduleService.update(schedule._id.toString(), { organizationId: orgB.organizationId, projectId: orgA.projectId }, {})).rejects.toThrow(NotFoundError);
    expect((await PayrollScheduleModel.findById(schedule._id).lean())?.projectId).toBeUndefined();
  });

  it("refuses a rule version based on another organization's version", async () => {
    const orgA = await seedPayrollOrganization();
    const orgB = await seedPayrollOrganization();
    const foreign = await PayrollRuleVersionModel.findOne({ organizationId: orgA.organizationId }).lean();

    await expect(PayrollRuleVersionService.create({ organizationId: orgB.organizationId, ...PH_STATUTORY_2025, basedOnVersionId: foreign!._id.toString() }, {})).rejects.toThrow(NotFoundError);
  });
});
