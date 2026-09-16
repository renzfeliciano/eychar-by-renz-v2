import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { CompensationModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError } from "@/shared/errors";
import type { CreateCompensationInput } from "@/shared/validation/payroll";

const OPEN_COMPENSATION_FILTER = {
  $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }],
};

export const CompensationService = {
  /** First grant only — there is no prior one to close (see `revise` for corrections). */
  async create(input: CreateCompensationInput, actor: { userId?: string }) {
    await connectMongoDB();

    const employeeId = new Types.ObjectId(input.employeeId);
    const existingOpen = await CompensationModel.exists({ employeeId, ...OPEN_COMPENSATION_FILTER });
    if (existingOpen) {
      throw new ConflictError("This employee already has an open compensation record — use revise() instead");
    }

    const compensation = await CompensationModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      employeeId,
      baseSalary: input.baseSalary,
      allowanceAmount: input.allowanceAmount ?? 0,
      effectiveFrom: input.effectiveFrom,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "compensation.created",
      resourceType: "Compensation",
      resourceId: compensation._id.toString(),
      after: { baseSalary: compensation.baseSalary, allowanceAmount: compensation.allowanceAmount },
    });

    return compensation;
  },

  /**
   * The same transfer mechanic as EmployeeAssignment/EmployeeAssignmentService.transfer():
   * close the current row, create a new one — never an in-place edit, so
   * historical payroll runs keep resolving the compensation that was
   * actually effective on their own dates (AGENTS.md §27).
   */
  async revise(
    employeeId: string,
    organizationId: string,
    patch: { baseSalary: number; allowanceAmount?: number; effectiveFrom?: Date },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const employeeObjectId = new Types.ObjectId(employeeId);
    const effectiveFrom = patch.effectiveFrom ?? new Date();

    const current = await CompensationModel.findOne({ employeeId: employeeObjectId, ...OPEN_COMPENSATION_FILTER });
    const before = current ? { baseSalary: current.baseSalary, allowanceAmount: current.allowanceAmount } : null;
    if (current) {
      current.effectiveTo = effectiveFrom;
      await current.save();
    }

    const next = await CompensationModel.create({
      organizationId: new Types.ObjectId(organizationId),
      employeeId: employeeObjectId,
      baseSalary: patch.baseSalary,
      allowanceAmount: patch.allowanceAmount ?? 0,
      effectiveFrom,
    });

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "compensation.revised",
      resourceType: "Compensation",
      resourceId: next._id.toString(),
      before,
      after: { baseSalary: next.baseSalary, allowanceAmount: next.allowanceAmount },
    });

    return next;
  },

  async getCurrent(employeeId: string) {
    await connectMongoDB();
    return CompensationModel.findOne({ employeeId: new Types.ObjectId(employeeId), ...OPEN_COMPENSATION_FILTER })
      .sort({ effectiveFrom: -1 })
      .lean();
  },

  async getAsOf(employeeId: string, date: Date) {
    await connectMongoDB();
    return CompensationModel.findOne({
      employeeId: new Types.ObjectId(employeeId),
      effectiveFrom: { $lte: date },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: date } }],
    }).lean();
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return CompensationModel.find({ organizationId: new Types.ObjectId(organizationId), ...OPEN_COMPENSATION_FILTER }).lean();
  },
};
