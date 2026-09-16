import { Schema, model, models, type InferSchemaType } from "mongoose";

// Always for an existing Position (entity-reference standard, AGENTS.md
// §10) — no duplicated title/description here.
const jobOpeningSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    positionId: { type: Schema.Types.ObjectId, required: true, ref: "Position" },
    headcount: { type: Number, required: true, default: 1, min: 1 },
    status: { type: String, enum: ["open", "closed"], default: "open", required: true },
    openedAt: { type: Date, required: true, default: () => new Date() },
    closedAt: { type: Date },
  },
  { timestamps: true },
);

jobOpeningSchema.index({ organizationId: 1, status: 1 });

export type JobOpening = InferSchemaType<typeof jobOpeningSchema>;

export const JobOpeningModel = models.JobOpening ?? model("JobOpening", jobOpeningSchema);
