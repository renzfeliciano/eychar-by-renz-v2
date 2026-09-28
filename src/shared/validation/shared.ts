import { z } from "zod";

/**
 * Wraps a field schema so an empty string is also accepted alongside a
 * validly-formatted value — for edit forms where every field is always
 * submitted pre-filled, this is how the caller signals "clear this field"
 * without also having to accept a blank value for the description-only
 * "required, must look like X" message.
 */
export function clearable<T extends z.ZodTypeAny>(schema: T) {
  return z.union([z.literal(""), schema]);
}

/** A MongoDB ObjectId in hex form — rejected here so a bad id is a 400, not a driver exception (500) deep in a service. */
export function objectIdSchema(message = "Select a valid option") {
  return z.string().trim().regex(/^[a-f\d]{24}$/i, message);
}

/** PH mobile number: XXXX-XXX-XXXX (11 digits), always starting with "09". */
export const contactNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{3}-\d{4}$/, "Use format XXXX-XXX-XXXX");

/** Shared across every feature's email field for consistent validation. */
export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email").max(150);

/** SSS: XX-XXXXXXX-X (10 digits) */
export const sssNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{2}-\d{7}-\d{1}$/, "Use format XX-XXXXXXX-X");
/** PhilHealth: XX-XXXXXXXXX-X (12 digits) */
export const philHealthNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{2}-\d{9}-\d{1}$/, "Use format XX-XXXXXXXXX-X");
/** Pag-IBIG: XXXX-XXXX-XXXX (12 digits) */
export const pagIbigNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}-\d{4}$/, "Use format XXXX-XXXX-XXXX");
/** TIN: XXX-XXX-XXX (9 digits) or XXX-XXX-XXX-XXX (12 digits with branch code) */
export const tinNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{3}-\d{3}-\d{3}(-\d{3})?$/, "Use format XXX-XXX-XXX or XXX-XXX-XXX-XXX");
