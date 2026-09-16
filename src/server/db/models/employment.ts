import { Schema, model, models, type InferSchemaType } from "mongoose";

// A rehire is just a new Employment row with effectiveFrom after the prior
// row's effectiveTo — no special "rehire" flag (AGENTS.md §14). No
// compensation fields here: that's Payroll's PayrollPolicy/PayrollRecord
// territory (Phase 7), not Employment's.
const employmentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    // Both fields are plain strings, validated at the service boundary
    // against the org's EmploymentType/EmploymentStatus collections
    // (EmploymentTypeService/EmploymentStatusService.assertValidCode)
    // instead of a hardcoded Mongoose enum — employment types genuinely
    // vary by organization/country (AGENTS.md §14/§55), and an org can add
    // "Resigned"/"AWOL" etc. via Settings without a schema change.
    employmentType: { type: String, required: true, trim: true },
    status: { type: String, required: true, trim: true, default: "active" },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
    terminationReason: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

employmentSchema.index({ employeeId: 1, effectiveFrom: 1 });

export type Employment = InferSchemaType<typeof employmentSchema>;

export const EmploymentModel = models.Employment ?? model("Employment", employmentSchema);
