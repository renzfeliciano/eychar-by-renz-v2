import { Schema, model, models, type InferSchemaType } from "mongoose";
import { PAY_PREMIUM_DEFAULTS } from "@/domains/payroll/engine/premiums";

// How pay is computed for an organization, or a project that overrides it
// (resolved via the shared resolveOrgProjectPolicy(), AGENTS.md §26).
// The numbers that vary by country (tax, contributions) live in
// PayrollRuleVersion instead.
const payrollPolicySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    name: { type: String, required: true, trim: true },
    payFrequency: { type: String, enum: ["weekly", "semi-monthly", "monthly"], required: true },
    // Paid workdays a year: turns a monthly rate into a daily one (261 for a
    // 5-day week, 313 for a 6-day week) and a daily rate into a monthly
    // equivalent for contributions.
    workDaysPerYear: { type: Number, required: true, min: 1, max: 366, default: 261 },
    hoursPerDay: { type: Number, required: true, min: 1, max: 24, default: 8 },
    // Final pay is due this many days after separation (PH default: 30, DOLE Labor Advisory No. 06-2020).
    finalPayDeadlineDays: { type: Number, required: true, min: 1, max: 365, default: 30 },
    // Workdays counted in a period (0 = Sunday … 6 = Saturday).
    workWeekDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    deductLateAndUndertime: { type: Boolean, required: true, default: true },
    // Premiums and the 13th month divisor (seeded defaults in PAY_PREMIUM_DEFAULTS). Not
    // required: policies saved before these existed read as the defaults.
    overtimeMultiplier: { type: Number, min: 1, max: 5, default: PAY_PREMIUM_DEFAULTS.overtimeMultiplier },
    restDayMultiplier: { type: Number, min: 1, max: 5, default: PAY_PREMIUM_DEFAULTS.restDayMultiplier },
    thirteenthMonthDivisor: { type: Number, min: 1, max: 24, default: PAY_PREMIUM_DEFAULTS.thirteenthMonthDivisor },
    // Split the month's contributions across cutoffs, or deduct them whole on the month's last cutoff.
    contributionTiming: { type: String, enum: ["every_cutoff", "last_cutoff_of_month"], required: true, default: "every_cutoff" },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

payrollPolicySchema.index({ organizationId: 1, projectId: 1 });

export type PayrollPolicy = InferSchemaType<typeof payrollPolicySchema>;

export const PayrollPolicyModel = models.PayrollPolicy ?? model("PayrollPolicy", payrollPolicySchema);
