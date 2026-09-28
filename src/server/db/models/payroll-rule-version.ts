import { Schema, model, models, type InferSchemaType } from "mongoose";

// Country-specific numbers as DATA, never as formulas in code (AGENTS.md
// §28). Typed subdocuments, not Mixed (§25). Never edited in place: a
// correction is a new version, so a past run's ruleVersionId keeps pointing
// at exactly what it used.
const taxBracketSchema = new Schema(
  {
    minIncome: { type: Number, required: true, min: 0 },
    maxIncome: { type: Number },
    rate: { type: Number, required: true, min: 0, max: 1 },
    baseDeduction: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const taxTableSchema = new Schema(
  {
    payFrequency: { type: String, enum: ["weekly", "semi-monthly", "monthly"], required: true },
    brackets: { type: [taxBracketSchema], default: [] },
  },
  { _id: false },
);

// A salary range, then either fixed amounts (e.g. SSS) or rates on the
// clamped base (e.g. PhilHealth, Pag-IBIG). extraAmount is an employer-only
// add-on such as SSS's EC.
const contributionRowSchema = new Schema(
  {
    from: { type: Number, required: true, min: 0 },
    to: { type: Number },
    employeeRate: { type: Number, min: 0, max: 1 },
    employerRate: { type: Number, min: 0, max: 1 },
    employeeAmount: { type: Number, min: 0 },
    employerAmount: { type: Number, min: 0 },
    extraAmount: { type: Number, min: 0 },
  },
  { _id: false },
);

const contributionRuleSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    floor: { type: Number, min: 0 },
    ceiling: { type: Number, min: 0 },
    extraLabel: { type: String, trim: true },
    rows: { type: [contributionRowSchema], default: [] },
  },
  { _id: false },
);

const payrollRuleVersionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    versionNumber: { type: Number, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    taxTables: { type: [taxTableSchema], default: [] },
    contributions: { type: [contributionRuleSchema], default: [] },
    basedOnVersionId: { type: Schema.Types.ObjectId, ref: "PayrollRuleVersion" },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

payrollRuleVersionSchema.index({ organizationId: 1, projectId: 1 });
payrollRuleVersionSchema.index({ organizationId: 1, versionNumber: 1 }, { unique: true });

export type PayrollRuleVersion = InferSchemaType<typeof payrollRuleVersionSchema>;

export const PayrollRuleVersionModel = models.PayrollRuleVersion ?? model("PayrollRuleVersion", payrollRuleVersionSchema);
