import { Schema, model, models, type InferSchemaType } from "mongoose";

// An org-defined, reusable shift HR picks per day on the monthly schedule
// (ADR-027): "Day 08:00–17:00", "Night 22:00–07:00" (end before start
// means it ends the next morning), or a rest day with no times. `code` is
// the short label shown in each grid cell and the Excel export.
const shiftTemplateSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    kind: { type: String, enum: ["work", "rest"], required: true },
    startTime: { type: String, trim: true },
    endTime: { type: String, trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
  },
  { timestamps: true },
);

shiftTemplateSchema.index({ organizationId: 1, code: 1 }, { unique: true });

export type ShiftTemplate = InferSchemaType<typeof shiftTemplateSchema>;

export const ShiftTemplateModel = models.ShiftTemplate ?? model("ShiftTemplate", shiftTemplateSchema);
