import { Schema, model, models, type InferSchemaType } from "mongoose";

// Configurable catalog data (AGENTS.md §54) — leave type names/codes are
// never hardcoded; an organization defines its own (Vacation, Sick, ...).
const leaveTypeSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    requiresApproval: { type: Boolean, required: true, default: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
  },
  { timestamps: true },
);

leaveTypeSchema.index({ organizationId: 1, code: 1 }, { unique: true });

export type LeaveType = InferSchemaType<typeof leaveTypeSchema>;

export const LeaveTypeModel = models.LeaveType ?? model("LeaveType", leaveTypeSchema);
