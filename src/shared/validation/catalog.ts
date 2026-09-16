import { z } from "zod";

export const createSimpleCatalogItemSchema = z.object({
  organizationId: z.string().trim().min(1),
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  sortOrder: z.coerce.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateCatalogItemStatusSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]),
});

export type CreateSimpleCatalogItemInput = z.infer<typeof createSimpleCatalogItemSchema>;
export type UpdateCatalogItemStatusInput = z.infer<typeof updateCatalogItemStatusSchema>;
