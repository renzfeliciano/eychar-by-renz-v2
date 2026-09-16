import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, EmploymentModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

export type CreateEmploymentInput = {
  organizationId: string;
  employeeId: string;
  employmentType: string;
  effectiveFrom?: Date;
};

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

    const employment = await EmploymentModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      employeeId: employeeObjectId,
      employmentType: input.employmentType,
      status: "active",
      effectiveFrom: input.effectiveFrom ?? new Date(),
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
    patch: { effectiveTo?: Date; terminationReason?: string },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const employment = await EmploymentModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!employment) throw new NotFoundError("Employment record not found in this organization");
    if (employment.status === "terminated") {
      throw new BusinessRuleError("This employment record is already terminated");
    }

    const before = { status: employment.status, effectiveTo: employment.effectiveTo };
    employment.status = "terminated";
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

  async getCurrent(employeeId: string) {
    await connectMongoDB();
    return EmploymentModel.findOne({ employeeId: new Types.ObjectId(employeeId), ...OPEN_EMPLOYMENT_FILTER })
      .sort({ effectiveFrom: -1 })
      .lean();
  },
};
