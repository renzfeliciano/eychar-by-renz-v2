import { Schema, model, models, type InferSchemaType } from "mongoose";

// `stage` is a plain string, validated at the service boundary against the
// org's "recruitment-stage" CatalogItem list (sortOrder/isTerminal driven,
// not a hardcoded array) — see ApplicantService.
const applicantSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    jobOpeningId: { type: Schema.Types.ObjectId, required: true, ref: "JobOpening" },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    stage: { type: String, required: true, trim: true, default: "applied" },
    appliedAt: { type: Date, required: true, default: () => new Date() },
    notes: { type: String, trim: true },
    rejectionReason: { type: String, trim: true },
    // Set only once hire() succeeds — closes the loop back to Workforce.
    hiredEmployeeId: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true },
);

applicantSchema.index({ organizationId: 1, jobOpeningId: 1 });
applicantSchema.index({ organizationId: 1, stage: 1 });

export type Applicant = InferSchemaType<typeof applicantSchema>;

export const ApplicantModel = models.Applicant ?? model("Applicant", applicantSchema);
