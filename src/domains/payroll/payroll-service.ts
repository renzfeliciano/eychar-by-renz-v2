import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, AttendanceRecordModel, PayrollRunModel, PayrollRecordModel, PayrollAdjustmentModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { PayrollPolicyService } from "./payroll-policy-service";
import { PayrollRuleVersionService } from "./payroll-rule-version-service";
import { CompensationService } from "./compensation-service";
import { computeProgressiveBracketTax } from "./payroll-tax";
import type { GeneratePayrollRunInput } from "@/shared/validation/payroll";

async function countUnpaidAbsences(organizationId: string, employeeId: string, from: Date, to: Date) {
  // "on_leave" is already a distinct AttendanceRecord status from "absent"
  // (ADR-011) — only "absent" reduces pay, so no changes to Attendance or
  // Leave were needed to support this.
  return AttendanceRecordModel.countDocuments({
    organizationId: new Types.ObjectId(organizationId),
    employeeId: new Types.ObjectId(employeeId),
    date: { $gte: from, $lte: to },
    status: "absent",
  });
}

type ComputedRecord = {
  employeeId: Types.ObjectId;
  basicSalary: number;
  allowanceAmount: number;
  grossPay: number;
  taxDeduction: number;
  statutoryDeductions: { name: string; employeeAmount: number }[];
  adjustmentsTotal: number;
  netPay: number;
};

