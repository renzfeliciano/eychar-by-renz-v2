import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, requirePermission } from "@/server/authorization";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { reinstateEmploymentSchema } from "@/shared/validation/workforce";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Cancel an end scheduled for later (e.g. a resignation withdrawn during notice), with a reason kept in its history. */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/employment/scheduled-end">) {
  try {
    await requireAuthenticatedUser();
    const employeeId = objectId().parse((await ctx.params).id);
    // Same body as reinstate: the organization and a reason.
    const { organizationId, reason } = reinstateEmploymentSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", organizationId);
    const employment = await EmploymentService.cancelScheduledEnd(employeeId, organizationId, { reason }, { userId });
    return NextResponse.json({ employment: { status: employment.status } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
