import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

// The file itself arrives as a multipart part, not in these fields; its
// type, content and size are checked on the server (domains/documents/file-check.ts).
const documentFields = z.object({
  organizationId: objectId(),
  title: z.string().trim().min(1).max(120),
  documentType: z.string().trim().min(1),
  expiresAt: z.preprocess((value) => (value === "" ? undefined : value), z.coerce.date().optional()),
  notes: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().max(500).optional()),
});

export const createEmployeeDocumentSchema = documentFields;

// Metadata-only edit: the file isn't re-uploaded on edit. Re-uploading is a new document.
export const updateEmployeeDocumentSchema = documentFields;

/** The uploaded file's name as the browser gave it (shown in the list and used when it's downloaded). */
export const documentFileNameSchema = z.string().trim().min(1, "Choose a file to upload").max(255);

export type CreateEmployeeDocumentInput = z.infer<typeof createEmployeeDocumentSchema>;
export type UpdateEmployeeDocumentInput = z.infer<typeof updateEmployeeDocumentSchema>;
