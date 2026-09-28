import { Schema, model, models, type InferSchemaType } from "mongoose";

export const PAYROLL_RUN_STATUSES = ["draft", "submitted", "approved", "released", "cancelled"] as const;

const historyEntrySchema = new Schema(
  {
    action: { type: String, required: true },
    status: { type: String, enum: PAYROLL_RUN_STATUSES, required: true },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const exclusionSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    employeeName: { type: String, required: true },
    reason: { type: String, required: true },
  },
  { _id: false },
);

// One payroll for one scope (the whole organization, or one project) and
// one period. Lifecycle (ADR-029): draft (recompute and edit adjustments
// freely) → submitted → approved (or returned to draft with a reason) →
// released (paid, locked). Cancelled at any point before approval, with a
// reason; runs are never deleted. policyId/ruleVersionId are snapshotted
// so the run always shows exactly what it was computed with (§28).
const payrollRunSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    runNumber: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    payFrequency: { type: String, enum: ["weekly", "semi-monthly", "monthly"], required: true },
    payPeriodStart: { type: Date, required: true },
    payPeriodEnd: { type: Date, required: true },
    payDate: { type: Date, required: true },
    policyId: { type: Schema.Types.ObjectId, required: true, ref: "PayrollPolicy" },
    ruleVersionId: { type: Schema.Types.ObjectId, required: true, ref: "PayrollRuleVersion" },
    status: { type: String, enum: PAYROLL_RUN_STATUSES, required: true, default: "draft" },
    source: {
      type: new Schema(
        { type: { type: String, enum: ["manual", "schedule"], required: true }, scheduleId: { type: Schema.Types.ObjectId, ref: "PayrollSchedule" } },
        { _id: false },
      ),
      default: () => ({ type: "manual" }),
    },
    totals: {
      type: new Schema(
        {
          employees: { type: Number, default: 0 },
          grossPay: { type: Number, default: 0 },
          employeeContributions: { type: Number, default: 0 },
          employerContributions: { type: Number, default: 0 },
          tax: { type: Number, default: 0 },
          otherDeductions: { type: Number, default: 0 },
          netPay: { type: Number, default: 0 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    exclusions: { type: [exclusionSchema], default: [] },
    blockingIssues: { type: Number, default: 0 },
    warningCount: { type: Number, default: 0 },
    computedAt: { type: Date },
    preparedBy: { type: Schema.Types.ObjectId, ref: "User" },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
    submittedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    releasedBy: { type: Schema.Types.ObjectId, ref: "User" },
    releasedAt: { type: Date },
    releasedOn: { type: Date },
    paymentReference: { type: String, trim: true },
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true },
    history: { type: [historyEntrySchema], default: [] },
  },
  { timestamps: true },
);

payrollRunSchema.index({ organizationId: 1, payPeriodStart: 1 });
payrollRunSchema.index({ organizationId: 1, runNumber: 1 }, { unique: true });

export type PayrollRun = InferSchemaType<typeof payrollRunSchema>;

export const PayrollRunModel = models.PayrollRun ?? model("PayrollRun", payrollRunSchema);
