import { Schema, model, models, type InferSchemaType } from "mongoose";

// A Position is a data record only (AGENTS.md §11/§12) — it is never used
// for authorization or to derive reporting relationships anywhere in this
// codebase.
const positionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    title: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

positionSchema.index({ organizationId: 1, code: 1 }, { unique: true });

export type Position = InferSchemaType<typeof positionSchema>;

export const PositionModel = models.Position ?? model("Position", positionSchema);
