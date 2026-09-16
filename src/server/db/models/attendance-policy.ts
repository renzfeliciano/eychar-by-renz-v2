import { Schema, model, models, type InferSchemaType } from "mongoose";

// Strongly typed, not generic JSON (AGENTS.md §25). Org-wide by default;
// an optional projectId makes this an override, resolved explicitly by
// AttendancePolicyService.resolve() rather than an implicit hierarchy
// applied to every domain (AGENTS.md §26).
const attendancePolicySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    name: { type: String, required: true, trim: true },
    standardStartTime: { type: String, required: true, trim: true },
    standardEndTime: { type: String, required: true, trim: true },
    gracePeriodMinutes: { type: Number, required: true, default: 0 },
    workDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

attendancePolicySchema.index({ organizationId: 1, projectId: 1 });

export type AttendancePolicy = InferSchemaType<typeof attendancePolicySchema>;

export const AttendancePolicyModel =
  models.AttendancePolicy ?? model("AttendancePolicy", attendancePolicySchema);
