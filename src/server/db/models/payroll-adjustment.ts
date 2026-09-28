import { Schema, model, models, type InferSchemaType } from "mongoose";

// HR-entered payroll inputs for one employee in one draft run: overtime,
// holiday pay, night differential, bonuses, 13th month, loans, cash
// advances (ADR-014 decision 1: what attendance can't derive). Editable
// only while the run is a draft; each change recomputes the run.
// `category` is free-form (AGENTS.md §10), with suggested codes in
// adjustment-categories.ts; `amount` is always positive and `direction`
// says which way it moves pay.
const payrollAdjustmentSchema = new Schema(
  {
    payrollRunId: { type: Schema.Types.ObjectId, required: true, ref: "PayrollRun" },
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    category: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    direction: { type: String, enum: ["earning", "deduction"], required: true },
    amount: { type: Number, required: true, min: 0 },
    taxable: { type: Boolean, required: true, default: false },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

payrollAdjustmentSchema.index({ payrollRunId: 1, employeeId: 1 });

export type PayrollAdjustment = InferSchemaType<typeof payrollAdjustmentSchema>;

export const PayrollAdjustmentModel = models.PayrollAdjustment ?? model("PayrollAdjustment", payrollAdjustmentSchema);
