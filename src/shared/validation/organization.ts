import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

export const organizationIdParamSchema = z.object({
  organizationId: objectId(),
});

export type OrganizationIdParam = z.infer<typeof organizationIdParamSchema>;
