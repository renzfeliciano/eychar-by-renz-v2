import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmployeeDocumentService } from "@/domains/documents/employee-document-service";
import { createEmployeeDocumentSchema } from "@/shared/validation/documents";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

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

export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/documents">) {
  try {
    const { id } = await ctx.params;
    const input = createEmployeeDocumentSchema.parse(await request.json());
    const { userId } = await requirePermission("employee-documents.create", input.organizationId);
    const document = await EmployeeDocumentService.create(id, input, { userId });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
