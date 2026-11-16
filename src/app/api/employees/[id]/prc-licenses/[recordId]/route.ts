import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, requirePermission } from "@/server/authorization";
import { ProfessionalLicenseRecordService, toProfessionalLicenseRecordView } from "@/domains/people/professional-license-record-service";
import { removeProfessionalLicenseRecordSchema, updateProfessionalLicenseRecordSchema } from "@/shared/validation/workforce";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Change a PRC license. It must belong to the employee in the address. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/prc-licenses/[recordId]">) {
  try {
    await requireAuthenticatedUser();
    const params = await ctx.params;
    const employeeId = objectId().parse(params.id);
    const recordId = objectId().parse(params.recordId);
    const { organizationId, ...patch } = updateProfessionalLicenseRecordSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", organizationId);
    const record = await ProfessionalLicenseRecordService.update(employeeId, recordId, organizationId, patch, { userId });
    return NextResponse.json({ record: toProfessionalLicenseRecordView(record) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Remove a PRC license. It must belong to the employee in the address. */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/prc-licenses/[recordId]">) {
  try {
    await requireAuthenticatedUser();
    const params = await ctx.params;
    const employeeId = objectId().parse(params.id);
    const recordId = objectId().parse(params.recordId);
    const { organizationId } = removeProfessionalLicenseRecordSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", organizationId);
    await ProfessionalLicenseRecordService.remove(employeeId, recordId, organizationId, { userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
