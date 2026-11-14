import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, requirePermission } from "@/server/authorization";
import { EducationRecordService, toEducationRecordView } from "@/domains/people/education-record-service";
import { removeEducationRecordSchema, updateEducationRecordSchema } from "@/shared/validation/workforce";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Change an entry. The entry must belong to the employee in the address. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/education/[recordId]">) {
  try {
    await requireAuthenticatedUser();
    const params = await ctx.params;
    const employeeId = objectId().parse(params.id);
    const recordId = objectId().parse(params.recordId);
    const { organizationId, ...patch } = updateEducationRecordSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", organizationId);
    const record = await EducationRecordService.update(employeeId, recordId, organizationId, patch, { userId });
    return NextResponse.json({ record: toEducationRecordView(record) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Remove an entry. The entry must belong to the employee in the address. */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/education/[recordId]">) {
  try {
    await requireAuthenticatedUser();
    const params = await ctx.params;
    const employeeId = objectId().parse(params.id);
    const recordId = objectId().parse(params.recordId);
    const { organizationId } = removeEducationRecordSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", organizationId);
    await EducationRecordService.remove(employeeId, recordId, organizationId, { userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
