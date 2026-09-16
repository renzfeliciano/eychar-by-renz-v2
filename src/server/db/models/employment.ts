import { Schema, model, models, type InferSchemaType } from "mongoose";

// A rehire is just a new Employment row with effectiveFrom after the prior
// row's effectiveTo — no special "rehire" flag (AGENTS.md §14). No
// compensation fields here: that's Payroll's PayrollPolicy/PayrollRecord
// territory (Phase 7), not Employment's.
const employmentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    // Free-form, not a hardcoded enum — employment types genuinely vary by
    // organization/country (AGENTS.md §14/§55).
    employmentType: { type: String, required: true, trim: true },
    status: { type: String, enum: ["active", "on_leave", "terminated"], default: "active", required: true },
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
