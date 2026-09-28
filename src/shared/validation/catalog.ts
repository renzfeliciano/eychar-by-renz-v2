import { z } from "zod";

export const createSimpleCatalogItemSchema = z.object({
  organizationId: z.string().trim().min(1),
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  sortOrder: z.coerce.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// status and name/description are independent operations on the same
// endpoint (see the PATCH route) — a request carries whichever one the UI
// action triggered (the activate/deactivate button vs. the rename dialog),
// never both, but at least one is required.
export const updateCatalogItemSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    status: z.enum(["active", "inactive"]).optional(),
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
  })
  .refine((data) => data.status !== undefined || data.name !== undefined || data.description !== undefined, {
    message: "Provide a status, name, or description to update",
  });

export type CreateSimpleCatalogItemInput = z.infer<typeof createSimpleCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
