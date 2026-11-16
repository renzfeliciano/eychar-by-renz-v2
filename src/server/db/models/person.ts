import { Schema, model, models, type InferSchemaType } from "mongoose";
import { REMARKS_MAX_LENGTH } from "@/shared/validation/shared";

const personSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    gender: { type: String, enum: ["Male", "Female"] },
    // The code of a CivilStatus catalog item, checked at the service boundary (PersonService), not by a schema enum.
    civilStatusCode: { type: String, trim: true },
    birthDate: { type: Date },
    address: { type: String, trim: true },
    // Free-text HR note shown on the roster (e.g. "Senior, PWD"); length rule mirrors remarksSchema.
    remarks: { type: String, trim: true, maxlength: REMARKS_MAX_LENGTH },
    // Highest educational attainment: the code of an EducationLevel catalog item, checked
    // at the service boundary (PersonService) like employmentType, not by a schema enum.
    educationLevelCode: { type: String, trim: true },
    // Statutory ID numbers — plain text, format-validated at the service
    // boundary (src/shared/validation/shared.ts) rather than the schema.
    sssNumber: { type: String, trim: true },
    philHealthNumber: { type: String, trim: true },
    pagIbigNumber: { type: String, trim: true },
    tinNumber: { type: String, trim: true },
    // PWD and Solo Parent IDs (benefits and statutory reporting): number plus the date the ID stops being valid.
    pwdIdNumber: { type: String, trim: true, maxlength: 50 },
    pwdIdValidUntil: { type: Date },
    soloParentIdNumber: { type: String, trim: true, maxlength: 50 },
    soloParentIdValidUntil: { type: Date },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

personSchema.index({ organizationId: 1 });
// The dashboard looks for PWD and Solo Parent IDs about to expire (IdExpiryService), one query per date.
personSchema.index({ organizationId: 1, pwdIdValidUntil: 1 });
personSchema.index({ organizationId: 1, soloParentIdValidUntil: 1 });

export type Person = InferSchemaType<typeof personSchema>;

export const PersonModel = models.Person ?? model("Person", personSchema);
