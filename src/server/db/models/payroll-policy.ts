import { Schema, model, models, type InferSchemaType } from "mongoose";
import { PAY_PREMIUM_DEFAULTS } from "@/domains/payroll/engine/premiums";
import { HOLIDAY_DAY_TYPE_CHOICES } from "@/domains/payroll/holiday-day-types";

// Monthly pay acknowledgement (payroll plan Phase 6): who ticked MONTHLY_PAY_ACKNOWLEDGEMENT, when, and the text they saw.
const monthlyPayAcknowledgementSchema = new Schema(
  {
    by: { type: Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, required: true },
    statement: { type: String, required: true },
  },
  { _id: false },
);

// How pay is computed for an organization, or a project that overrides it
// (resolved via the shared resolveOrgProjectPolicy(), ENGINEERING.md §26).
// The numbers that vary by country (tax, contributions) live in
// PayrollRuleVersion instead.
const payrollPolicySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    name: { type: String, required: true, trim: true },
    payFrequency: { type: String, enum: ["weekly", "bi-weekly", "semi-monthly", "monthly"], required: true },
    // Paid workdays a year: turns a monthly rate into a daily one (261 for a
    // 5-day week, 313 for a 6-day week) and a daily rate into a monthly
    // equivalent for contributions.
    workDaysPerYear: { type: Number, required: true, min: 1, max: 366, default: 261 },
    hoursPerDay: { type: Number, required: true, min: 1, max: 24, default: 8 },
    // Final pay is due this many days after separation (PH default: 30, DOLE Labor Advisory No. 06-2020).
    finalPayDeadlineDays: { type: Number, required: true, min: 1, max: 365, default: 30 },
    // Final pay variance checks (payroll plan Phase 5): per check, blocking, warning or off. Unset checks
    // use FINAL_PAY_CHECK_DEFAULTS (final-settlement/final-pay-checks.ts).
    finalPayChecks: {
      type: [new Schema({ code: { type: String, required: true }, severity: { type: String, enum: ["blocking", "warning", "off"], required: true } }, { _id: false })],
      default: undefined,
    },
    // V4: a pay change this many days or fewer before the last working day is flagged.
    recentPayChangeDays: { type: Number, min: 1, max: 365 },
    // Set when HR chose monthly pay and ticked the acknowledgement (Phase 6). A monthly policy without it is a dashboard risk.
    monthlyPayAcknowledgement: { type: monthlyPayAcknowledgementSchema, default: undefined },
    // Workdays counted in a period (0 = Sunday … 6 = Saturday).
    workWeekDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    deductLateAndUndertime: { type: Boolean, required: true, default: true },
    // Premiums and the 13th month divisor (seeded defaults in PAY_PREMIUM_DEFAULTS). Not
    // required: policies saved before these existed read as the defaults.
    overtimeMultiplier: { type: Number, min: 1, max: 5, default: PAY_PREMIUM_DEFAULTS.overtimeMultiplier },
    restDayMultiplier: { type: Number, min: 1, max: 5, default: PAY_PREMIUM_DEFAULTS.restDayMultiplier },
    thirteenthMonthDivisor: { type: Number, min: 1, max: 24, default: PAY_PREMIUM_DEFAULTS.thirteenthMonthDivisor },
    // Holiday, rest-day overtime and night premiums (attendance plan Phase 5, GATE 3). Same pattern:
    // policies saved before them read as the defaults through payPremiumsOf.
    specialHolidayMultiplier: { type: Number, min: 1, max: 5, default: PAY_PREMIUM_DEFAULTS.specialHolidayMultiplier },
    specialHolidayRestDayMultiplier: { type: Number, min: 1, max: 5, default: PAY_PREMIUM_DEFAULTS.specialHolidayRestDayMultiplier },
    regularHolidayMultiplier: { type: Number, min: 1, max: 5, default: PAY_PREMIUM_DEFAULTS.regularHolidayMultiplier },
    regularHolidayRestDayMultiplier: { type: Number, min: 1, max: 5, default: PAY_PREMIUM_DEFAULTS.regularHolidayRestDayMultiplier },
    premiumOvertimeMultiplier: { type: Number, min: 1, max: 5, default: PAY_PREMIUM_DEFAULTS.premiumOvertimeMultiplier },
    nightDifferentialRate: { type: Number, min: 0, max: 1, default: PAY_PREMIUM_DEFAULTS.nightDifferentialRate },
    // Split the month's contributions across cutoffs, or deduct them whole on the month's last cutoff.
    contributionTiming: { type: String, enum: ["every_cutoff", "last_cutoff_of_month"], required: true, default: "every_cutoff" },
    // 13th month is due on or before this month-day each year (PD 851: December 24). Optional; read with
    // thirteenthMonthPayByOf, which falls back to "12-24".
    thirteenthMonthPayBy: { type: String, match: /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/ },
    // The attendance day type each holiday type counts as (HOLIDAY_DAY_TYPE_DEFAULTS in
    // src/domains/payroll/holiday-day-types.ts). No schema defaults: read with
    // holidayDayTypesOf, which fills whatever a policy leaves unset.
    holidayDayTypes: {
      regular: { type: String, enum: HOLIDAY_DAY_TYPE_CHOICES },
      special_non_working: { type: String, enum: HOLIDAY_DAY_TYPE_CHOICES },
      special_working: { type: String, enum: HOLIDAY_DAY_TYPE_CHOICES },
    },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

payrollPolicySchema.index({ organizationId: 1, projectId: 1 });

export type PayrollPolicy = InferSchemaType<typeof payrollPolicySchema>;

export const PayrollPolicyModel = models.PayrollPolicy ?? model("PayrollPolicy", payrollPolicySchema);
