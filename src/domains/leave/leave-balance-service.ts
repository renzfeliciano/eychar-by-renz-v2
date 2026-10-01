import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, LeaveBalanceModel, LeaveRequestModel, LeaveTypeModel } from "@/server/db/models";
import { assertInOrganization } from "@/server/db/assert-in-organization";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError } from "@/shared/errors";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";
import type { CreateLeaveBalanceInput } from "@/shared/validation/leave";

export type LeaveBalanceSummary = {
  balanceId: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  entitledDays: number;
  adjustmentDays: number;
  usedDays: number;
  pendingDays: number;
  unlimited: boolean;
  /** null when the balance is unlimited. */
  availableDays: number | null;
};

export const LeaveBalanceService = {
  async create(input: CreateLeaveBalanceInput, actor: { userId?: string }) {
    await connectMongoDB();
    await assertInOrganization(EmployeeModel, input.employeeId, input.organizationId, "Employee");
    await assertInOrganization(LeaveTypeModel, input.leaveTypeId, input.organizationId, "Leave type");

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

  /** Every balance ever granted to this employee, across all years — the per-employee view on /people/[id]. */
  async listForEmployee(employeeId: string, organizationId: string) {
    await connectMongoDB();
    return LeaveBalanceModel.find({
      employeeId: new Types.ObjectId(employeeId),
      organizationId: new Types.ObjectId(organizationId),
    })
      .sort({ year: -1 })
      .lean();
  },

  /**
   * Every balance for a year with what's been used (approved), what's
   * waiting (pending) and what's left, from two queries: the whole-roster
   * view on Leave › Balances. Requests count toward the year they start in,
   * the same rule as getAvailable. Unlimited balances have no "available".
   */
  async summarizeForYear(organizationId: string, year: number): Promise<LeaveBalanceSummary[]> {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);
    const [balances, requests] = await Promise.all([
      LeaveBalanceModel.find({ organizationId: orgObjectId, year }).lean(),
      LeaveRequestModel.find({
        organizationId: orgObjectId,
        status: { $in: ["approved", "pending"] },
        startDate: { $gte: new Date(Date.UTC(year, 0, 1)), $lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) },
      })
        .select("employeeId leaveTypeId status totalDays")
        .lean(),
    ]);

    const daysByKey = new Map<string, { used: number; pending: number }>();
    for (const request of requests) {
      const key = `${request.employeeId.toString()}|${request.leaveTypeId.toString()}`;
      const entry = daysByKey.get(key) ?? { used: 0, pending: 0 };
      if (request.status === "approved") entry.used += request.totalDays;
      else entry.pending += request.totalDays;
      daysByKey.set(key, entry);
    }

    return balances.map((balance) => {
      const employeeId = balance.employeeId.toString();
      const leaveTypeId = balance.leaveTypeId.toString();
      const days = daysByKey.get(`${employeeId}|${leaveTypeId}`) ?? { used: 0, pending: 0 };
      return {
        balanceId: balance._id.toString(),
        employeeId,
        leaveTypeId,
        year: balance.year,
        entitledDays: balance.entitledDays,
        adjustmentDays: balance.adjustmentDays,
        usedDays: days.used,
        pendingDays: days.pending,
        unlimited: balance.hasNoFixedAmount,
        availableDays: balance.hasNoFixedAmount ? null : balance.entitledDays + balance.adjustmentDays - days.used,
      };
    });
  },

  /**
   * Opens a leave type for the year for every current employee who doesn't
   * have it yet (how HR usually starts a year), skipping anyone who does.
   * One audit entry for the batch, plus the usual one per balance created.
   */
  async grantMissing(
    input: { organizationId: string; leaveTypeId: string; year: number; entitledDays?: number; hasNoFixedAmount?: boolean },
    actor: { userId?: string },
  ) {
    await connectMongoDB();
    await assertInOrganization(LeaveTypeModel, input.leaveTypeId, input.organizationId, "Leave type");
    const [roster, isCurrentStaff, existing] = await Promise.all([
      EmployeeService.listWithCurrentStatus(input.organizationId),
      loadCurrentStaffCheck(input.organizationId),
      LeaveBalanceModel.find({ organizationId: new Types.ObjectId(input.organizationId), leaveTypeId: new Types.ObjectId(input.leaveTypeId), year: input.year })
        .select("employeeId")
        .lean(),
    ]);
    const alreadyHas = new Set(existing.map((balance) => balance.employeeId.toString()));
    const staff = roster.filter((row) => isCurrentStaff(row.currentEmployment?.status));

    let granted = 0;
    for (const employee of staff) {
      if (alreadyHas.has(employee._id.toString())) continue;
      await this.create(
        { organizationId: input.organizationId, employeeId: employee._id.toString(), leaveTypeId: input.leaveTypeId, year: input.year, entitledDays: input.entitledDays, hasNoFixedAmount: input.hasNoFixedAmount },
        actor,
      );
      granted += 1;
    }
    const alreadyHad = staff.filter((employee) => alreadyHas.has(employee._id.toString())).length;

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "leave-balance.granted-in-bulk",
      resourceType: "LeaveType",
      resourceId: input.leaveTypeId,
      after: { granted },
      metadata: { granted, alreadyHad, year: input.year, entitledDays: input.hasNoFixedAmount ? null : input.entitledDays, unlimited: Boolean(input.hasNoFixedAmount) },
    });

    return { granted, alreadyHad };
  },

  /**
   * entitledDays + adjustmentDays - sum(approved requests' totalDays) for
   * this employee/leaveType/year. "Used" is derived, not stored, so there's
   * exactly one source of truth for consumption (see LeaveBalance model).
   * With `countPending`, days already asked for (pending) count as used too,
   * so two requests can't each claim the same remaining days.
   */
  async getAvailable(params: { organizationId: string; employeeId: string; leaveTypeId: string; year: number; countPending?: boolean }) {
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
      status: params.countPending ? { $in: ["approved", "pending"] } : "approved",
      startDate: { $gte: yearStart, $lte: yearEnd },
    }).lean();
    const used = approvedRequests.reduce((sum, request) => sum + request.totalDays, 0);

    return entitled - used;
  },
};
