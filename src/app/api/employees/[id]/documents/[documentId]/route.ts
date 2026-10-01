import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmployeeDocumentService, documentMetadata } from "@/domains/documents/employee-document-service";
import { updateEmployeeDocumentSchema } from "@/shared/validation/documents";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

/** RFC 6266 attachment header: an ASCII fallback name plus the exact UTF-8 one. */
function attachmentHeader(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "document";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/** Download: the file itself, streamed from storage, always as an attachment. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/documents/[documentId]">) {
  try {
    const { id, documentId } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("employee-documents.read", organizationId);
    const file = await EmployeeDocumentService.readFile(documentId, organizationId, id);
    return new NextResponse(Buffer.from(file.bytes), {
      headers: {
        // Only an allowed type is ever handed back, and never rendered inline.
        "Content-Type": file.contentType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": attachmentHeader(file.fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/employees/[id]/documents/[documentId]">) {
  try {
    const { documentId } = await ctx.params;
    const input = updateEmployeeDocumentSchema.parse(await request.json());
    const { userId } = await requirePermission("employee-documents.update", input.organizationId);
    const document = await EmployeeDocumentService.update(documentId, input.organizationId, input, { userId });
    return NextResponse.json({ document: documentMetadata(document) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
