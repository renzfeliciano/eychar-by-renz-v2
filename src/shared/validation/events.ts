import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";
import { HOLIDAY_TYPES } from "@/domains/holidays/holiday-types";

// Same shape for create and update, mirroring the legacy v1 app's single reused form.
export const eventSchema = z.object({
  organizationId: objectId(),
  title: z.string().trim().min(1).max(120),
  date: z.coerce.date(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")
    .optional(),
  category: z.string().max(200).trim().min(1),
  description: z.string().trim().max(500).optional(),
  /** Required when the category is a holiday one; ignored otherwise. */
  holidayType: z.enum(HOLIDAY_TYPES).optional(),
});

export const createEventSchema = eventSchema;
export const updateEventSchema = eventSchema;

export const cancelEventSchema = z.object({
  organizationId: objectId(),
});

export const eventMonthQuerySchema = z.object({
  organizationId: objectId(),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM"),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
