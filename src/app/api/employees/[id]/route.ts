import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/employees/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("employees.read", organizationId);
    const detail = await EmployeeService.getDetail(id, organizationId);
    return NextResponse.json({ detail });
  } catch (error) {
    return toErrorResponse(error);
  }
}
