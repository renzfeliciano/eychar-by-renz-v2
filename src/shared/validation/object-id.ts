import { z } from "zod";

/** A 24-hex MongoDB ObjectId string. Anything else would make `new Types.ObjectId()` throw (a 500) further down. */
export const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

/** Required id: blank reads as "is required", a malformed one as "Invalid id" (a 400, never a 500). */
export const objectId = () => z.string().trim().min(1).regex(OBJECT_ID_PATTERN, "Invalid id");

/**
 * For selects whose "none" option sends "" — the empty string still passes
 * through as "" so services that treat it as "clear this" keep working.
 */
export const objectIdOrEmpty = () => z.union([objectId(), z.string().trim().length(0)]);

export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID_PATTERN.test(value);
}
