import { Schema, model, models, type InferSchemaType } from "mongoose";

// `shift` snapshots the template as it was when HR scheduled the day, so
// editing a template's times later never silently rewrites a published or
// exported month (same reasoning as AttendanceRecord.policyId — history is
// preserved, not recomputed). shiftTemplateId stays for "which template was
// this" lookups.
const scheduledShiftSchema = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ["work", "rest"], required: true },
    startTime: { type: String },
    endTime: { type: String },
  },
  { _id: false },
);

// One entry per employee per calendar day (unique index). `date` is UTC
// midnight of the organization's local calendar day, matching how HR reads
// the month. Reference-only (ADR-027): it does not drive late/present.
const scheduleEntrySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    date: { type: Date, required: true },
    shiftTemplateId: { type: Schema.Types.ObjectId, required: true, ref: "ShiftTemplate" },
    shift: { type: scheduledShiftSchema, required: true },
    // Where they're scheduled to work that day; never set on rest days.
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
  },
  { timestamps: true },
);

scheduleEntrySchema.index({ organizationId: 1, employeeId: 1, date: 1 }, { unique: true });
scheduleEntrySchema.index({ organizationId: 1, date: 1 });

export type ScheduleEntry = InferSchemaType<typeof scheduleEntrySchema>;

export const ScheduleEntryModel = models.ScheduleEntry ?? model("ScheduleEntry", scheduleEntrySchema);
