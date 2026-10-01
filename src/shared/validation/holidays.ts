import { z } from "zod";
import { HOLIDAY_TYPES } from "@/domains/holidays/holiday-types";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const year = z.coerce.number().int().min(2000).max(2100);

export const holidayFieldsSchema = z.object({
  organizationId: z.string().trim().min(1),
  date: dateKey,
  name: z.string().trim().min(1, "Enter the holiday's name").max(120),
  type: z.enum(HOLIDAY_TYPES),
  scope: z.string().trim().max(120).optional(),
  source: z.string().trim().max(160).optional(),
});

export const createHolidaySchema = holidayFieldsSchema;
export const updateHolidaySchema = holidayFieldsSchema;

export const cancelHolidaySchema = z.object({ organizationId: z.string().trim().min(1) });

export const holidayYearQuerySchema = z.object({ organizationId: z.string().trim().min(1), year });

export const holidayPresetQuerySchema = z.object({ organizationId: z.string().trim().min(1), preset: z.string().trim().min(1).max(8), year });

export const importHolidayPresetSchema = z.object({
  organizationId: z.string().trim().min(1),
  preset: z.string().trim().min(1).max(8),
  year,
  /** Which of the preview's days to save; the rest are left out. */
  dates: z.array(dateKey).min(1, "Pick at least one holiday").max(60),
});

export const saveDayNoteSchema = z.object({
  organizationId: z.string().trim().min(1),
  date: dateKey,
  /** Empty clears the note. */
  note: z.string().trim().max(500),
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
export type ImportHolidayPresetInput = z.infer<typeof importHolidayPresetSchema>;
export type SaveDayNoteInput = z.infer<typeof saveDayNoteSchema>;
