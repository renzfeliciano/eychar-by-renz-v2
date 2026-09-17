import { z } from "zod";

// `login` accepts either a username or an email — see
// src/domains/identity/user-lookup.ts for the matching lookup.
export const loginSchema = z.object({
  login: z.string().trim().min(1).toLowerCase(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const createEmployeeAccountSchema = z.object({
  organizationId: z.string().trim().min(1),
  employeeId: z.string().trim().min(1),
  username: z.string().trim().min(3).toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type CreateEmployeeAccountInput = z.infer<typeof createEmployeeAccountSchema>;
