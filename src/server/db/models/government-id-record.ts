import { Schema, model, models, type InferSchemaType } from "mongoose";

// One government ID on a person's record, beyond SSS, PhilHealth, Pag-IBIG and TIN: the type (a code from the
// GovernmentIdType catalog, or a typed name when HR picked "Other"; exactly one of the two, checked by
// GovernmentIdRecordService), the number, and when it stops being valid. The same type may appear twice
// (a renewed card), so there is no unique index. It belongs to the Person (it follows a rehire).
const governmentIdRecordSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    personId: { type: Schema.Types.ObjectId, required: true, ref: "Person" },
    typeCode: { type: String, trim: true },
    otherTypeName: { type: String, trim: true, maxlength: 100 },
    idNumber: { type: String, required: true, trim: true, maxlength: 50 },
    validUntil: { type: Date },
  },
  { timestamps: true },
);

governmentIdRecordSchema.index({ organizationId: 1, personId: 1 });
// The dashboard looks for IDs about to expire across the organization (IdExpiryService).
governmentIdRecordSchema.index({ organizationId: 1, validUntil: 1 });

export type GovernmentIdRecord = InferSchemaType<typeof governmentIdRecordSchema>;

export const GovernmentIdRecordModel = models.GovernmentIdRecord ?? model("GovernmentIdRecord", governmentIdRecordSchema);
