import { z } from "zod";

// `login` accepts either a username or an email — see
// src/domains/identity/user-lookup.ts for the matching lookup.
export const loginSchema = z.object({
  login: z.string().trim().min(1).toLowerCase(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
