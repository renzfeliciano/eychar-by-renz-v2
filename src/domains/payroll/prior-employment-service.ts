import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, PayrollRunModel } from "@/server/db/models";
import { PriorEmploymentModel } from "@/server/db/models/prior-employment";
import { assertInOrganization } from "@/server/db/assert-in-organization";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { dateKeyToDate } from "@/lib/date-key";
import type { PriorEmploymentInput } from "@/shared/validation/payroll";

type Actor = { userId?: string };

/** A year's entries freeze once that year's year-end run is approved: the run's snapshot was built from them. */
async function assertYearOpen(organizationId: Types.ObjectId, year: number) {
  const settled = await PayrollRunModel.findOne({ organizationId, runType: "year_end_adjustment", status: { $in: ["approved", "released"] }, payPeriodStart: dateKeyToDate(`${year}-01-01`) })
    .select("runNumber")
    .lean();
  if (settled) throw new BusinessRuleError(`${year}'s year-end run (${settled.runNumber}) is already approved, so its previous-employer figures can't change.`);
}

const fields = (input: PriorEmploymentInput) => ({
  year: input.year,
  employerName: input.employerName,
  employerTin: input.employerTin ?? undefined,
  employerAddress: input.employerAddress ?? undefined,
  employerZipCode: input.employerZipCode ?? undefined,
  periodFrom: input.periodFrom ?? undefined,
  periodTo: input.periodTo ?? undefined,
  taxableCompensation: input.taxableCompensation,
  nonTaxableCompensation: input.nonTaxableCompensation,
  taxWithheld: input.taxWithheld,
  concurrent: input.concurrent,
});

/**
 * What a previous (or concurrent) employer paid and withheld in a year, from its Form 2316 (payroll plan
 * Phase 4). The year-end annualization adds it in; any entry also means the employee files their own return.
 */
export const PriorEmploymentService = {
  async list(organizationId: string, employeeId: string) {
    await connectMongoDB();
    return PriorEmploymentModel.find({ organizationId: new Types.ObjectId(organizationId), employeeId: new Types.ObjectId(employeeId) }).sort({ year: -1, periodFrom: 1 }).lean();
  },

  async create(input: PriorEmploymentInput, actor: Actor) {
    await connectMongoDB();
    await assertInOrganization(EmployeeModel, input.employeeId, input.organizationId, "Employee");
    const organizationId = new Types.ObjectId(input.organizationId);
    await assertYearOpen(organizationId, input.year);
    const entry = await PriorEmploymentModel.create({ organizationId, employeeId: new Types.ObjectId(input.employeeId), ...fields(input), createdBy: actor.userId ? new Types.ObjectId(actor.userId) : undefined });
    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "prior-employment.created",
      resourceType: "PriorEmployment",
      resourceId: entry._id.toString(),
      after: { employeeId: input.employeeId, ...fields(input) },
    });
    return entry;
  },

  async update(id: string, input: PriorEmploymentInput, actor: Actor) {
    await connectMongoDB();
    const organizationId = new Types.ObjectId(input.organizationId);
    const entry = Types.ObjectId.isValid(id) ? await PriorEmploymentModel.findOne({ _id: new Types.ObjectId(id), organizationId, employeeId: new Types.ObjectId(input.employeeId) }) : null;
    if (!entry) throw new NotFoundError("Previous-employer entry not found");
    await assertYearOpen(organizationId, entry.year);
    if (input.year !== entry.year) await assertYearOpen(organizationId, input.year);
    const before = entry.toObject();
    entry.set({ ...fields(input), updatedBy: actor.userId ? new Types.ObjectId(actor.userId) : undefined });
    await entry.save();
    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "prior-employment.updated",
      resourceType: "PriorEmployment",
      resourceId: id,
      before: { year: before.year, employerName: before.employerName, taxableCompensation: before.taxableCompensation, taxWithheld: before.taxWithheld, concurrent: before.concurrent },
      after: fields(input),
    });
    return entry;
  },

  async remove(id: string, organizationId: string, actor: Actor) {
    await connectMongoDB();
    const orgId = new Types.ObjectId(organizationId);
    const entry = Types.ObjectId.isValid(id) ? await PriorEmploymentModel.findOne({ _id: new Types.ObjectId(id), organizationId: orgId }) : null;
    if (!entry) throw new NotFoundError("Previous-employer entry not found");
    await assertYearOpen(orgId, entry.year);
    await entry.deleteOne();
    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "prior-employment.deleted",
      resourceType: "PriorEmployment",
      resourceId: id,
      before: { employeeId: entry.employeeId.toString(), year: entry.year, employerName: entry.employerName, taxableCompensation: entry.taxableCompensation, taxWithheld: entry.taxWithheld },
    });
  },
};
