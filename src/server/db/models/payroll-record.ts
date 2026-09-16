import { Schema, model, models, type InferSchemaType } from "mongoose";

// One per employee per run. Every figure is computed once at generation
// time and stored, never recomputed later against today's policy — same
// "computed and stored, policy reference kept" principle as
// AttendanceRecord (ADR-011).
const statutoryDeductionLineSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    employeeAmount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const payrollRecordSchema = new Schema(
  {
    payrollRunId: { type: Schema.Types.ObjectId, required: true, ref: "PayrollRun" },
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    basicSalary: { type: Number, required: true },
    allowanceAmount: { type: Number, required: true, default: 0 },
    grossPay: { type: Number, required: true },
    taxDeduction: { type: Number, required: true, default: 0 },
    statutoryDeductions: { type: [statutoryDeductionLineSchema], default: [] },
    adjustmentsTotal: { type: Number, required: true, default: 0 },
    netPay: { type: Number, required: true },
  },
  { timestamps: true },
);

payrollRecordSchema.index({ payrollRunId: 1, employeeId: 1 }, { unique: true });

export type PayrollRecord = InferSchemaType<typeof payrollRecordSchema>;

export const PayrollRecordModel = models.PayrollRecord ?? model("PayrollRecord", payrollRecordSchema);
