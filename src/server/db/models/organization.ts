import { Schema, model, models, type InferSchemaType } from "mongoose";

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    // Security settings the Super Administrator controls (Settings › Security).
    security: {
      // Signed out after this long without activity; warned for the last idleWarningSeconds.
      idleTimeoutSeconds: { type: Number, min: 30, max: 86_400, default: 60 },
      idleWarningSeconds: { type: Number, min: 5, max: 3_600, default: 15 },
    },
  },
  { timestamps: true },
);

export type Organization = InferSchemaType<typeof organizationSchema>;

export const OrganizationModel =
  models.Organization ?? model("Organization", organizationSchema);
