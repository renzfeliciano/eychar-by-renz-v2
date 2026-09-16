import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { LeaveRequestModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import { LeaveBalanceService } from "./leave-balance-service";
import type { CreateLeaveRequestInput } from "@/shared/validation/leave";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Truncates to the calendar day (UTC midnight), matching AttendanceService's own date normalization. */
function toCalendarDateUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Inclusive calendar-day count — no holiday-calendar exclusion (documented simplification, same spirit as Attendance). */
function inclusiveDayCount(startDate: Date, endDate: Date): number {
  return Math.round((toCalendarDateUtc(endDate).getTime() - toCalendarDateUtc(startDate).getTime()) / MS_PER_DAY) + 1;
}

export const LeaveRequestService = {
  async create(input: CreateLeaveRequestInput, actor: { userId?: string }) {
    await connectMongoDB();

    const startDate = toCalendarDateUtc(input.startDate);
    const endDate = toCalendarDateUtc(input.endDate);
    if (endDate.getTime() < startDate.getTime()) {
      throw new BusinessRuleError("endDate must be on or after startDate");
    }
    const totalDays = inclusiveDayCount(startDate, endDate);

    const organizationId = new Types.ObjectId(input.organizationId);
    const employeeId = new Types.ObjectId(input.employeeId);
    const leaveTypeId = new Types.ObjectId(input.leaveTypeId);

    // Same "don't double-book" guard used elsewhere in this codebase — an
    // employee can't have two pending/approved requests over the same days,
    // regardless of leave type.
    const overlapping = await LeaveRequestModel.exists({
      organizationId,
      employeeId,
      status: { $in: ["pending", "approved"] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });
    if (overlapping) {
      throw new ConflictError("This employee already has a pending or approved leave request over these dates");
    }

    const available = await LeaveBalanceService.getAvailable({
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      year: startDate.getUTCFullYear(),
    });
    if (totalDays > available) {
      throw new BusinessRuleError(`Request of ${totalDays} day(s) exceeds the available balance of ${available} day(s)`);
    }

    const request = await LeaveRequestModel.create({
      organizationId,
      employeeId,
      leaveTypeId,
      startDate,
      endDate,
      totalDays,
      reason: input.reason,
      status: "pending",
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "leave-request.created",
      resourceType: "LeaveRequest",
      resourceId: request._id.toString(),
      after: { startDate: request.startDate, endDate: request.endDate, totalDays: request.totalDays },
    });

    return request;
  },

  /** The approval workflow AGENTS.md §57 names — gated by leave.approve at the route. */
  async decide(
    id: string,
    organizationId: string,
    patch: { decision: "approved" | "rejected"; rejectionReason?: string },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const request = await LeaveRequestModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!request) throw new NotFoundError("Leave request not found in this organization");
    if (request.status !== "pending") {
      throw new BusinessRuleError(`Only a pending request can be decided (current status: ${request.status})`);
    }

    const before = { status: request.status };
    request.status = patch.decision;
    request.approvedBy = actor.userId ? new Types.ObjectId(actor.userId) : undefined;
    request.approvedAt = new Date();
    if (patch.decision === "rejected") request.rejectionReason = patch.rejectionReason;
    await request.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: `leave-request.${patch.decision}`,
      resourceType: "LeaveRequest",
      resourceId: request._id.toString(),
      before,
      after: { status: request.status, rejectionReason: request.rejectionReason },
    });

    return request;
  },

  /** Gated by leave.update — only the requester side, before a decision is made. */
  async cancel(id: string, organizationId: string, actor: { userId?: string }) {
    await connectMongoDB();

    const request = await LeaveRequestModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!request) throw new NotFoundError("Leave request not found in this organization");
    if (request.status !== "pending") {
      throw new BusinessRuleError(`Only a pending request can be cancelled (current status: ${request.status})`);
    }

    const before = { status: request.status };
    request.status = "cancelled";
    await request.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "leave-request.cancelled",
      resourceType: "LeaveRequest",
      resourceId: request._id.toString(),
      before,
      after: { status: request.status },
    });

    return request;
  },

  async listForEmployee(employeeId: string, organizationId: string) {
    await connectMongoDB();
    return LeaveRequestModel.find({
      employeeId: new Types.ObjectId(employeeId),
      organizationId: new Types.ObjectId(organizationId),
    })
      .sort({ startDate: -1 })
      .lean();
  },

  async listForOrganization(organizationId: string, filters: { status?: string; leaveTypeId?: string } = {}) {
    await connectMongoDB();
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (filters.status) filter.status = filters.status;
    if (filters.leaveTypeId) filter.leaveTypeId = new Types.ObjectId(filters.leaveTypeId);
    return LeaveRequestModel.find(filter).sort({ startDate: -1 }).lean();
  },
};
