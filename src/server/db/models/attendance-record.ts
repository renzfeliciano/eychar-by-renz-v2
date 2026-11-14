import { Schema, model, models, type InferSchemaType } from "mongoose";

// Captured only by the employee self-service clock-in/out flow
// (src/domains/attendance/self-service-attendance-service.ts) — HR's own
// proxy-recording flow (AttendanceService.record()) never sets these.
// `verified` reflects whether the device's own WebAuthn platform
// authenticator (Face ID/Touch ID/Android biometric/Windows Hello)
// confirmed this action; `photo` is a live webcam snapshot taken right after
// a randomized face-liveness challenge (`liveness.challenges`), a visual
// record alongside that confirmation, not itself a biometric match.
// locationId/distanceMeters/radiusMeters snapshot the geofence judgement as
// it was at that moment (ADR-026) — HR later moving the site or changing
// its radius must not rewrite what an old clock-in was measured against.
const clockEventSchema = new Schema(
  {
    at: { type: Date, required: true },
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    // Legacy/inline: the base64 JPEG data URL. Only set when photoStorage
    // is "inline" (no Blob store configured) or on records written before
    // photoStorage existed. With Blob configured the bytes live at
    // photoStorage.key and this stays unset (AttendancePhotoStorage).
    photo: { type: String },
    photoStorage: {
      type: new Schema(
        {
          provider: { type: String, enum: ["vercel-blob", "inline"], required: true },
          key: { type: String },
        },
        { _id: false },
      ),
    },
    verified: { type: Boolean, default: false },
    locationId: { type: Schema.Types.ObjectId, ref: "Location" },
    distanceMeters: { type: Number },
    radiusMeters: { type: Number },
    liveness: {
      type: new Schema({ challenges: { type: [String], default: undefined } }, { _id: false }),
    },
  },
  { _id: false },
);

const dayResultSchema = new Schema(
  {
    scheduledMinutes: { type: Number, required: true },
    workedMinutes: { type: Number, required: true },
    lateMinutes: { type: Number, required: true },
    undertimeMinutes: { type: Number, required: true },
    overtimeMinutes: { type: Number, required: true },
    nightDiffMinutes: { type: Number, required: true },
    // Of those, the minutes that are also overtime (DAY_CALC_VERSION 2). Absent on version 1.
    nightOvertimeMinutes: { type: Number },
    dayType: { type: String, enum: ["workday", "rest_day", "regular_holiday", "special_holiday", "special_working"], required: true },
    restDay: { type: Boolean, required: true },
    flags: { type: [String], default: [] },
    // DAY_CALC_VERSION (day-calc.ts) at the time: bumped whenever the rules change.
    calcVersion: { type: Number, required: true },
    calculatedAt: { type: Date, required: true },
    // The inputs it was measured against.
    policyId: { type: Schema.Types.ObjectId, ref: "AttendancePolicy" },
    scheduleEntryId: { type: Schema.Types.ObjectId, ref: "ScheduleEntry" },
    holidayId: { type: Schema.Types.ObjectId, ref: "Holiday" },
    payrollPolicyId: { type: Schema.Types.ObjectId, ref: "PayrollPolicy" },
    regularMinutesCap: { type: Number },
    // Only on holidays (plan Phase 4): the employee's last workday before it, for
    // payroll's unworked-holiday rule.
    previousWorkday: {
      type: new Schema({ date: { type: Date, required: true }, attended: { type: Boolean, required: true }, onLeave: { type: Boolean, required: true } }, { _id: false }),
      default: undefined,
    },
  },
  { _id: false },
);

// One record per employee per calendar day (unique index below) — a
// correction goes through AttendanceService.adjust(), never a second
// record() call. `status` is computed and stored at record time using
// whichever policy resolves for that date (ENGINEERING.md §27) — never
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
    // "restday_work" via Settings without a schema change.
    // "present"/"late"/"absent"/"on_leave" stay meaningful to
    // AttendanceService/PayrollService by literal code, same as before;
    // payroll pays any other code as a day worked.
    status: { type: String, required: true, trim: true },
    policyId: { type: Schema.Types.ObjectId, ref: "AttendancePolicy" },
    // The project/site the employee actually clocked in at that day — can
    // differ from their EmployeeAssignment's project for people who rotate
    // between sites. Unset on HR-recorded records.
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    notes: { type: String, trim: true },
    checkIn: { type: clockEventSchema },
    checkOut: { type: clockEventSchema },
    // Overtime approval (owner decision 1): set by HR through adjust().
    // Unapproved overtime is still measured and reported, but not paid.
    overtimeApproved: { type: Boolean },
    overtimeApprovedBy: { type: Schema.Types.ObjectId, ref: "User" },
    overtimeApprovedAt: { type: Date },
    // The day's worked time (src/domains/attendance/day-result.ts), stored
    // once at record, clock-in/out and adjust — never recomputed on read —
    // with what produced it, so it reproduces. An explicit, audited
    // recalculation is the only other writer. Optional: older records have
    // none, and payroll falls back to its earlier reading for them.
    dayResult: { type: dayResultSchema },
  },
  { timestamps: true },
);

attendanceRecordSchema.index({ organizationId: 1, employeeId: 1, date: 1 }, { unique: true });
attendanceRecordSchema.index({ organizationId: 1, date: 1 });

export type AttendanceRecord = InferSchemaType<typeof attendanceRecordSchema>;

export const AttendanceRecordModel =
  models.AttendanceRecord ?? model("AttendanceRecord", attendanceRecordSchema);
