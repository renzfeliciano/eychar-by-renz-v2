import { z } from "zod";

export const createAttendancePolicySchema = z.object({
  organizationId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  standardStartTime: z.string().trim().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  standardEndTime: z.string().trim().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  gracePeriodMinutes: z.coerce.number().int().min(0).default(0),
  workDays: z.array(z.number().int().min(0).max(6)).optional(),
});

export const recordAttendanceSchema = z.object({
  organizationId: z.string().trim().min(1),
  employeeId: z.string().trim().min(1),
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
  organizationId: z.string().trim().min(1),
  checkInAt: z.coerce.date().optional(),
  checkOutAt: z.coerce.date().optional(),
  status: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

// Geolocation and photo are optional at the schema level (a device without
// a camera or that denies location access can still clock in), but the
// WebAuthn assertion is not — self-service clock-in/out is the one flow
// this codebase requires biometric confirmation for.
const clockEventSchema = z.object({
  organizationId: z.string().trim().min(1),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().min(0).optional(),
  photo: z.string().trim().max(2_000_000).optional(),
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

export const selfServiceClockInSchema = clockEventSchema;
export const selfServiceClockOutSchema = clockEventSchema;

export type CreateAttendancePolicyInput = z.infer<typeof createAttendancePolicySchema>;
export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;
export type AdjustAttendanceInput = z.infer<typeof adjustAttendanceSchema>;
export type SelfServiceClockInput = z.infer<typeof clockEventSchema>;
