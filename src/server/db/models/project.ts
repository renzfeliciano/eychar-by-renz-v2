import { Schema, model, models, type InferSchemaType } from "mongoose";

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

export type Project = InferSchemaType<typeof projectSchema>;

export const ProjectModel = models.Project ?? model("Project", projectSchema);
