import { Schema, model, models, type InferSchemaType } from "mongoose";

// policyId/ruleVersionId are snapshotted at generation time — a run keeps
// showing exactly what was used even after the organization's active
// policy/rule version later changes (AGENTS.md §28 reproducibility).
const payrollRunSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    payPeriodStart: { type: Date, required: true },
    payPeriodEnd: { type: Date, required: true },
    policyId: { type: Schema.Types.ObjectId, required: true, ref: "PayrollPolicy" },
    ruleVersionId: { type: Schema.Types.ObjectId, required: true, ref: "PayrollRuleVersion" },
    status: { type: String, enum: ["completed", "approved"], default: "completed", required: true },
    generatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
  },
  { timestamps: true },
);

payrollRunSchema.index({ organizationId: 1, payPeriodStart: 1 });

export type PayrollRun = InferSchemaType<typeof payrollRunSchema>;

export const PayrollRunModel = models.PayrollRun ?? model("PayrollRun", payrollRunSchema);
