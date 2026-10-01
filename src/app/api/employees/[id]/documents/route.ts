import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, requirePermission } from "@/server/authorization";
import { EmployeeDocumentService, documentMetadata } from "@/domains/documents/employee-document-service";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_LABEL, guessDocumentType } from "@/domains/documents/file-check";
import { createEmployeeDocumentSchema, documentFileNameSchema } from "@/shared/validation/documents";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { ValidationError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";
import { enforceRateLimit } from "@/server/security/rate-limit";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/documents">) {
  try {
    const { id } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("employee-documents.read", organizationId);
    const documents = await EmployeeDocumentService.listForEmployee(id, organizationId);
    return NextResponse.json({ documents });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Upload: multipart/form-data with the metadata fields and the file itself in `file`. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/documents">) {
  try {
    const { id } = await ctx.params;
    // Signed in before anything is read, and the body's size must be declared
    // and within the cap (the file plus a little form overhead), so nobody
    // can make the server buffer an unbounded upload.
    await requireAuthenticatedUser();
    const declaredHeader = request.headers.get("content-length");
    if (!declaredHeader) return NextResponse.json({ error: "Upload size missing. Try again." }, { status: 411 });
    if (Number(declaredHeader) > MAX_DOCUMENT_BYTES + 64 * 1024) throw new ValidationError(`File is too large (max ${MAX_DOCUMENT_LABEL})`);

    const form = await request.formData().catch(() => {
      throw new ValidationError("Send the document as a form upload.");
    });
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value : undefined;
    };
    const input = createEmployeeDocumentSchema.parse({
      organizationId: text("organizationId"),
      title: text("title"),
      documentType: text("documentType"),
      expiresAt: text("expiresAt"),
      notes: text("notes"),
    });
    const { userId } = await requirePermission("employee-documents.create", input.organizationId);
    await enforceRateLimit("documentUpload", userId);

    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose a file to upload");
    if (file.size > MAX_DOCUMENT_BYTES) throw new ValidationError(`File is too large (max ${MAX_DOCUMENT_LABEL})`);
    const fileName = documentFileNameSchema.parse(file.name);
    const document = await EmployeeDocumentService.create(
      id,
      input,
      { fileName, fileType: file.type || guessDocumentType(fileName), bytes: new Uint8Array(await file.arrayBuffer()) },
      { userId },
    );
    return NextResponse.json({ document: documentMetadata(document) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
