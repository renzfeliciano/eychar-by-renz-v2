import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, EmploymentModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { EmploymentTypeService } from "@/domains/catalog/employment-type-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { requiresEndOfContract } from "./contract-terms";

export type CreateEmploymentInput = {
  organizationId: string;
  employeeId: string;
  employmentType: string;
  effectiveFrom?: Date;
  endOfContract?: Date;
};

export type ChangeEmploymentTermsInput = {
  employmentType: string;
  /** The day the new terms apply (e.g. the regularization date). */
  effectiveFrom: Date;
  endOfContract?: Date;
  note?: string;
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

const OPEN_EMPLOYMENT_FILTER = {
  $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }],
};

export const EmploymentService = {
  async create(input: CreateEmploymentInput, actor: { userId?: string }) {
    await connectMongoDB();

    const employeeObjectId = new Types.ObjectId(input.employeeId);
    const employeeExists = await EmployeeModel.exists({
      _id: employeeObjectId,
      organizationId: new Types.ObjectId(input.organizationId),
    });
    if (!employeeExists) throw new NotFoundError("Employee not found in this organization");

    const alreadyOpen = await EmploymentModel.exists({ employeeId: employeeObjectId, ...OPEN_EMPLOYMENT_FILTER });
    if (alreadyOpen) {
      throw new BusinessRuleError("This employee already has an open employment record");
    }

    await EmploymentTypeService.assertValidCode(input.organizationId, input.employmentType);

    const typeItem = await EmploymentTypeService.getByCode(input.organizationId, input.employmentType);
    if (requiresEndOfContract(typeItem) && !input.endOfContract) {
      throw new BusinessRuleError(`End of contract is required for employment type "${input.employmentType}"`);
    }

    const employment = await EmploymentModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      employeeId: employeeObjectId,
      employmentType: input.employmentType,
      status: "active",
      effectiveFrom: input.effectiveFrom ?? new Date(),
      endOfContract: input.endOfContract,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "employment.created",
      resourceType: "Employment",
      resourceId: employment._id.toString(),
      after: { employmentType: employment.employmentType, status: employment.status },
    });

    return employment;
  },

  async terminate(
    id: string,
    organizationId: string,
    patch: { effectiveTo?: Date; terminationReason?: string; status?: string },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const employment = await EmploymentModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!employment) throw new NotFoundError("Employment record not found in this organization");
    if (!(await EmploymentService.isActiveStatus(organizationId, employment.status))) {
      throw new BusinessRuleError("This employment record has already ended");
    }

    // Defaults to the original literal "terminated" for callers that don't
    // pick a specific reason — an org can also configure "resigned"/"awol"
    // etc. via Settings > Catalogs and pass one of those codes instead.
    const nextStatus = patch.status ?? "terminated";
    await EmploymentStatusService.assertValidCode(organizationId, nextStatus);

    const before = { status: employment.status, effectiveTo: employment.effectiveTo };
    employment.status = nextStatus;
    employment.effectiveTo = patch.effectiveTo ?? new Date();
    if (patch.terminationReason) employment.terminationReason = patch.terminationReason;
    await employment.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "employment.terminated",
      resourceType: "Employment",
      resourceId: employment._id.toString(),
      before,
      after: { status: employment.status, effectiveTo: employment.effectiveTo },
    });

    return employment;
  },

  /**
   * Changes the terms of an employee's current employment: a probationary
   * employee made regular, a contract renewed to a new end date, a move
   * between types. The same employment continues (hire date and length of
   * service are kept); the change is appended to `termsHistory` and audited
   * (ADR-052). Types without an end date clear any end date left over.
   */
  async changeTerms(employeeId: string, organizationId: string, input: ChangeEmploymentTermsInput, actor: { userId?: string }) {
    await connectMongoDB();

    const employment = await EmploymentModel.findOne({
      employeeId: new Types.ObjectId(employeeId),
      organizationId: new Types.ObjectId(organizationId),
      ...OPEN_EMPLOYMENT_FILTER,
    }).sort({ effectiveFrom: -1 });
    if (!employment) throw new NotFoundError("This employee has no current employment to change");
    if (!(await EmploymentService.isActiveStatus(organizationId, employment.status))) {
      throw new BusinessRuleError("This employment has already ended");
    }

    await EmploymentTypeService.assertValidCode(organizationId, input.employmentType);
    const typeItem = await EmploymentTypeService.getByCode(organizationId, input.employmentType);
    const needsEnd = requiresEndOfContract(typeItem);
    if (needsEnd && !input.endOfContract) throw new BusinessRuleError(`Enter when the contract ends: "${typeItem?.name ?? input.employmentType}" needs an end of contract`);

    const effectiveKey = dayKey(input.effectiveFrom);
    if (effectiveKey < dayKey(employment.effectiveFrom)) throw new BusinessRuleError("The change can't take effect before the employee was hired");
    const endOfContract = needsEnd ? input.endOfContract : undefined;
    if (endOfContract && dayKey(endOfContract) < effectiveKey) throw new BusinessRuleError("The contract can't end before the change takes effect");

    const before = { employmentType: employment.employmentType, endOfContract: employment.endOfContract ?? null };
    const sameEnd = (before.endOfContract ? dayKey(before.endOfContract) : null) === (endOfContract ? dayKey(endOfContract) : null);
    if (before.employmentType === input.employmentType && sameEnd) throw new BusinessRuleError("Nothing changed: pick a different type or end date");

    const note = input.note?.trim() || undefined;
    employment.termsHistory.push({
      employmentType: input.employmentType,
      endOfContract,
      effectiveFrom: input.effectiveFrom,
      previousEmploymentType: before.employmentType,
      previousEndOfContract: before.endOfContract ?? undefined,
      note,
      changedBy: actor.userId ? new Types.ObjectId(actor.userId) : undefined,
      changedAt: new Date(),
    });
    employment.employmentType = input.employmentType;
    employment.endOfContract = endOfContract;
    await employment.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "employment.terms_changed",
      resourceType: "Employment",
      resourceId: employment._id.toString(),
      before,
      after: { employmentType: employment.employmentType, endOfContract: employment.endOfContract ?? null, effectiveFrom: input.effectiveFrom, note },
    });

    return employment;
  },

  async getCurrent(employeeId: string) {
    await connectMongoDB();
    return EmploymentModel.findOne({ employeeId: new Types.ObjectId(employeeId), ...OPEN_EMPLOYMENT_FILTER })
      .sort({ effectiveFrom: -1 })
      .lean();
  },

  /**
   * Generalizes the old literal `status !== "terminated"` check: if the
   * organization has configured "employment-status" catalog items, this
   * reads the matching item's `metadata.isActiveHeadcount`. If no item
   * matches (catalog unconfigured, or a code predating any configuration),
   * it falls back to the original literal rule — so behavior for orgs that
   * never touch Settings > Catalogs is unchanged.
   */
  async isActiveStatus(organizationId: string, status: string): Promise<boolean> {
    const item = await EmploymentStatusService.getByCode(organizationId, status);
    if (item?.metadata && typeof item.metadata === "object" && "isActiveHeadcount" in item.metadata) {
      return Boolean((item.metadata as Record<string, unknown>).isActiveHeadcount);
    }
    return status !== "terminated";
  },
};
