import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { LeaveBalanceModel, LeaveRequestModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError } from "@/shared/errors";
import type { CreateLeaveBalanceInput } from "@/shared/validation/leave";

export const LeaveBalanceService = {
  async create(input: CreateLeaveBalanceInput, actor: { userId?: string }) {
    await connectMongoDB();

    let balance;
    try {
      balance = await LeaveBalanceModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        employeeId: new Types.ObjectId(input.employeeId),
        leaveTypeId: new Types.ObjectId(input.leaveTypeId),
        year: input.year,
        entitledDays: input.hasNoFixedAmount ? 0 : input.entitledDays,
        hasNoFixedAmount: input.hasNoFixedAmount ?? false,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError("A leave balance already exists for this employee, leave type, and year");
      }
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "leave-balance.created",
      resourceType: "LeaveBalance",
      resourceId: balance._id.toString(),
      after: { entitledDays: balance.entitledDays, year: balance.year },
    });

    return balance;
  },

  /** Manual HR grant/correction — audited before/after (AGENTS.md §57 Approval). */
  async adjust(id: string, organizationId: string, patch: { adjustmentDays: number }, actor: { userId?: string }) {
    await connectMongoDB();

    const balance = await LeaveBalanceModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!balance) throw new NotFoundError("Leave balance not found in this organization");

    const before = { adjustmentDays: balance.adjustmentDays };
    balance.adjustmentDays = patch.adjustmentDays;
    await balance.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "leave-balance.adjusted",
      resourceType: "LeaveBalance",
      resourceId: balance._id.toString(),
      before,
      after: { adjustmentDays: balance.adjustmentDays },
    });

    return balance;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return LeaveBalanceModel.find({ organizationId: new Types.ObjectId(organizationId) }).lean();
  },

  /**
   * entitledDays + adjustmentDays - sum(approved requests' totalDays) for
   * this employee/leaveType/year. "Used" is derived, not stored, so there's
   * exactly one source of truth for consumption (see LeaveBalance model).
   */
  async getAvailable(params: { organizationId: string; employeeId: string; leaveTypeId: string; year: number }) {
    await connectMongoDB();

    const organizationId = new Types.ObjectId(params.organizationId);
    const employeeId = new Types.ObjectId(params.employeeId);
    const leaveTypeId = new Types.ObjectId(params.leaveTypeId);

    const balance = await LeaveBalanceModel.findOne({ organizationId, employeeId, leaveTypeId, year: params.year }).lean();
    if (balance?.hasNoFixedAmount) return Infinity;

    const entitled = (balance?.entitledDays ?? 0) + (balance?.adjustmentDays ?? 0);

    const yearStart = new Date(Date.UTC(params.year, 0, 1));
    const yearEnd = new Date(Date.UTC(params.year, 11, 31, 23, 59, 59, 999));
    const approvedRequests = await LeaveRequestModel.find({
      organizationId,
      employeeId,
      leaveTypeId,
      status: "approved",
      startDate: { $gte: yearStart, $lte: yearEnd },
    }).lean();
    const used = approvedRequests.reduce((sum, request) => sum + request.totalDays, 0);

    return entitled - used;
  },
};
