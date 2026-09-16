import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { createEmploymentSchema, terminateEmploymentSchema } from "@/shared/validation/workforce";
import { NotFoundError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/employment">) {
  try {
    const { id } = await ctx.params;
    const input = createEmploymentSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", input.organizationId);
    const employment = await EmploymentService.create(
      { organizationId: input.organizationId, employeeId: id, employmentType: input.employmentType, effectiveFrom: input.effectiveFrom },
      { userId },
    );
    return NextResponse.json({ employment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/employment">) {
  try {
    const { id } = await ctx.params;
    const input = terminateEmploymentSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", input.organizationId);
    const current = await EmploymentService.getCurrent(id);
    if (!current) throw new NotFoundError("This employee has no open employment record to terminate");
    const employment = await EmploymentService.terminate(current._id.toString(), input.organizationId, input, { userId });
    return NextResponse.json({ employment });
  } catch (error) {
    return toErrorResponse(error);
  }
}
