import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel } from "@/server/db/models";

export type AuditRecordInput = {
  organizationId: string;
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

/**
 * Append-only audit trail (AGENTS.md §35). Intentionally exposes only
 * `record` — no update/delete, so an entry can never be edited through
 * normal application code once written.
 */
export const AuditService = {
  async record(input: AuditRecordInput): Promise<void> {
    await connectMongoDB();
    await AuditLogModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      actorUserId: input.actorUserId ? new Types.ObjectId(input.actorUserId) : undefined,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: new Types.ObjectId(input.resourceId),
      before: input.before,
      after: input.after,
      metadata: input.metadata,
    });
  },
};
