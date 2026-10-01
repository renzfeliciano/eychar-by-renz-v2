import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

// ~5MB decoded (base64 inflates by ~33%), staying well under MongoDB's
// 16MB BSON document limit alongside the rest of the document's fields —
// same reasoning as the 2MB cap on attendance clock-in photos.
const MAX_FILE_DATA_LENGTH = 7_000_000;

const documentFields = z.object({
  organizationId: objectId(),
  title: z.string().trim().min(1).max(120),
  documentType: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(255),
  // Checked against the file's own bytes on the server (domains/documents/file-check.ts).
  fileType: z.string().trim().min(1).max(120),
  // The browser's figure is ignored; the server measures the decoded file.
  fileSize: z.number().int().positive().optional(),
  fileData: z.string().trim().min(1).max(MAX_FILE_DATA_LENGTH, "File is too large (max 5MB)"),
  expiresAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const createEmployeeDocumentSchema = documentFields;

// Metadata-only edit — the file itself isn't re-uploaded on edit, matching
// how every other "full replace" form in this app still doesn't force
// re-entering data that hasn't changed (e.g. a travel order's employee
// list). Re-uploading is a new document, not an edit.
export const updateEmployeeDocumentSchema = documentFields.omit({ fileName: true, fileType: true, fileSize: true, fileData: true });

export type CreateEmployeeDocumentInput = z.infer<typeof createEmployeeDocumentSchema>;
export type UpdateEmployeeDocumentInput = z.infer<typeof updateEmployeeDocumentSchema>;
