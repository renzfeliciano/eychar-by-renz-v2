import { Schema, model, models, type InferSchemaType } from "mongoose";

// "Used" days are deliberately not stored here — they're derived at read
// time by summing approved LeaveRequest.totalDays (LeaveBalanceService
// .getAvailable), so there's exactly one source of truth for consumption
// instead of a stored counter that could drift from the requests that
// produced it.
const leaveBalanceSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    leaveTypeId: { type: Schema.Types.ObjectId, required: true, ref: "LeaveType" },
    year: { type: Number, required: true },
    entitledDays: { type: Number, required: true, min: 0 },
    adjustmentDays: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

leaveBalanceSchema.index({ organizationId: 1, employeeId: 1, leaveTypeId: 1, year: 1 }, { unique: true });

export type LeaveBalance = InferSchemaType<typeof leaveBalanceSchema>;

export const LeaveBalanceModel = models.LeaveBalance ?? model("LeaveBalance", leaveBalanceSchema);
