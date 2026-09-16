import { Schema, model, models, type InferSchemaType } from "mongoose";

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export type Organization = InferSchemaType<typeof organizationSchema>;

export const OrganizationModel =
  models.Organization ?? model("Organization", organizationSchema);
