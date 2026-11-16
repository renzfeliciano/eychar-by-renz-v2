import { Schema, model, models, type InferSchemaType } from "mongoose";

// One PRC professional license on a person's record: the profession (a code from the PrcProfession catalog,
// checked by ProfessionalLicenseRecordService, not by a schema enum), the license number, and when it expires.
// Several per person, and several per profession (a renewed license), so there is no unique index.
// It belongs to the Person (it follows a rehire).
const professionalLicenseRecordSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    personId: { type: Schema.Types.ObjectId, required: true, ref: "Person" },
    professionCode: { type: String, required: true, trim: true },
    licenseNumber: { type: String, required: true, trim: true, maxlength: 50 },
    validUntil: { type: Date },
  },
  { timestamps: true },
);

professionalLicenseRecordSchema.index({ organizationId: 1, personId: 1 });
// The dashboard looks for licenses about to expire across the organization (IdExpiryService).
professionalLicenseRecordSchema.index({ organizationId: 1, validUntil: 1 });

export type ProfessionalLicenseRecord = InferSchemaType<typeof professionalLicenseRecordSchema>;

export const ProfessionalLicenseRecordModel = models.ProfessionalLicenseRecord ?? model("ProfessionalLicenseRecord", professionalLicenseRecordSchema);