export const PayrollService = {
  /**
   * Every employee's record is computed fully in memory before anything is
   * persisted — if any one employee's inputs don't resolve, the whole call
   * throws before any write happens. Only once every record is ready does
   * generation create the PayrollRun row and insert the records; if that
   * insert fails, the just-created run is best-effort deleted and the
   * error rethrown. This bounds partial-failure risk without introducing
   * this codebase's first transaction (ADR-014 — same MVP restraint ADR-005
   * already applied to Employee Transfer).
   */
  async generateRun(input: GeneratePayrollRunInput, actor: { userId?: string }) {
    await connectMongoDB();

    const policyResult = await PayrollPolicyService.resolve({
      organizationId: input.organizationId,
      projectId: input.projectId,
      effectiveDate: input.payPeriodStart,
    });
    if (!policyResult) throw new NotFoundError("No payroll policy resolves for this organization/date");
    const policy = policyResult.policy;

    const ruleVersionResult = await PayrollRuleVersionService.resolve({
      organizationId: input.organizationId,
      projectId: input.projectId,
      effectiveDate: input.payPeriodStart,
    });
    if (!ruleVersionResult) throw new NotFoundError("No payroll rule version resolves for this organization/date");
    const ruleVersion = ruleVersionResult.policy;

    const employees = await EmployeeModel.find({ organizationId: new Types.ObjectId(input.organizationId) }).lean();

    // Employee-level project scoping mirrors AttendanceService.listForOrganization:
    // when a run is project-scoped, only employees currently assigned to
    // that project as of the pay period are included.
    const scopedEmployees = [];
    for (const employee of employees) {
      if (!input.projectId) {
        scopedEmployees.push(employee);
        continue;
      }
      const assignment = await EmployeeAssignmentService.getAsOf(employee._id.toString(), input.payPeriodStart);
      if (assignment?.projectId?.toString() === input.projectId) scopedEmployees.push(employee);
    }

    const computedRecords: ComputedRecord[] = [];
    for (const employee of scopedEmployees) {
      const employeeId = employee._id.toString();
      const compensation = await CompensationService.getAsOf(employeeId, input.payPeriodStart);
      if (!compensation) {
        throw new BusinessRuleError(`No compensation found for employee ${employeeId} as of the pay period start`);
      }

      const unpaidAbsences = await countUnpaidAbsences(input.organizationId, employeeId, input.payPeriodStart, input.payPeriodEnd);
      const paidDays = Math.max(0, policy.standardWorkDaysPerPeriod - unpaidAbsences);
      const basicSalary = compensation.baseSalary * (paidDays / policy.standardWorkDaysPerPeriod);

      const employeeAdjustments = input.adjustments.filter((adjustment) => adjustment.employeeId === employeeId);
      const additionsSum = employeeAdjustments
        .filter((adjustment) => adjustment.direction === "addition")
        .reduce((sum, adjustment) => sum + adjustment.amount, 0);
      const deductionsSum = employeeAdjustments
        .filter((adjustment) => adjustment.direction === "deduction")
        .reduce((sum, adjustment) => sum + adjustment.amount, 0);

      const grossPay = basicSalary + compensation.allowanceAmount + additionsSum;
      const taxDeduction = computeProgressiveBracketTax(grossPay, ruleVersion.taxBrackets);
      const statutoryDeductions: { name: string; employeeAmount: number }[] = ruleVersion.statutoryContributions.map(
        (contribution: { name: string; employeeRate: number; cap?: number | null }) => ({
          name: contribution.name,
          employeeAmount: Math.min(grossPay, contribution.cap ?? Infinity) * contribution.employeeRate,
        }),
      );
      const statutoryTotal = statutoryDeductions.reduce((sum: number, line: { employeeAmount: number }) => sum + line.employeeAmount, 0);

      computedRecords.push({
        employeeId: employee._id,
        basicSalary,
        allowanceAmount: compensation.allowanceAmount,
        grossPay,
        taxDeduction,
        statutoryDeductions,
        adjustmentsTotal: additionsSum - deductionsSum,
        netPay: grossPay - taxDeduction - statutoryTotal - deductionsSum,
      });
    }

    const run = await PayrollRunModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : undefined,
      payPeriodStart: input.payPeriodStart,
      payPeriodEnd: input.payPeriodEnd,
      policyId: policy._id,
      ruleVersionId: ruleVersion._id,
      generatedBy: actor.userId ? new Types.ObjectId(actor.userId) : undefined,
    });

    let records;
    try {
      records = await PayrollRecordModel.insertMany(
        computedRecords.map((record) => ({ ...record, payrollRunId: run._id, organizationId: run.organizationId })),
      );
      if (input.adjustments.length > 0) {
        await PayrollAdjustmentModel.insertMany(
          input.adjustments.map((adjustment) => ({
            payrollRunId: run._id,
            organizationId: run.organizationId,
            employeeId: new Types.ObjectId(adjustment.employeeId),
            category: adjustment.category,
            direction: adjustment.direction,
            amount: adjustment.amount,
            description: adjustment.description,
          })),
        );
      }
    } catch (error) {
      await PayrollRunModel.deleteOne({ _id: run._id });
      await PayrollRecordModel.deleteMany({ payrollRunId: run._id });
      await PayrollAdjustmentModel.deleteMany({ payrollRunId: run._id });
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-run.generated",
      resourceType: "PayrollRun",
      resourceId: run._id.toString(),
      after: { payPeriodStart: run.payPeriodStart, payPeriodEnd: run.payPeriodEnd, employeeCount: records.length },
    });

    return { run, records };
  },

  /** Gated by payroll.approve at the route — its own permission, not folded into a generic update key (same precedent as leave.approve, ADR-012). */
  async approve(runId: string, organizationId: string, actor: { userId?: string }) {
    await connectMongoDB();

    const run = await PayrollRunModel.findOne({
      _id: new Types.ObjectId(runId),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!run) throw new NotFoundError("Payroll run not found in this organization");
    if (run.status !== "completed") {
      throw new BusinessRuleError(`Only a completed run can be approved (current status: ${run.status})`);
    }

    const before = { status: run.status };
    run.status = "approved";
    run.approvedBy = actor.userId ? new Types.ObjectId(actor.userId) : undefined;
    run.approvedAt = new Date();
    await run.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "payroll-run.approved",
      resourceType: "PayrollRun",
      resourceId: run._id.toString(),
      before,
      after: { status: run.status },
    });

    return run;
  },

  async listRuns(organizationId: string) {
    await connectMongoDB();
    return PayrollRunModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ payPeriodStart: -1 }).lean();
  },

  async getRunDetail(runId: string, organizationId: string) {
    await connectMongoDB();
    const run = await PayrollRunModel.findOne({
      _id: new Types.ObjectId(runId),
      organizationId: new Types.ObjectId(organizationId),
    }).lean();
    if (!run) throw new NotFoundError("Payroll run not found in this organization");

    const [records, adjustments] = await Promise.all([
      PayrollRecordModel.find({ payrollRunId: run._id }).lean(),
      PayrollAdjustmentModel.find({ payrollRunId: run._id }).lean(),
    ]);

    return { run, records, adjustments };
  },
};
