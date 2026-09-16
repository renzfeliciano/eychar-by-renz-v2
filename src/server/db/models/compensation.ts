import { Schema, model, models, type InferSchemaType } from "mongoose";

// Deliberately not on Employment (AGENTS.md §13/§27 — Compensation is its
// own effective-dated concept, separate from employment lifecycle status).
// baseSalary is the amount per pay period at whatever payFrequency the
// applicable PayrollPolicy uses — documented pairing, not a fixed currency
// conversion the platform enforces.
const compensationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    baseSalary: { type: Number, required: true, min: 0 },
    allowanceAmount: { type: Number, required: true, default: 0, min: 0 },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

compensationSchema.index({ employeeId: 1, effectiveFrom: 1 });

export type Compensation = InferSchemaType<typeof compensationSchema>;

export const CompensationModel = models.Compensation ?? model("Compensation", compensationSchema);
