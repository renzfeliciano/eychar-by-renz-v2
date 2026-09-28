import { Schema, model, models, type InferSchemaType } from "mongoose";

const earningLineSchema = new Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
    amount: { type: Number, required: true },
    taxable: { type: Boolean, required: true },
  },
  { _id: false },
);

const deductionLineSchema = new Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false },
);

const contributionLineSchema = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    employee: { type: Number, required: true },
    employer: { type: Number, required: true },
    extra: { type: Number, required: true, default: 0 },
    extraLabel: { type: String },
  },
  { _id: false },
);

const warningSchema = new Schema(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
    blocking: { type: Boolean, required: true },
  },
  { _id: false },
);

// One employee's payslip in one run: every figure computed once and stored,
// with the inputs (rate, attendance) that produced it, so it can be
// explained and reproduced later (AGENTS.md §28). Name and number are
// snapshotted too: the payslip reads the same after a later rename.
const payrollRecordSchema = new Schema(
  {
    payrollRunId: { type: Schema.Types.ObjectId, required: true, ref: "PayrollRun" },
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    employeeNumber: { type: String, required: true },
    employeeName: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    compensationId: { type: Schema.Types.ObjectId, ref: "Compensation" },
    rateType: { type: String, enum: ["monthly", "daily"], required: true },
    rate: { type: Number, required: true },
    monthlyBasic: { type: Number, required: true },
    dailyRate: { type: Number, required: true },
    hourlyRate: { type: Number, required: true },
    attendance: {
      type: new Schema(
        {
          scheduledDays: Number,
          eligibleDays: Number,
          daysWorked: Number,
          paidLeaveDays: Number,
          absentDays: Number,
          missingDays: Number,
          restDaysWorked: Number,
          lateMinutes: Number,
          undertimeMinutes: Number,
        },
        { _id: false },
      ),
      required: true,
    },
    earnings: { type: [earningLineSchema], default: [] },
    contributions: { type: [contributionLineSchema], default: [] },
    deductions: { type: [deductionLineSchema], default: [] },
    grossPay: { type: Number, required: true },
    taxableIncome: { type: Number, required: true },
    tax: { type: Number, required: true },
    employeeContributions: { type: Number, required: true },
    employerContributions: { type: Number, required: true },
    totalDeductions: { type: Number, required: true },
    netPay: { type: Number, required: true },
    previousNetPay: { type: Number },
    warnings: { type: [warningSchema], default: [] },
  },
  { timestamps: true },
);

payrollRecordSchema.index({ payrollRunId: 1, employeeId: 1 }, { unique: true });
payrollRecordSchema.index({ organizationId: 1, employeeId: 1 });

export type PayrollRecord = InferSchemaType<typeof payrollRecordSchema>;

export const PayrollRecordModel = models.PayrollRecord ?? model("PayrollRecord", payrollRecordSchema);
