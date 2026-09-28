import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel } from "@/server/db/models";
import { userDisplayNames } from "@/domains/identity/user-directory";

export type AuditFilters = {
  /** The part of the action before the dot: "auth", "payroll-run", "leave-request", … */
  area?: string;
  resourceType?: string;
  actorUserId?: string;
  /** Local calendar days, YYYY-MM-DD, both included. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type AuditRow = {
  id: string;
  timestamp: Date;
  action: string;
  resourceType: string;
  resourceId: string;
  actorUserId: string | null;
  actorName: string;
  before: unknown;
  after: unknown;
  metadata: unknown;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Reading the append-only audit trail (the writer is AuditService): newest
 * first, filtered and paged, with actors shown by name.
 */
export const AuditQueryService = {
  async list(organizationId: string, filters: AuditFilters): Promise<{ rows: AuditRow[]; total: number; page: number; pageSize: number }> {
    await connectMongoDB();
    const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);

    const query: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (filters.area) query.action = { $regex: `^${escapeRegex(filters.area)}\\.` };
    if (filters.resourceType) query.resourceType = filters.resourceType;
    if (filters.actorUserId && Types.ObjectId.isValid(filters.actorUserId)) query.actorUserId = new Types.ObjectId(filters.actorUserId);
    if (filters.from || filters.to) {
      const range: Record<string, Date> = {};
      if (filters.from) range.$gte = new Date(`${filters.from}T00:00:00`);
      if (filters.to) range.$lte = new Date(`${filters.to}T23:59:59.999`);
      query.timestamp = range;
    }

    const [entries, total] = await Promise.all([
      AuditLogModel.find(query).sort({ timestamp: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      AuditLogModel.countDocuments(query),
    ]);
    const names = await userDisplayNames(entries.map((entry) => entry.actorUserId));

    return {
      total,
      page,
      pageSize,
      rows: entries.map((entry) => ({
        id: entry._id.toString(),
        timestamp: entry.timestamp,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId.toString(),
        actorUserId: entry.actorUserId?.toString() ?? null,
        actorName: entry.actorUserId ? (names.get(entry.actorUserId.toString()) ?? "Deleted account") : "System",
        before: entry.before ?? null,
        after: entry.after ?? null,
        metadata: entry.metadata ?? null,
      })),
    };
  },

  /** How many entries match, optionally only these actions, within local calendar days. */
  async count(organizationId: string, { actions, from, to }: { actions?: string[]; from?: string; to?: string }): Promise<number> {
    await connectMongoDB();
    const query: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (actions?.length) query.action = { $in: actions };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.$gte = new Date(`${from}T00:00:00`);
      if (to) range.$lte = new Date(`${to}T23:59:59.999`);
      query.timestamp = range;
    }
    return AuditLogModel.countDocuments(query);
  },

  /** The areas with at least one entry, for the filter menu. */
  async areas(organizationId: string): Promise<string[]> {
    await connectMongoDB();
    const actions: string[] = await AuditLogModel.distinct("action", { organizationId: new Types.ObjectId(organizationId) });
    return [...new Set(actions.map((action) => action.split(".")[0]))].sort();
  },

  /** An account's own recent sign-in and security events, for its Security page. */
  async recentSecurityEvents(userId: string, limit = 10) {
    await connectMongoDB();
    return AuditLogModel.find({ resourceType: "User", resourceId: new Types.ObjectId(userId), action: { $regex: "^auth\\." } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  },
};
