import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "./password-policy";
import { objectId } from "@/shared/validation/object-id";

/** The signed-in person managing their own two-factor sign-in. */
export const mfaActionSchema = z.discriminatedUnion("action", [
  // The password too: otherwise a borrowed session could put its own phone on an account that has no two-step yet.
  z.object({ action: z.literal("start"), password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH) }),
  z.object({ action: z.literal("confirm"), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your app.") }),
  z.object({ action: z.literal("disable"), password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH) }),
  z.object({ action: z.literal("regenerate-recovery-codes"), password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH) }),
]);

export type MfaActionInput = z.infer<typeof mfaActionSchema>;

/** An administrator acting on someone's account. */
export const accountAdminActionSchema = z.object({
  organizationId: objectId(),
  action: z.enum(["reset-password", "unlock", "disable", "enable", "reset-mfa", "rename"]),
  // Only for "rename" (staff accounts).
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
});

export type AccountAdminActionInput = z.infer<typeof accountAdminActionSchema>;
