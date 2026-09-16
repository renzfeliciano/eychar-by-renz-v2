import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { LeaveTypeModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError } from "@/shared/errors";
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

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return LeaveTypeModel.find({ organizationId: new Types.ObjectId(organizationId) }).lean();
  },
};
