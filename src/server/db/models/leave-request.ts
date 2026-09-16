import { Schema, model, models, type InferSchemaType } from "mongoose";

// `status` is a real state machine (Phase 6 — AGENTS.md §57):
// pending -> approved/rejected (LeaveRequestService.decide, gated by
// leave.approve) or pending -> cancelled (LeaveRequestService.cancel,
// gated by leave.update). No employee created via HireService.hire() has
// a login (ADR-011's HR-recorded scoping decision), so requests are
// HR-initiated on an employee's behalf, not employee self-service.
const leaveRequestSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    leaveTypeId: { type: Schema.Types.ObjectId, required: true, ref: "LeaveType" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalDays: { type: Number, required: true, min: 1 },
    reason: { type: String, trim: true },
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending", required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
  },
  { timestamps: true },
);

leaveRequestSchema.index({ organizationId: 1, employeeId: 1, startDate: 1 });
leaveRequestSchema.index({ organizationId: 1, status: 1 });

export type LeaveRequest = InferSchemaType<typeof leaveRequestSchema>;

export const LeaveRequestModel = models.LeaveRequest ?? model("LeaveRequest", leaveRequestSchema);
