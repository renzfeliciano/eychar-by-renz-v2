import { z } from "zod";
import { objectIdSchema } from "./shared";
import { calendarDateSchema, dateSpanInDays } from "./schedule";
import { objectId } from "@/shared/validation/object-id";

export const createAttendancePolicySchema = z.object({
  organizationId: objectId(),
  projectId: objectId().optional(),
  name: z.string().trim().min(1),
  standardStartTime: z.string().trim().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  standardEndTime: z.string().trim().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  gracePeriodMinutes: z.coerce.number().int().min(0).default(0),
  workDays: z.array(z.number().int().min(0).max(6)).optional(),
});

export const recordAttendanceSchema = z.object({
  organizationId: objectId(),
  employeeId: objectId(),
  date: z.coerce.date(),
  checkInAt: z.coerce.date().optional(),
  checkOutAt: z.coerce.date().optional(),
  // A plain string, not a fixed enum — validated against the org's
  // AttendanceStatus collection at the service layer instead (see
  // AttendanceStatusService.assertValidCode), so new codes don't need a code change.
  status: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const adjustAttendanceSchema = z.object({
  organizationId: objectId(),
  checkInAt: z.coerce.date().optional(),
  checkOutAt: z.coerce.date().optional(),
  status: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

/** The randomized live-face challenges the clock screen can ask for (ADR-026). */
export const LIVENESS_CHALLENGES = ["blink", "turn_left", "turn_right"] as const;
export type LivenessChallenge = (typeof LIVENESS_CHALLENGES)[number];

// ~1.5 MB of base64 ≈ a 1.1 MB JPEG — far above what the clock screen's
// 640px, q0.8 capture produces, while still bounding what lands in Mongo.
export const MAX_CLOCK_PHOTO_LENGTH = 1_500_000;

const projectIdSchema = objectIdSchema("Select a valid project");

// Location, a live photo, and a completed liveness challenge are all hard
// requirements now (ADR-026 supersedes ADR-020's "best-effort metadata"):
// the geofence can't be judged without a position, and the photo is the
// record of who was actually standing there. No organizationId here on
// purpose — requireSelfServiceEmployee() resolves it from the session.
const clockEventSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
  photo: z
    .string()
    .max(MAX_CLOCK_PHOTO_LENGTH, "Photo is too large")
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/, "A live camera photo is required"),
  liveness: z.object({
    challenges: z.array(z.enum(LIVENESS_CHALLENGES)).min(2).max(4),
  }),
  webAuthn: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
    clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
    authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  }),
});

export const selfServiceClockInSchema = clockEventSchema.extend({ projectId: projectIdSchema });
// Clock-out normally uses the project already stamped on today's record;
// projectId is only needed for a record that doesn't have one (e.g. HR
// recorded the check-in on the employee's behalf).
export const selfServiceClockOutSchema = clockEventSchema.extend({ projectId: projectIdSchema.optional() });

/** A payroll cutoff or a month at most: keeps an export to one quick request, even for a large roster. */
export const MAX_ATTENDANCE_EXPORT_DAYS = 31;

export const attendanceExportQuerySchema = z
  .object({
    organizationId: objectId(),
    from: calendarDateSchema,
    to: calendarDateSchema,
    format: z.enum(["xlsx", "csv"]),
  })
  .refine((query) => query.to >= query.from, { message: "The end date can't be before the start date.", path: ["to"] })
  .refine((query) => query.to < query.from || dateSpanInDays(query.from, query.to) <= MAX_ATTENDANCE_EXPORT_DAYS, {
    message: `Export up to ${MAX_ATTENDANCE_EXPORT_DAYS} days at a time.`,
    path: ["to"],
  });

export type CreateAttendancePolicyInput = z.infer<typeof createAttendancePolicySchema>;
export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;
export type AdjustAttendanceInput = z.infer<typeof adjustAttendanceSchema>;
export type SelfServiceClockInInput = z.infer<typeof selfServiceClockInSchema>;
export type SelfServiceClockOutInput = z.infer<typeof selfServiceClockOutSchema>;
