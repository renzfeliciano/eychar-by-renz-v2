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
    // Not required at the schema level — a balance with hasNoFixedAmount
    // set has no entitledDays to speak of. The "required unless unlimited"
    // rule lives in the zod schema (src/shared/validation/leave.ts).
    entitledDays: { type: Number, default: 0, min: 0 },
    adjustmentDays: { type: Number, required: true, default: 0 },
    // Marks a leave type an employee can request without a capped balance
    // (e.g. an org's unlimited Bereavement Leave) — LeaveBalanceService
    // .getAvailable() returns Infinity for these, so LeaveRequestService's
    // exceeds-balance check never blocks a request against them.
    hasNoFixedAmount: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

leaveBalanceSchema.index({ organizationId: 1, employeeId: 1, leaveTypeId: 1, year: 1 }, { unique: true });

export type LeaveBalance = InferSchemaType<typeof leaveBalanceSchema>;

export const LeaveBalanceModel = models.LeaveBalance ?? model("LeaveBalance", leaveBalanceSchema);
