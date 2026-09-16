import { Schema, model, models, type InferSchemaType } from "mongoose";

// Written internally by PayrollService.generateRun() from its input
// payload — no separate CRUD API. category is free-form (AGENTS.md §10),
// not a hardcoded enum, so an organization can add its own beyond the
// common ones (overtime, holiday_pay, night_differential, bonus,
// thirteenth_month, loan, other). direction says which way amount (always
// positive) moves net pay, kept explicit rather than relying on a signed
// amount, which is easy to get backwards at the call site.
const payrollAdjustmentSchema = new Schema(
  {
    payrollRunId: { type: Schema.Types.ObjectId, required: true, ref: "PayrollRun" },
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    category: { type: String, required: true, trim: true },
    direction: { type: String, enum: ["addition", "deduction"], required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
  },
  { timestamps: true },
);

payrollAdjustmentSchema.index({ payrollRunId: 1, employeeId: 1 });

export type PayrollAdjustment = InferSchemaType<typeof payrollAdjustmentSchema>;

export const PayrollAdjustmentModel =
  models.PayrollAdjustment ?? model("PayrollAdjustment", payrollAdjustmentSchema);
