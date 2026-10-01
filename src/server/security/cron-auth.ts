import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Checks a cron request's `Authorization: Bearer <CRON_SECRET>` in constant
 * time (both sides are hashed first, so even their lengths don't leak).
 * "unconfigured" when CRON_SECRET isn't set, so the job stays off.
 */
export function checkCronAuthorization(header: string | null, secret: string | undefined = process.env.CRON_SECRET): "ok" | "unauthorized" | "unconfigured" {
  if (!secret) return "unconfigured";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${secret}`)) ? "ok" : "unauthorized";
}
