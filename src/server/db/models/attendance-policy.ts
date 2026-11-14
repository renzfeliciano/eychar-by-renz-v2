import { Schema, model, models, type InferSchemaType } from "mongoose";

// Strongly typed, not generic JSON (ENGINEERING.md §25). Org-wide by default;
// an optional projectId makes this an override, resolved explicitly by
// AttendancePolicyService.resolve() rather than an implicit hierarchy
// applied to every domain (ENGINEERING.md §26).
const attendancePolicySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    name: { type: String, required: true, trim: true },
    standardStartTime: { type: String, required: true, trim: true },
    standardEndTime: { type: String, required: true, trim: true },
    gracePeriodMinutes: { type: Number, required: true, default: 0 },
    workDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    // Time rules for the day calculation (src/domains/attendance/day-calc.ts).
    // Optional, with no schema default, so policies saved before they existed
    // stay as they were; timeRulesOf fills the defaults on read.
    breakMinutes: { type: Number, min: 0 },
    roundingMinutes: { type: Number, min: 0 },
    nightStartTime: { type: String, trim: true },
    nightEndTime: { type: String, trim: true },
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
