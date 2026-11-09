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
    birthDate: { type: Date },
    address: { type: String, trim: true },
    // Free-text HR note shown on the roster (e.g. "Senior, PWD"); length rule mirrors remarksSchema.
    remarks: { type: String, trim: true, maxlength: REMARKS_MAX_LENGTH },
    // Statutory ID numbers — plain text, format-validated at the service
    // boundary (src/shared/validation/shared.ts) rather than the schema.
    sssNumber: { type: String, trim: true },
    philHealthNumber: { type: String, trim: true },
    pagIbigNumber: { type: String, trim: true },
    tinNumber: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

personSchema.index({ organizationId: 1 });

export type Person = InferSchemaType<typeof personSchema>;

export const PersonModel = models.Person ?? model("Person", personSchema);
