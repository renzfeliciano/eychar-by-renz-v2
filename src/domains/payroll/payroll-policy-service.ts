import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PayrollPolicyModel, ProjectModel } from "@/server/db/models";
import { assertOptionalInOrganization } from "@/server/db/assert-in-organization";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { resolveOrgProjectPolicy, type PolicySource } from "@/server/policies/resolve-org-project-policy";
import { dateKeyToDate } from "@/lib/date-key";
import { assertNoSameDayVersion } from "./same-day-version-guard";
import type { CreatePayrollPolicyInput } from "@/shared/validation/payroll";
import type { PayPremiums } from "./engine/premiums";
import { MONTHLY_PAY_ACKNOWLEDGEMENT } from "./engine/pay-frequency";

/** Monthly pay is HR's choice, but only with the Art. 103 acknowledgement ticked (payroll plan Phase 6). */
export function monthlyPayAcknowledgement(payFrequency: string, acknowledged: boolean | undefined, userId: string | undefined) {
  if (payFrequency !== "monthly") return undefined;
  if (!acknowledged) throw new BusinessRuleError("Tick the acknowledgement to choose monthly pay: the Labor Code (Art. 103) requires pay at least twice a month.");
  return { by: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined, at: new Date(), statement: MONTHLY_PAY_ACKNOWLEDGEMENT };
}

export type { PolicySource };

type PayrollPolicyDoc = NonNullable<Awaited<ReturnType<typeof PayrollPolicyModel.findOne>>>;

/** The premiums are optional for callers that predate them (seed, fixtures): the schema defaults fill them in. */
type PremiumKey = keyof PayPremiums;
type CreatePolicyInput = Omit<CreatePayrollPolicyInput, PremiumKey> & Partial<Pick<CreatePayrollPolicyInput, PremiumKey>>;

export const PayrollPolicyService = {
  async create(input: CreatePolicyInput, actor: { userId?: string }) {
    await connectMongoDB();
    await assertOptionalInOrganization(ProjectModel, input.projectId, input.organizationId, "Project");
    const effectiveFrom = input.effectiveFrom ? dateKeyToDate(input.effectiveFrom) : new Date();
    await assertNoSameDayVersion(PayrollPolicyModel, { organizationId: input.organizationId, projectId: input.projectId, effectiveFrom }, "payroll policy");
    const acknowledgement = monthlyPayAcknowledgement(input.payFrequency, input.acknowledgeMonthlyPay, actor.userId);

    const policy = await PayrollPolicyModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : undefined,
      name: input.name,
      payFrequency: input.payFrequency,
      workDaysPerYear: input.workDaysPerYear,
      hoursPerDay: input.hoursPerDay,
      finalPayDeadlineDays: input.finalPayDeadlineDays,
      workWeekDays: [...new Set(input.workWeekDays)].sort(),
      deductLateAndUndertime: input.deductLateAndUndertime,
      contributionTiming: input.contributionTiming,
      overtimeMultiplier: input.overtimeMultiplier,
      restDayMultiplier: input.restDayMultiplier,
      thirteenthMonthDivisor: input.thirteenthMonthDivisor,
      specialHolidayMultiplier: input.specialHolidayMultiplier,
      specialHolidayRestDayMultiplier: input.specialHolidayRestDayMultiplier,
      regularHolidayMultiplier: input.regularHolidayMultiplier,
      regularHolidayRestDayMultiplier: input.regularHolidayRestDayMultiplier,
      premiumOvertimeMultiplier: input.premiumOvertimeMultiplier,
      nightDifferentialRate: input.nightDifferentialRate,
      holidayDayTypes: input.holidayDayTypes && Object.keys(input.holidayDayTypes).length ? input.holidayDayTypes : undefined,
      finalPayChecks: input.finalPayChecks?.length ? input.finalPayChecks : undefined,
      recentPayChangeDays: input.recentPayChangeDays,
      monthlyPayAcknowledgement: acknowledgement,
      effectiveFrom,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-policy.created",
      resourceType: "PayrollPolicy",
      resourceId: policy._id.toString(),
      after: {
        name: policy.name,
        payFrequency: policy.payFrequency,
        workDaysPerYear: policy.workDaysPerYear,
        contributionTiming: policy.contributionTiming,
        overtimeMultiplier: policy.overtimeMultiplier,
        restDayMultiplier: policy.restDayMultiplier,
        thirteenthMonthDivisor: policy.thirteenthMonthDivisor,
        specialHolidayMultiplier: policy.specialHolidayMultiplier,
        specialHolidayRestDayMultiplier: policy.specialHolidayRestDayMultiplier,
        regularHolidayMultiplier: policy.regularHolidayMultiplier,
        regularHolidayRestDayMultiplier: policy.regularHolidayRestDayMultiplier,
        premiumOvertimeMultiplier: policy.premiumOvertimeMultiplier,
        nightDifferentialRate: policy.nightDifferentialRate,
        holidayDayTypes: input.holidayDayTypes,
        projectId: policy.projectId,
        monthlyPayAcknowledged: acknowledgement ? acknowledgement.statement : undefined,
      },
    });

    return policy;
  },

  async updateStatus(id: string, organizationId: string, patch: { status?: "active" | "inactive"; effectiveTo?: Date; acknowledgeMonthlyPay?: true }, actor: { userId?: string }) {
    await connectMongoDB();

    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Payroll policy not found in this organization");
    const policy = await PayrollPolicyModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!policy) throw new NotFoundError("Payroll policy not found in this organization");

    const before = { status: policy.status, effectiveTo: policy.effectiveTo, monthlyPayAcknowledged: Boolean(policy.monthlyPayAcknowledgement) };
    if (patch.status) policy.status = patch.status;
    if (patch.effectiveTo) policy.effectiveTo = patch.effectiveTo;
    // A monthly policy from before the acknowledgement existed (Phase 6): HR ticks it here. Pay is unchanged.
    if (patch.acknowledgeMonthlyPay) {
      if (policy.payFrequency !== "monthly") throw new BusinessRuleError("Only a monthly policy needs the monthly pay acknowledgement.");
      if (!policy.monthlyPayAcknowledgement) policy.monthlyPayAcknowledgement = monthlyPayAcknowledgement("monthly", true, actor.userId);
    }
    await policy.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "payroll-policy.updated",
      resourceType: "PayrollPolicy",
      resourceId: policy._id.toString(),
      before,
      after: { status: policy.status, effectiveTo: policy.effectiveTo, monthlyPayAcknowledged: Boolean(policy.monthlyPayAcknowledgement) },
    });

    return policy;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return PayrollPolicyModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ effectiveFrom: -1 }).lean();
  },

  /** Organization → Project override resolution (ENGINEERING.md §26) via the shared resolver. */
  async resolve(params: { organizationId: string; projectId?: string; effectiveDate: Date }) {
    await connectMongoDB();
    return resolveOrgProjectPolicy<PayrollPolicyDoc>(PayrollPolicyModel, params);
  },
};
