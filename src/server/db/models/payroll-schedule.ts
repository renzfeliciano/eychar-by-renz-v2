import { Schema, model, models, type InferSchemaType } from "mongoose";

// A payroll calendar for the organization or one project: its cutoffs
// (see engine/pay-periods.ts for how cutoffDay reads per frequency) and
// pay day. With autoPrepare on, the day after each cutoff a draft run is
// prepared automatically for HR to review (ADR-029); it is never
// submitted or approved on its own.
const payrollScheduleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    name: { type: String, required: true, trim: true },
    payFrequency: { type: String, enum: ["weekly", "semi-monthly", "monthly"], required: true },
    cutoffDay: { type: Number, required: true, min: 0, max: 31 },
    payDateOffsetDays: { type: Number, required: true, min: 0, max: 31, default: 5 },
    autoPrepare: { type: Boolean, required: true, default: true },
    // No run is prepared for periods ending before this day.
    startsOn: { type: Date, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    lastPreparedPeriodEnd: { type: Date },
    lastRunId: { type: Schema.Types.ObjectId, ref: "PayrollRun" },
    lastAttemptAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true },
);

payrollScheduleSchema.index({ organizationId: 1, status: 1 });

export type PayrollSchedule = InferSchemaType<typeof payrollScheduleSchema>;

export const PayrollScheduleModel = models.PayrollSchedule ?? model("PayrollSchedule", payrollScheduleSchema);
