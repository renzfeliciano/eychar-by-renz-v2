import { Schema, model, models, type InferSchemaType } from "mongoose";

// Named allowances, each monthly (split across the month's pay periods) or
// per day worked, and taxable or not (de minimis benefits such as a rice
// subsidy usually aren't).
const allowanceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    basis: { type: String, enum: ["monthly", "daily"], required: true, default: "monthly" },
    taxable: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

// Effective-dated pay terms, separate from Employment (AGENTS.md §13/§27).
// `rate` is a monthly salary for monthly-rated staff and a daily rate for
// daily-rated staff. Dates are calendar days (UTC midnight): the row applies
// from effectiveFrom through effectiveTo, both included; a change closes
// the current row the day before the new one starts, never editing it, so
// every past payroll run still resolves the terms it actually used.
const compensationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    rateType: { type: String, enum: ["monthly", "daily"], required: true },
    rate: { type: Number, required: true, min: 0 },
    allowances: { type: [allowanceSchema], default: [] },
    // Minimum wage earners are exempt from withholding tax.
    minimumWageEarner: { type: Boolean, required: true, default: false },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    reason: { type: String, trim: true },
    // Rows written together by one bulk change (e.g. a wage order) share this id.
    batchId: { type: String },
  },
  { timestamps: true },
);

compensationSchema.index({ employeeId: 1, effectiveFrom: 1 });
// Pay terms are always looked up within an organization (payroll runs, settlements, bulk changes).
compensationSchema.index({ organizationId: 1, employeeId: 1, effectiveFrom: 1 });
compensationSchema.index({ organizationId: 1, batchId: 1 });

export type Compensation = InferSchemaType<typeof compensationSchema>;

export const CompensationModel = models.Compensation ?? model("Compensation", compensationSchema);
