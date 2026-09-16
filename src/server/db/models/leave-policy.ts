import { Schema, model, models, type InferSchemaType } from "mongoose";

// Same org-wide-with-project-override shape as AttendancePolicy — resolved
// explicitly by LeavePolicyService.resolve() via the shared
// resolveOrgProjectPolicy() (AGENTS.md §26).
const leavePolicySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    leaveTypeId: { type: Schema.Types.ObjectId, required: true, ref: "LeaveType" },
    name: { type: String, required: true, trim: true },
    annualEntitlementDays: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

leavePolicySchema.index({ organizationId: 1, projectId: 1, leaveTypeId: 1 });

export type LeavePolicy = InferSchemaType<typeof leavePolicySchema>;

export const LeavePolicyModel = models.LeavePolicy ?? model("LeavePolicy", leavePolicySchema);
