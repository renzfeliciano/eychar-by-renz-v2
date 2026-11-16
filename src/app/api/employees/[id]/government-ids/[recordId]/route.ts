import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, requirePermission } from "@/server/authorization";
import { GovernmentIdRecordService, toGovernmentIdRecordView } from "@/domains/people/government-id-record-service";
import { removeGovernmentIdRecordSchema, updateGovernmentIdRecordSchema } from "@/shared/validation/workforce";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Change a government ID. It must belong to the employee in the address. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/government-ids/[recordId]">) {
  try {
    await requireAuthenticatedUser();
    const params = await ctx.params;
    const employeeId = objectId().parse(params.id);
    const recordId = objectId().parse(params.recordId);
    const { organizationId, ...patch } = updateGovernmentIdRecordSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", organizationId);
    const record = await GovernmentIdRecordService.update(employeeId, recordId, organizationId, patch, { userId });
    return NextResponse.json({ record: toGovernmentIdRecordView(record) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Remove a government ID. It must belong to the employee in the address. */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/government-ids/[recordId]">) {
  try {
    await requireAuthenticatedUser();
    const params = await ctx.params;
    const employeeId = objectId().parse(params.id);
    const recordId = objectId().parse(params.recordId);
    const { organizationId } = removeGovernmentIdRecordSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", organizationId);
    await GovernmentIdRecordService.remove(employeeId, recordId, organizationId, { userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
