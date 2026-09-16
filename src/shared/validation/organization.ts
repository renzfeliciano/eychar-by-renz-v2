import { z } from "zod";

export const organizationIdParamSchema = z.object({
  organizationId: z.string().trim().min(1),
});

export type OrganizationIdParam = z.infer<typeof organizationIdParamSchema>;
