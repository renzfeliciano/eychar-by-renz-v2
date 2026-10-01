import { z } from "zod";
import { checkPassword, PASSWORD_MAX_LENGTH } from "./password-policy";
import { objectId } from "@/shared/validation/object-id";

// `login` accepts either a username or an email — see
// src/domains/identity/user-lookup.ts for the matching lookup.
export const loginSchema = z.object({
  login: z.string().max(254).trim().min(1).toLowerCase(),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  // A six-digit authenticator code or a recovery code, sent on the second
  // step of sign-in for accounts with two-factor sign-in turned on.
  otp: z.string().trim().max(32).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Adds each password-policy problem as an issue on `field`. */
function enforcePasswordPolicy(field: string, password: string, context: { username?: string; email?: string }, ctx: z.RefinementCtx) {
  for (const message of checkPassword(password, context)) ctx.addIssue({ code: "custom", path: [field], message });
}

// Letters, numbers, dots, dashes and underscores only: no "@", so a username
// can never look like (and collide with) another account's email at sign-in.
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(60, "Username must be at most 60 characters")
  .regex(/^[a-z0-9._-]+$/, "Use only letters, numbers, dots, dashes and underscores in the username");

export const createEmployeeAccountSchema = z
  .object({
    organizationId: objectId(),
    employeeId: objectId(),
    username: usernameSchema,
    password: z.string(),
  })
  .superRefine((input, ctx) => enforcePasswordPolicy("password", input.password, { username: input.username }, ctx));

export type CreateEmployeeAccountInput = z.infer<typeof createEmployeeAccountSchema>;

// A plain HR/admin-shell login — no employeeId, distinct from
// createEmployeeAccountSchema's self-service account (see ADR-022).
export const createStaffAccountSchema = z
  .object({
    organizationId: objectId(),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    username: usernameSchema,
    password: z.string(),
    roleId: objectId().optional(),
  })
  .superRefine((input, ctx) => enforcePasswordPolicy("password", input.password, { username: input.username }, ctx));

export type CreateStaffAccountInput = z.infer<typeof createStaffAccountSchema>;

/** Someone changing their own password. The username/email check happens in the service, which knows the account. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(PASSWORD_MAX_LENGTH),
    newPassword: z.string(),
  })
  .superRefine((input, ctx) => {
    enforcePasswordPolicy("newPassword", input.newPassword, {}, ctx);
    if (input.newPassword === input.currentPassword) {
      ctx.addIssue({ code: "custom", path: ["newPassword"], message: "Choose a password different from your current one." });
    }
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
