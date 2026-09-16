import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { transferAssignmentSchema } from "@/shared/validation/workforce";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/assignments">) {
  try {
    const { id } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("employees.read", organizationId);
    const history = await EmployeeAssignmentService.getHistory(id);
    return NextResponse.json({ history });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/assignments">) {
  try {
    const { id } = await ctx.params;
    const input = transferAssignmentSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", input.organizationId);
    const assignment = await EmployeeAssignmentService.transfer(id, input.organizationId, input, { userId });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
