import { Schema, model, models, type InferSchemaType } from "mongoose";

// Employee 201-file documents (government IDs, contracts, certifications).
// `documentType` is a plain trimmed String validated at the service layer
// against the DocumentType catalog, same pattern as every other
// catalog-driven field in this app. `fileData` is the base64-encoded file
// content, stored directly on the document — same "store as-is in
// MongoDB" call already made for attendance clock-in photos (ADR-020) —
// capped well under the 16MB BSON document limit at the schema boundary
// (src/shared/validation/documents.ts).
const employeeDocumentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    title: { type: String, required: true, trim: true },
    documentType: { type: String, required: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    fileType: { type: String, required: true, trim: true },
    fileSize: { type: Number, required: true },
    fileData: { type: String, required: true },
    expiresAt: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

employeeDocumentSchema.index({ organizationId: 1, employeeId: 1 });

export type EmployeeDocument = InferSchemaType<typeof employeeDocumentSchema>;

export const EmployeeDocumentModel = models.EmployeeDocument ?? model("EmployeeDocument", employeeDocumentSchema);
