import { Schema, model, models, type InferSchemaType } from "mongoose";

// Monthly pay acknowledgement (payroll plan Phase 6): who ticked MONTHLY_PAY_ACKNOWLEDGEMENT, when, and the text they saw.
const monthlyPayAcknowledgementSchema = new Schema(
  {
    by: { type: Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, required: true },
    statement: { type: String, required: true },
  },
  { _id: false },
);

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
    payFrequency: { type: String, enum: ["weekly", "bi-weekly", "semi-monthly", "monthly"], required: true },
    cutoffDay: { type: Number, required: true, min: 0, max: 31 },
    // Bi-weekly only: the end of one 14-day period; the others end a multiple of 14 days from it (cutoffDay is its weekday).
    anchorDate: { type: Date },
    payDateOffsetDays: { type: Number, required: true, min: 0, max: 31, default: 5 },
    autoPrepare: { type: Boolean, required: true, default: true },
    // No run is prepared for periods ending before this day.
    startsOn: { type: Date, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    // Monthly only: HR ticked the Art. 103 acknowledgement (payroll plan Phase 6).
    monthlyPayAcknowledgement: { type: monthlyPayAcknowledgementSchema, default: undefined },
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
