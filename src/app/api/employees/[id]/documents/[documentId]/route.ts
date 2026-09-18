import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmployeeDocumentService } from "@/domains/documents/employee-document-service";
import { updateEmployeeDocumentSchema } from "@/shared/validation/documents";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Includes `fileData` — this is the download/view endpoint, unlike the list route which omits it. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/documents/[documentId]">) {
  try {
    const { documentId } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("employee-documents.read", organizationId);
    const document = await EmployeeDocumentService.getById(documentId, organizationId);
    return NextResponse.json({ document });
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
    return NextResponse.json({ document });
  } catch (error) {
    return toErrorResponse(error);
  }
}
