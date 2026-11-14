import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, requirePermission } from "@/server/authorization";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { reinstateEmploymentSchema } from "@/shared/validation/workforce";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Reverse an ending that was wrong: reopens the same employment, with a reason kept in its history. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/employment/reinstate">) {
  try {
    await requireAuthenticatedUser();
    const employeeId = objectId().parse((await ctx.params).id);
    const { organizationId, reason } = reinstateEmploymentSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", organizationId);
    const employment = await EmploymentService.reinstate(employeeId, organizationId, { reason }, { userId });
    return NextResponse.json({ employment: { status: employment.status } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
