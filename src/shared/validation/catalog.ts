import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

export const createSimpleCatalogItemSchema = z.object({
  organizationId: objectId(),
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  sortOrder: z.coerce.number().int().optional(),
  // Free-form extras, bounded so a request can't store an arbitrarily large blob.
  metadata: z
    .record(z.string().max(60), z.unknown())
    .refine((value) => Object.keys(value).length <= 20, "Too many metadata fields (max 20)")
    .refine((value) => JSON.stringify(value).length <= 4000, "Metadata is too large (max 4KB)")
    .optional(),
});

// status and name/description are independent operations on the same
// endpoint (see the PATCH route) — a request carries whichever one the UI
// action triggered (the activate/deactivate button vs. the rename dialog),
// never both, but at least one is required.
export const updateCatalogItemSchema = z
  .object({
    organizationId: objectId(),
    status: z.enum(["active", "inactive"]).optional(),
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
  })
  .refine((data) => data.status !== undefined || data.name !== undefined || data.description !== undefined, {
    message: "Provide a status, name, or description to update",
  });

export type CreateSimpleCatalogItemInput = z.infer<typeof createSimpleCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
