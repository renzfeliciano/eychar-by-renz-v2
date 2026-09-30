import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { LeaveTypeModel, LeaveRequestModel, LeaveBalanceModel, LeavePolicyModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError, BusinessRuleError } from "@/shared/errors";
import type { CreateLeaveTypeInput } from "@/shared/validation/leave";

export const LeaveTypeService = {
  async create(input: CreateLeaveTypeInput, actor: { userId?: string }) {
    await connectMongoDB();

    let leaveType;
    try {
      leaveType = await LeaveTypeModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        name: input.name,
        code: input.code,
        description: input.description,
        requiresApproval: input.requiresApproval,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`Leave type code "${input.code}" is already in use`);
      }
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "leave-type.created",
      resourceType: "LeaveType",
      resourceId: leaveType._id.toString(),
      after: { name: leaveType.name, code: leaveType.code },
    });

    return leaveType;
  },

  async updateStatus(
    id: string,
    organizationId: string,
    patch: { status?: "active" | "inactive" },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const leaveType = await LeaveTypeModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!leaveType) throw new NotFoundError("Leave type not found in this organization");

    const before = { status: leaveType.status };
    if (patch.status) leaveType.status = patch.status;
    await leaveType.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "leave-type.updated",
      resourceType: "LeaveType",
      resourceId: leaveType._id.toString(),
      before,
      after: { status: leaveType.status },
    });

    return leaveType;
  },

  /** Renames/redescribes an existing leave type — status has its own dedicated `updateStatus` above. */
  /** HR's switch: whether unused days of this type are paid out at separation (ADR-032). */
  async setConvertible(id: string, organizationId: string, convertible: boolean, actor: { userId?: string }) {
    await connectMongoDB();
    const leaveType = await LeaveTypeModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!leaveType) throw new NotFoundError("Leave type not found in this organization");
    const before = { convertibleAtSeparation: Boolean(leaveType.convertibleAtSeparation) };
    leaveType.convertibleAtSeparation = convertible;
    await leaveType.save();
    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "leave-type.updated",
      resourceType: "LeaveType",
      resourceId: id,
      before,
      after: { convertibleAtSeparation: convertible },
    });
    return leaveType;
  },

  async update(
    id: string,
    organizationId: string,
    patch: { name?: string; code?: string; description?: string },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const leaveType = await LeaveTypeModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!leaveType) throw new NotFoundError("Leave type not found in this organization");

    const before = { name: leaveType.name, code: leaveType.code, description: leaveType.description };
    if (patch.name !== undefined) leaveType.name = patch.name;
    if (patch.code !== undefined) leaveType.code = patch.code;
    if (patch.description !== undefined) leaveType.description = patch.description;

    try {
      await leaveType.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`Leave type code "${patch.code}" is already in use`);
      }
      throw error;
    }

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "leave-type.updated",
      resourceType: "LeaveType",
      resourceId: leaveType._id.toString(),
      before,
      after: { name: leaveType.name, code: leaveType.code, description: leaveType.description },
    });

    return leaveType;
  },

  /**
   * Permanently removes a leave type — unlike `updateStatus("inactive")`,
   * this can't be undone, so it's blocked the moment anything (a leave
   * request, a balance grant, a policy) actually references it. Deactivate
   * is the right tool once a type has real history; delete is for cleaning
   * up a type created by mistake that nothing has used yet.
   */
  async delete(id: string, organizationId: string, actor: { userId?: string }) {
    await connectMongoDB();

    const orgObjectId = new Types.ObjectId(organizationId);
    const leaveTypeId = new Types.ObjectId(id);
    const leaveType = await LeaveTypeModel.findOne({ _id: leaveTypeId, organizationId: orgObjectId });
    if (!leaveType) throw new NotFoundError("Leave type not found in this organization");

    const [requestCount, balanceCount, policyCount] = await Promise.all([
      LeaveRequestModel.countDocuments({ leaveTypeId }),
      LeaveBalanceModel.countDocuments({ leaveTypeId }),
      LeavePolicyModel.countDocuments({ leaveTypeId }),
    ]);
    if (requestCount > 0 || balanceCount > 0 || policyCount > 0) {
      throw new BusinessRuleError(
        `"${leaveType.name}" is in use (${requestCount} request(s), ${balanceCount} balance(s), ${policyCount} polic${policyCount === 1 ? "y" : "ies"}) and can't be deleted — deactivate it instead.`,
      );
    }

    await LeaveTypeModel.deleteOne({ _id: leaveTypeId, organizationId: orgObjectId });

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "leave-type.deleted",
      resourceType: "LeaveType",
      resourceId: id,
      before: { name: leaveType.name, code: leaveType.code },
    });
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return LeaveTypeModel.find({ organizationId: new Types.ObjectId(organizationId) }).lean();
  },
};
