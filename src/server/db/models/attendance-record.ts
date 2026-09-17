import { Schema, model, models, type InferSchemaType } from "mongoose";

// Captured only by the employee self-service clock-in/out flow
// (src/domains/attendance/self-service-attendance-service.ts) — HR's own
// proxy-recording flow (AttendanceService.record()) never sets these.
// `verified` reflects whether the device's own WebAuthn platform
// authenticator (Face ID/Touch ID/Android biometric/Windows Hello)
// confirmed this action; `photo` is a webcam snapshot, a visual record
// alongside that confirmation, not itself a biometric match.
const clockEventSchema = new Schema(
  {
    at: { type: Date, required: true },
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    photo: { type: String },
    verified: { type: Boolean, default: false },
  },
  { _id: false },
);

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
    // Plain string, validated at the service boundary against the org's
    // AttendanceStatus collection (AttendanceStatusService.assertValidCode)
    // instead of a hardcoded Mongoose enum — an org can add codes like
    // "restday_work"/"undertime" via Settings without a schema change.
    // "present"/"late"/"absent"/"on_leave" stay meaningful to
    // AttendanceService/PayrollService by literal code, same as before.
    status: { type: String, required: true, trim: true },
    policyId: { type: Schema.Types.ObjectId, ref: "AttendancePolicy" },
    notes: { type: String, trim: true },
    checkIn: { type: clockEventSchema },
    checkOut: { type: clockEventSchema },
  },
  { timestamps: true },
);

attendanceRecordSchema.index({ organizationId: 1, employeeId: 1, date: 1 }, { unique: true });
attendanceRecordSchema.index({ organizationId: 1, date: 1 });

export type AttendanceRecord = InferSchemaType<typeof attendanceRecordSchema>;

export const AttendanceRecordModel =
  models.AttendanceRecord ?? model("AttendanceRecord", attendanceRecordSchema);
