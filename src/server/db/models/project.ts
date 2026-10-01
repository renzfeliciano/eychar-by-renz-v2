import { Schema, model, models, type InferSchemaType } from "mongoose";
import { hiddenPlugin } from "../hidden-plugin";

const projectSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

projectSchema.index({ organizationId: 1, code: 1 }, { unique: true });
projectSchema.index({ locationId: 1 });

// Test data the Super Administrator hid is left out of reads for everyone else (ADR-034).
projectSchema.plugin(hiddenPlugin);

export type Project = InferSchemaType<typeof projectSchema>;

export const ProjectModel = models.Project ?? model("Project", projectSchema);
