import { Schema, model, models, type InferSchemaType } from "mongoose";

const personSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

personSchema.index({ organizationId: 1 });

export type Person = InferSchemaType<typeof personSchema>;

export const PersonModel = models.Person ?? model("Person", personSchema);
