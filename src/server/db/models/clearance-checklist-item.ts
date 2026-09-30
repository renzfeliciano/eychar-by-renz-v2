import { Schema, model, models, type InferSchemaType } from "mongoose";

// The organization's clearance checklist (ADR-031): what each department
// must clear when someone leaves. Opening a case copies the active items
// into it, so editing the checklist never changes a case in progress.
const clearanceChecklistItemSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    // A ClearanceDepartment catalog code.
    departmentCode: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    // Blocking items must be resolved before final pay can be approved.
    blocking: { type: Boolean, required: true, default: true },
    // Due this many days after the last working day (0 = on the last day).
    dueDaysAfterLastDay: { type: Number, required: true, default: 0, min: 0 },
    sortOrder: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
  },
  { timestamps: true },
);

clearanceChecklistItemSchema.index({ organizationId: 1, departmentCode: 1, sortOrder: 1 });

export type ClearanceChecklistItem = InferSchemaType<typeof clearanceChecklistItemSchema>;

export const ClearanceChecklistItemModel = models.ClearanceChecklistItem ?? model("ClearanceChecklistItem", clearanceChecklistItemSchema);
