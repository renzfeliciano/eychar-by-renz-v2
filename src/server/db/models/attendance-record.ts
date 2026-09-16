import { Schema, model, models, type InferSchemaType } from "mongoose";

// One record per employee per calendar day (unique index below) — a
// correction goes through AttendanceService.adjust(), never a second
// record() call. `status` is computed and stored at record time using
// whichever policy resolves for that date (AGENTS.md §27) — never
// recomputed later against today's policy, so `policyId` records which
// policy version produced it, for reproducibility.
const attendanceRecordSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    date: { type: Date, required: true },
    checkInAt: { type: Date },
    checkOutAt: { type: Date },
    status: { type: String, enum: ["present", "late", "absent", "on_leave"], required: true },
    policyId: { type: Schema.Types.ObjectId, ref: "AttendancePolicy" },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

attendanceRecordSchema.index({ organizationId: 1, employeeId: 1, date: 1 }, { unique: true });
attendanceRecordSchema.index({ organizationId: 1, date: 1 });

export type AttendanceRecord = InferSchemaType<typeof attendanceRecordSchema>;

export const AttendanceRecordModel =
  models.AttendanceRecord ?? model("AttendanceRecord", attendanceRecordSchema);
