import { Schema, model, models, type InferSchemaType } from "mongoose";

// Same org-wide-with-project-override shape as AttendancePolicy/LeavePolicy —
// resolved via the shared resolveOrgProjectPolicy() (AGENTS.md §26).
// payFrequency is free-form, not a hardcoded enum (AGENTS.md §10) — pay
// cadence genuinely varies by organization ("monthly", "semi-monthly", ...).
const payrollPolicySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    name: { type: String, required: true, trim: true },
    payFrequency: { type: String, required: true, trim: true },
    standardWorkDaysPerPeriod: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

payrollPolicySchema.index({ organizationId: 1, projectId: 1 });

export type PayrollPolicy = InferSchemaType<typeof payrollPolicySchema>;

export const PayrollPolicyModel = models.PayrollPolicy ?? model("PayrollPolicy", payrollPolicySchema);
