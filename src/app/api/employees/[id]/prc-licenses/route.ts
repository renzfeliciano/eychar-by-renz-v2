import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, requirePermission } from "@/server/authorization";
import { ProfessionalLicenseRecordService, toProfessionalLicenseRecordView } from "@/domains/people/professional-license-record-service";
import { createProfessionalLicenseRecordSchema } from "@/shared/validation/workforce";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Add a PRC license to an employee's profile. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/prc-licenses">) {
  try {
    await requireAuthenticatedUser();
    const employeeId = objectId().parse((await ctx.params).id);
    const input = createProfessionalLicenseRecordSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", input.organizationId);
    const record = await ProfessionalLicenseRecordService.create({ ...input, employeeId }, { userId });
    return NextResponse.json({ record: toProfessionalLicenseRecordView(record) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
