import { Schema, model, models, type InferSchemaType } from "mongoose";
import { hiddenPlugin } from "../hidden-plugin";

// `stage` is a plain string, validated at the service boundary against the
// org's RecruitmentStage catalog — free-form movement to any configured
// stage (no forward-only/terminal restriction), matching the legacy v1
// app's plain "Move to" dropdown. Applicants reference a Position directly
// (no separate JobOpening/headcount layer, again matching v1).
const applicantSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    positionId: { type: Schema.Types.ObjectId, required: true, ref: "Position" },
    applicantName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    stage: { type: String, required: true, trim: true, default: "applied" },
    appliedDate: { type: Date, required: true },
    remarks: { type: String, trim: true },
  },
  { timestamps: true },
);

applicantSchema.index({ organizationId: 1, positionId: 1 });
applicantSchema.index({ organizationId: 1, stage: 1 });

// Test data the Super Administrator hid is left out of reads for everyone else (ADR-034).
applicantSchema.plugin(hiddenPlugin);

export type Applicant = InferSchemaType<typeof applicantSchema>;

export const ApplicantModel = models.Applicant ?? model("Applicant", applicantSchema);
