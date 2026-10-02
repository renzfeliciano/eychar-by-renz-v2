import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, LeaveRequestModel, LeaveTypeModel, UserModel } from "@/server/db/models";
import { assertInOrganization } from "@/server/db/assert-in-organization";
import { AuditService } from "@/server/audit/audit-service";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
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

function dateKeyStartUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export type LeaveRequestSummary = {
  total: number;
  byStatus: Map<string, { count: number; days: number }>;
  onLeaveToday: number;
  upcoming: number;
  approvedDaysThisMonth: number;
};

export type LeaveRequestRow = {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  status: string;
};

export type LeaveRequestPageQuery = {
  status?: string;
  /** When set, only requests whose employee or leave type matched it (ids below). */
  q?: string;
  employeeIdsMatchingQ?: string[];
  leaveTypeIdsMatchingQ?: string[];
  sort?: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  /**
   * For sort "employee": each employee's rank by name (equal names share a
   * rank, so their requests stay in date order), and the rank of requests
   * whose employee isn't listed. This sort reads every matching request's
   * id, employee and start date (not whole requests) to order them.
   */
  employeeOrder?: { ids: string[]; ranks: number[]; missingRank: number };
};

export const LeaveRequestService = {
  async create(input: CreateLeaveRequestInput, actor: { userId?: string }) {
    await connectMongoDB();

    const startDate = toCalendarDateUtc(input.startDate);
    const endDate = toCalendarDateUtc(input.endDate);
    if (endDate.getTime() < startDate.getTime()) {
      throw new BusinessRuleError("endDate must be on or after startDate");
    }
    const totalDays = inclusiveDayCount(startDate, endDate);

    await assertInOrganization(EmployeeModel, input.employeeId, input.organizationId, "Employee");
    await assertInOrganization(LeaveTypeModel, input.leaveTypeId, input.organizationId, "Leave type");
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
      countPending: true,
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

    // Nobody decides their own leave, whatever roles their account holds.
    if (actor.userId) {
      const approver = await UserModel.findById(actor.userId).select("employeeId").lean<{ employeeId?: Types.ObjectId } | null>();
      if (approver?.employeeId && approver.employeeId.toString() === request.employeeId.toString()) {
        throw new AuthorizationError("You can't approve or reject your own leave request");
      }
    }
    // Checked again at approval: the balance may have changed since the request was filed.
    if (patch.decision === "approved") {
      const available = await LeaveBalanceService.getAvailable({
        organizationId,
        employeeId: request.employeeId.toString(),
        leaveTypeId: request.leaveTypeId.toString(),
        year: request.startDate.getUTCFullYear(),
      });
      if (request.totalDays > available) {
        throw new BusinessRuleError(`Approving ${request.totalDays} day(s) would exceed the available balance of ${available} day(s)`);
      }
    }

    const before = { status: request.status };
    const decidedAt = new Date();
    // Only one decision wins, even if two approvers click at the same moment.
    const decided = await LeaveRequestModel.findOneAndUpdate(
      { _id: request._id, organizationId: request.organizationId, status: "pending" },
      {
        $set: {
          status: patch.decision,
          approvedAt: decidedAt,
          ...(actor.userId ? { approvedBy: new Types.ObjectId(actor.userId) } : {}),
          ...(patch.decision === "rejected" ? { rejectionReason: patch.rejectionReason } : {}),
        },
      },
      { new: true },
    );
    if (!decided) throw new ConflictError("This request was already decided by someone else");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: `leave-request.${patch.decision}`,
      resourceType: "LeaveRequest",
      resourceId: decided._id.toString(),
      before,
      after: { status: decided.status, rejectionReason: decided.rejectionReason },
    });

    return decided;
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
    if (filters.leaveTypeId) {
      if (!Types.ObjectId.isValid(filters.leaveTypeId)) return [];
      filter.leaveTypeId = new Types.ObjectId(filters.leaveTypeId);
    }
    return LeaveRequestModel.find(filter).sort({ startDate: -1 }).lean();
  },

  /** How many requests are waiting for a decision (the dashboard's count). */
  async countPending(organizationId: string): Promise<number> {
    await connectMongoDB();
    return LeaveRequestModel.countDocuments({ organizationId: new Types.ObjectId(organizationId), status: "pending" });
  },

  /**
   * Requests in `status` (approved by default) whose dates include the
   * calendar day `dateKey` (YYYY-MM-DD): who is on leave that day. Only the
   * fields a "who's out" view needs.
   */
  async listCoveringDate(organizationId: string, dateKey: string, status: string = "approved") {
    await connectMongoDB();
    const day = dateKeyStartUtc(dateKey);
    return LeaveRequestModel.find({
      organizationId: new Types.ObjectId(organizationId),
      status,
      startDate: { $lt: new Date(day.getTime() + MS_PER_DAY) },
      endDate: { $gte: day },
    })
      .select("employeeId leaveTypeId startDate endDate status totalDays")
      .lean();
  },

  /**
   * The Leave page's summary strip and status-tab counts, counted in the
   * database: per status (requests and days), distinct employees on approved
   * leave on `now`'s UTC day, approved leave starting within 30 days, and
   * approved days starting in `now`'s UTC month.
   */
  async summary(organizationId: string, now: Date = new Date()): Promise<LeaveRequestSummary> {
    await connectMongoDB();
    const today = toCalendarDateUtc(now);
    const tomorrow = new Date(today.getTime() + MS_PER_DAY);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const orgObjectId = new Types.ObjectId(organizationId);
    const approved = { organizationId: orgObjectId, status: "approved" };
    // A few small counts in parallel; no request documents leave the database.
    // One accumulator per $group: some MongoDB-compatible engines (FerretDB,
    // used for local test runs) evaluate only the first one.
    const [countRows, dayRows, onLeaveEmployees, upcoming, monthRows] = await Promise.all([
      LeaveRequestModel.aggregate<{ _id: string; count: number }>([{ $match: { organizationId: orgObjectId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      LeaveRequestModel.aggregate<{ _id: string; days: number }>([{ $match: { organizationId: orgObjectId } }, { $group: { _id: "$status", days: { $sum: "$totalDays" } } }]),
      LeaveRequestModel.distinct("employeeId", { ...approved, startDate: { $lt: tomorrow }, endDate: { $gte: today } }),
      LeaveRequestModel.countDocuments({ ...approved, startDate: { $gt: now, $lte: new Date(now.getTime() + 30 * MS_PER_DAY) } }),
      LeaveRequestModel.aggregate<{ days: number }>([
        { $match: { ...approved, startDate: { $gte: monthStart, $lt: nextMonthStart } } },
        { $group: { _id: null, days: { $sum: "$totalDays" } } },
      ]),
    ]);
    const daysByStatus = new Map(dayRows.map((row) => [row._id, row.days]));
    const byStatus = new Map(countRows.map((row) => [row._id, { count: row.count, days: daysByStatus.get(row._id) ?? 0 }]));
    return {
      total: [...byStatus.values()].reduce((sum, row) => sum + row.count, 0),
      byStatus,
      onLeaveToday: onLeaveEmployees.length,
      upcoming,
      approvedDaysThisMonth: monthRows[0]?.days ?? 0,
    };
  },

  /**
   * One page of the organization's requests, filtered, sorted and counted by
   * the database (the Leave page), instead of loading every request.
   * Searching by employee or leave type name is resolved by the caller into
   * the matching ids; sorting by employee uses the caller's name order.
   */
  async page(organizationId: string, query: LeaveRequestPageQuery): Promise<{ rows: LeaveRequestRow[]; total: number }> {
    await connectMongoDB();
    const match: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (query.status) match.status = query.status;
    if (query.q !== undefined) {
      const ids = (values?: string[]) => (values ?? []).filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
      match.$or = [{ employeeId: { $in: ids(query.employeeIdsMatchingQ) } }, { leaveTypeId: { $in: ids(query.leaveTypeIdsMatchingQ) } }];
    }

    const direction = query.dir === "desc" ? -1 : 1;
    const skip = (query.page - 1) * query.pageSize;
    const fields = { employeeId: 1, leaveTypeId: 1, startDate: 1, endDate: 1, totalDays: 1, status: 1 } as const;
    if (query.sort === "employee") {
      // Names live on Person, not here: read just each matching request's
      // employee and start date, order by the caller's name ranks (ties
      // newest first), then read the one page of requests by id.
      const rankOf = new Map((query.employeeOrder?.ids ?? []).map((id, index) => [id, query.employeeOrder?.ranks[index] ?? index]));
      const missing = query.employeeOrder?.missingRank ?? rankOf.size;
      const keys = await LeaveRequestModel.find(match).select({ employeeId: 1, startDate: 1 }).lean<{ _id: Types.ObjectId; employeeId: Types.ObjectId; startDate: Date }[]>();
      const rank = (key: (typeof keys)[number]) => rankOf.get(key.employeeId.toString()) ?? missing;
      keys.sort(
        (a, b) =>
          (rank(a) - rank(b)) * direction ||
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime() ||
          (a._id.toString() < b._id.toString() ? 1 : a._id.toString() > b._id.toString() ? -1 : 0),
      );
      const pageIds = keys.slice(skip, skip + query.pageSize).map((key) => key._id);
      const docs = pageIds.length ? await LeaveRequestModel.find({ _id: { $in: pageIds } }).select(fields).lean<LeaveRequestRow[]>() : [];
      const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]));
      return { rows: pageIds.map((id) => byId.get(id.toString())).filter((doc): doc is LeaveRequestRow => Boolean(doc)), total: keys.length };
    }

    // Ties keep the default newest-first order, as the in-memory table's stable sort did.
    const sort: Record<string, 1 | -1> =
      query.sort === "days"
        ? { totalDays: direction, startDate: -1, _id: -1 }
        : query.sort === "status"
          ? { status: direction, startDate: -1, _id: -1 }
          : query.sort === "startDate"
            ? { startDate: direction, _id: -1 }
            : { startDate: -1, _id: -1 };
    const [rows, count] = await Promise.all([LeaveRequestModel.find(match).select(fields).sort(sort).skip(skip).limit(query.pageSize).lean<LeaveRequestRow[]>(), LeaveRequestModel.countDocuments(match)]);
    return { rows, total: count };
  },
};
