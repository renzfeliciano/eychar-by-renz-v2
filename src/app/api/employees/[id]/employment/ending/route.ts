import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, requirePermission } from "@/server/authorization";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { correctEndingSchema } from "@/shared/validation/workforce";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Correct how an employment ended: the reason (for example Terminated to Resigned), the last day, or the note. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/employment/ending">) {
  try {
    await requireAuthenticatedUser();
    const employeeId = objectId().parse((await ctx.params).id);
    const { organizationId, ...patch } = correctEndingSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", organizationId);
    const employment = await EmploymentService.correctEnding(employeeId, organizationId, patch, { userId });
    return NextResponse.json({ employment: { status: employment.status, effectiveTo: employment.effectiveTo ?? null, terminationReason: employment.terminationReason ?? null } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
