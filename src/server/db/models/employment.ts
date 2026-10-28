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
    // Only meaningful for employment types whose catalog item has
    // metadata.requiresEndOfContract (e.g. Contractual/Probationary) —
    // enforced at the service boundary, not a hardcoded status list.
    endOfContract: { type: Date },
    // Changes of terms within this employment (regularization, a renewed
    // contract), oldest first (ADR-052). The same employment continues, so
    // effectiveFrom stays the hire date; each entry records what applied
    // from when, and what it replaced.
    termsHistory: {
      type: [
        new Schema(
          {
            employmentType: { type: String, required: true, trim: true },
            endOfContract: { type: Date },
            effectiveFrom: { type: Date, required: true },
            previousEmploymentType: { type: String, required: true, trim: true },
            previousEndOfContract: { type: Date },
            note: { type: String, trim: true },
            changedBy: { type: Schema.Types.ObjectId, ref: "User" },
            changedAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    terminationReason: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

employmentSchema.index({ employeeId: 1, effectiveFrom: 1 });

export type Employment = InferSchemaType<typeof employmentSchema>;

export const EmploymentModel = models.Employment ?? model("Employment", employmentSchema);
