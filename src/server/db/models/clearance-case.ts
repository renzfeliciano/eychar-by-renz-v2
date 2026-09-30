import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

export const CLEARANCE_CASE_STATUSES = ["in_clearance", "cleared", "cancelled", "closed"] as const;
export const CLEARANCE_ITEM_STATUSES = ["pending", "cleared", "flagged", "waived", "not_applicable"] as const;

// A checklist item as copied into the case, plus its sign-off. Department
// name is copied too, so renaming a department later doesn't rewrite history.
const clearanceCaseItemSchema = new Schema({
  checklistItemId: { type: Schema.Types.ObjectId, ref: "ClearanceChecklistItem" },
  departmentCode: { type: String, required: true },
  departmentName: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  blocking: { type: Boolean, required: true },
  dueDate: { type: Date },
  status: { type: String, enum: CLEARANCE_ITEM_STATUSES, required: true, default: "pending" },
  // Flagged items: what the employee owes for it (becomes a settlement deduction, ADR-032).
  amount: { type: Number, min: 0 },
  note: { type: String, trim: true },
  actedBy: { type: Schema.Types.ObjectId, ref: "User" },
  actedAt: { type: Date },
});

// One separation (ADR-031). Opened by HR only; the notice itself arrives by
// email, so the case records how and when it was received.
const clearanceCaseSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    caseNumber: { type: String, required: true, trim: true },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    // A SeparationType catalog code.
    separationTypeCode: { type: String, required: true, trim: true },
    noticeDate: { type: Date, required: true },
    lastWorkingDay: { type: Date, required: true },
    noticeReference: { type: String, trim: true },
    remarks: { type: String, trim: true },
    status: { type: String, enum: CLEARANCE_CASE_STATUSES, required: true, default: "in_clearance" },
    // true while the case is in progress; backs the one-active-case-per-employee rule.
    active: { type: Boolean, required: true, default: true },
    cancelReason: { type: String, trim: true },
    items: { type: [clearanceCaseItemSchema], default: [] },
    openedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

clearanceCaseSchema.index({ organizationId: 1, caseNumber: 1 }, { unique: true });
clearanceCaseSchema.index({ organizationId: 1, employeeId: 1 }, { unique: true, partialFilterExpression: { active: true } });
clearanceCaseSchema.index({ organizationId: 1, status: 1, lastWorkingDay: 1 });

export type ClearanceCase = InferSchemaType<typeof clearanceCaseSchema>;

export const ClearanceCaseModel = (models.ClearanceCase as Model<ClearanceCase> | undefined) ?? model<ClearanceCase>("ClearanceCase", clearanceCaseSchema);
