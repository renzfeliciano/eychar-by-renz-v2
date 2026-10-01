import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeDocumentModel, EmployeeModel } from "@/server/db/models";
import { DocumentTypeService } from "@/domains/catalog/document-type-service";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import type { CreateEmployeeDocumentInput, UpdateEmployeeDocumentInput } from "@/shared/validation/documents";
import { inspectDocumentUpload } from "./file-check";

export const EmployeeDocumentService = {
  async create(employeeId: string, input: CreateEmployeeDocumentInput, actor: { userId?: string }) {
    await connectMongoDB();
    await DocumentTypeService.assertValidCode(input.organizationId, input.documentType);
    // Type, content and size are checked here, not taken from the browser.
    const file = inspectDocumentUpload({ fileType: input.fileType, fileData: input.fileData });

    const employeeExists = await EmployeeModel.exists({
      _id: new Types.ObjectId(employeeId),
      organizationId: new Types.ObjectId(input.organizationId),
    });
    if (!employeeExists) throw new NotFoundError("Employee not found in this organization");

    const document = await EmployeeDocumentModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      employeeId: new Types.ObjectId(employeeId),
      title: input.title,
      documentType: input.documentType,
      fileName: input.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      fileData: input.fileData.replace(/\s+/g, ""),
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

  async listForEmployee(employeeId: string, organizationId: string) {
    await connectMongoDB();
    return EmployeeDocumentModel.find({ employeeId: new Types.ObjectId(employeeId), organizationId: new Types.ObjectId(organizationId) })
      .select("-fileData")
      .sort({ createdAt: -1 })
      .lean();
  },

  /** One document with its file, when it belongs to `employeeId` in `organizationId`. */
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
