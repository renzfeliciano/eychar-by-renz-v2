import { Schema, model, models, type InferSchemaType } from "mongoose";

// Employee 201-file documents (government IDs, contracts, certifications).
// `documentType` is a plain trimmed String validated at the service layer
// against the DocumentType catalog, same pattern as every other
// catalog-driven field in this app.
//
// The file itself (ADR-038): in private object storage, referenced by
// `storage` ({ provider: "vercel-blob", key }), when the deployment has a
// Blob store; otherwise inline as base64 in `fileData` (`storage.provider`
// "inline"). Documents uploaded before ADR-038 have `fileData` and no
// `storage`, and are read the same way. See src/server/storage/document-storage.ts.
const employeeDocumentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    title: { type: String, required: true, trim: true },
    documentType: { type: String, required: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    fileType: { type: String, required: true, trim: true },
    fileSize: { type: Number, required: true },
    fileData: { type: String },
    storage: {
      provider: { type: String, enum: ["vercel-blob", "inline"] },
      key: { type: String },
    },
    expiresAt: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

employeeDocumentSchema.index({ organizationId: 1, employeeId: 1 });

export type EmployeeDocument = InferSchemaType<typeof employeeDocumentSchema>;

export const EmployeeDocumentModel = models.EmployeeDocument ?? model("EmployeeDocument", employeeDocumentSchema);
