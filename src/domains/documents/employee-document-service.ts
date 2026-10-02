import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeDocumentModel, EmployeeModel } from "@/server/db/models";
import { DocumentTypeService } from "@/domains/catalog/document-type-service";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import type { CreateEmployeeDocumentInput, UpdateEmployeeDocumentInput } from "@/shared/validation/documents";
import { DocumentStorage } from "@/server/storage/document-storage";
import { inspectDocumentBytes, safeDownloadType } from "./file-check";

/** An uploaded file as received by the route: the browser's name and type, and its bytes. */
export type UploadedDocumentFile = { fileName: string; fileType: string; bytes: Uint8Array };

/** A document as API responses show it: metadata only, never the file or where it's stored. */
export function documentMetadata(document: { toObject(): Record<string, unknown> }): Record<string, unknown> {
  const metadata = document.toObject();
  delete metadata.fileData;
  delete metadata.storage;
  return metadata;
}

export const EmployeeDocumentService = {
  async create(employeeId: string, input: CreateEmployeeDocumentInput, upload: UploadedDocumentFile, actor: { userId?: string }) {
    await connectMongoDB();
    await DocumentTypeService.assertValidCode(input.organizationId, input.documentType);
    // Type, content and size are checked here, not taken from the browser.
    const file = inspectDocumentBytes({ fileType: upload.fileType, bytes: upload.bytes });
    if (!Types.ObjectId.isValid(employeeId)) throw new NotFoundError("Employee not found in this organization");

    const employeeExists = await EmployeeModel.exists({
      _id: new Types.ObjectId(employeeId),
      organizationId: new Types.ObjectId(input.organizationId),
    });
    if (!employeeExists) throw new NotFoundError("Employee not found in this organization");

    const { stored, inlineData } = await DocumentStorage.save({ organizationId: input.organizationId, employeeId, bytes: upload.bytes, contentType: file.fileType });
    const document = await EmployeeDocumentModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      employeeId: new Types.ObjectId(employeeId),
      title: input.title,
      documentType: input.documentType,
      fileName: upload.fileName.trim(),
      fileType: file.fileType,
      fileSize: file.fileSize,
      storage: stored,
      ...(inlineData !== undefined ? { fileData: inlineData } : {}),
      expiresAt: input.expiresAt,
      notes: input.notes,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "employee-document.created",
      resourceType: "EmployeeDocument",
      resourceId: document._id.toString(),
      after: { title: document.title, documentType: document.documentType, fileName: document.fileName },
    });

    return document;
  },

  /** Metadata only — the stored file itself is never touched by an edit; re-uploading is a new document. */
  async update(id: string, organizationId: string, patch: Omit<UpdateEmployeeDocumentInput, "organizationId">, actor: { userId?: string }) {
    await connectMongoDB();
    await DocumentTypeService.assertValidCode(organizationId, patch.documentType);

    const document = await EmployeeDocumentModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!document) throw new NotFoundError("Document not found in this organization");

    const before = { title: document.title, documentType: document.documentType };
    document.title = patch.title;
    document.documentType = patch.documentType;
    document.expiresAt = patch.expiresAt;
    document.notes = patch.notes;
    await document.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "employee-document.updated",
      resourceType: "EmployeeDocument",
      resourceId: document._id.toString(),
      before,
      after: { title: document.title, documentType: document.documentType },
    });

    return document;
  },

  /** Documents across the organization that expired or expire by `until` (the dashboard's risk list). No file data. */
  async listExpiringForOrganization(organizationId: string, until: Date) {
    await connectMongoDB();
    return EmployeeDocumentModel.find({ organizationId: new Types.ObjectId(organizationId), expiresAt: { $ne: null, $lte: until } })
      .select("employeeId title documentType expiresAt")
      .sort({ expiresAt: 1 })
      .limit(200)
      .lean();
  },

  async listForEmployee(employeeId: string, organizationId: string) {
    await connectMongoDB();
    return EmployeeDocumentModel.find({ employeeId: new Types.ObjectId(employeeId), organizationId: new Types.ObjectId(organizationId) })
      .select("-fileData -storage")
      .sort({ createdAt: -1 })
      .lean();
  },

  /**
   * The file for download, when the document belongs to `employeeId` in
   * `organizationId`: its bytes from wherever they're stored, the name to
   * save it as, and a type that's always one of the allowed ones.
   */
  async readFile(id: string, organizationId: string, employeeId: string): Promise<{ fileName: string; contentType: string; bytes: Uint8Array }> {
    const document = await EmployeeDocumentService.getById(id, organizationId, employeeId);
    const bytes = await DocumentStorage.read(document);
    if (!bytes) throw new NotFoundError("This document's file is no longer available");
    return { fileName: document.fileName, contentType: safeDownloadType(document.fileType), bytes };
  },

  /** One document (metadata and storage location), when it belongs to `employeeId` in `organizationId`. */
  async getById(id: string, organizationId: string, employeeId?: string) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(id) || (employeeId !== undefined && !Types.ObjectId.isValid(employeeId))) throw new NotFoundError("Document not found in this organization");
    const document = await EmployeeDocumentModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
      ...(employeeId !== undefined ? { employeeId: new Types.ObjectId(employeeId) } : {}),
    }).lean();
    if (!document) throw new NotFoundError("Document not found in this organization");
    return document;
  },
};
