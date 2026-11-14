import { Schema, model, models, type InferSchemaType } from "mongoose";

// Country-specific numbers as DATA, never as formulas in code (ENGINEERING.md
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

// One box of BIR Form 2316 and the pay lines that land in it (payroll plan Phase 4). Data, because BIR
// renumbers its forms; see engine/year-end-tax.ts for how a line finds its box.
const form2316BoxSchema = new Schema(
  {
    box: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    part: { type: String, enum: ["non_taxable", "taxable"], required: true },
    codes: { type: [String], default: [] },
    minimumWage: { type: String, enum: ["any", "mwe", "non_mwe"], default: "any" },
    taxable: { type: String, enum: ["any", "yes", "no"], default: "any" },
    lessContributions: { type: Boolean, default: false },
    capped: { type: Boolean, default: false },
    overflowTo: { type: String, trim: true },
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
    // Year-end (payroll plan Phase 4): the annual withholding table the December annualization uses,
    // the yearly exemption for 13th month pay and other benefits, and the Form 2316 box map. Optional:
    // a version without an annual table can't be used for a year-end run.
    annualTaxTable: { type: [taxBracketSchema], default: undefined },
    benefitsExemptionCap: { type: Number, min: 0 },
    form2316Boxes: { type: [form2316BoxSchema], default: undefined },
    form2316Excluded: { type: [String], default: undefined },
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
