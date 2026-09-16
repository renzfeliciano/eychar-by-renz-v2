import { Schema, model, models, type InferSchemaType } from "mongoose";

// Country-specific numbers live here as DATA, never as hardcoded formulas
// in application code (AGENTS.md §28: "Do NOT hardcode salary * 0.05").
// Typed arrays of typed subdocuments, not Mixed (AGENTS.md §25) — strongly
// typed, still pure data. Never edited in place: a correction creates a new
// version with a later effectiveFrom (same transfer-mechanic spirit as
// EmployeeAssignment) so a past PayrollRun's snapshotted ruleVersionId
// keeps pointing at exactly what was used, satisfying §28's reproducibility
// requirement.
const taxBracketSchema = new Schema(
  {
    minIncome: { type: Number, required: true, min: 0 },
    maxIncome: { type: Number },
    rate: { type: Number, required: true, min: 0, max: 1 },
    baseDeduction: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const statutoryContributionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    employeeRate: { type: Number, required: true, min: 0, max: 1 },
    employerRate: { type: Number, min: 0, max: 1 },
    cap: { type: Number },
  },
  { _id: false },
);

const payrollRuleVersionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    versionNumber: { type: Number, required: true },
    description: { type: String, trim: true },
    taxBrackets: { type: [taxBracketSchema], default: [] },
    statutoryContributions: { type: [statutoryContributionSchema], default: [] },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

payrollRuleVersionSchema.index({ organizationId: 1, projectId: 1 });
payrollRuleVersionSchema.index({ organizationId: 1, versionNumber: 1 }, { unique: true });

export type PayrollRuleVersion = InferSchemaType<typeof payrollRuleVersionSchema>;

export const PayrollRuleVersionModel =
  models.PayrollRuleVersion ?? model("PayrollRuleVersion", payrollRuleVersionSchema);
