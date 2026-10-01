import { Schema, model, models, type InferSchemaType } from "mongoose";
import { hiddenPlugin } from "../hidden-plugin";

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
    // "flexible": start anytime from startTime to latestStartTime, work requiredHours; no fixed end.
    pattern: { type: String, enum: ["fixed", "flexible"], default: "fixed" },
    // A key from src/domains/attendance/shift-colors.ts, shown in the grid and the Excel export.
    color: { type: String, trim: true },
    startTime: { type: String, trim: true },
    endTime: { type: String, trim: true },
    latestStartTime: { type: String, trim: true },
    requiredHours: { type: Number },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
  },
  { timestamps: true },
);

shiftTemplateSchema.index({ organizationId: 1, code: 1 }, { unique: true });

// Test data the Super Administrator hid is left out of reads for everyone else (ADR-034).
shiftTemplateSchema.plugin(hiddenPlugin);

export type ShiftTemplate = InferSchemaType<typeof shiftTemplateSchema>;

export const ShiftTemplateModel = models.ShiftTemplate ?? model("ShiftTemplate", shiftTemplateSchema);
