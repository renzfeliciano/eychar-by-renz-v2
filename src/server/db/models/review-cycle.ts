import { Schema, model, models, type InferSchemaType } from "mongoose";

const reviewCycleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    name: { type: String, required: true, trim: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: { type: String, enum: ["draft", "open", "closed"], default: "draft", required: true },
  },
  { timestamps: true },
);

reviewCycleSchema.index({ organizationId: 1, status: 1 });

export type ReviewCycle = InferSchemaType<typeof reviewCycleSchema>;

export const ReviewCycleModel = models.ReviewCycle ?? model("ReviewCycle", reviewCycleSchema);
