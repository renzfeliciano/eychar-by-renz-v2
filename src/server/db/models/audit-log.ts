import { Schema, model, models, type InferSchemaType } from "mongoose";

// Append-only: no update/delete API is exposed anywhere over this model
// (AGENTS.md §35). Historical org state is reconstructed from
// effective-dated domain records, not from this log.
const auditLogSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true, trim: true },
    resourceType: { type: String, required: true, trim: true },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    timestamp: { type: Date, required: true, default: () => new Date() },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: false },
);

auditLogSchema.index({ organizationId: 1, timestamp: -1 });
auditLogSchema.index({ organizationId: 1, resourceType: 1, resourceId: 1 });

export type AuditLog = InferSchemaType<typeof auditLogSchema>;

export const AuditLogModel = models.AuditLog ?? model("AuditLog", auditLogSchema);
