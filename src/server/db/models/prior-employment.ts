import { Schema, model, models, type InferSchemaType } from "mongoose";

// What another employer paid and withheld for an employee in a year, copied by HR from that employer's
// Form 2316 (payroll plan Phase 4, §5 item 3). The year-end annualization adds it in, and any entry means
// the employee had two or more employers that year, so they file their own return (not on Annex F).
// Editable only until that year's year-end run is approved: after that it is part of a frozen snapshot.
const priorEmploymentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    year: { type: Number, required: true, min: 2000, max: 2100 },
    employerName: { type: String, required: true, trim: true },
    employerTin: { type: String, trim: true },
    employerAddress: { type: String, trim: true },
    employerZipCode: { type: String, trim: true },
    // Date keys (YYYY-MM-DD), within the year.
    periodFrom: { type: String },
    periodTo: { type: String },
    taxableCompensation: { type: Number, required: true, min: 0 },
    nonTaxableCompensation: { type: Number, required: true, min: 0, default: 0 },
    taxWithheld: { type: Number, required: true, min: 0, default: 0 },
    // Worked for that employer at the same time (this employer is then the secondary one on the form).
    concurrent: { type: Boolean, required: true, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

priorEmploymentSchema.index({ organizationId: 1, year: 1, employeeId: 1 });

export type PriorEmployment = InferSchemaType<typeof priorEmploymentSchema>;

export const PriorEmploymentModel = models.PriorEmployment ?? model("PriorEmployment", priorEmploymentSchema);
