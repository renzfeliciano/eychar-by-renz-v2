import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, requirePermission } from "@/server/authorization";
import { EducationRecordService, toEducationRecordView } from "@/domains/people/education-record-service";
import { createEducationRecordSchema } from "@/shared/validation/workforce";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Add an entry to an employee's Educational background. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/education">) {
  try {
    await requireAuthenticatedUser();
    const employeeId = objectId().parse((await ctx.params).id);
    const input = createEducationRecordSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", input.organizationId);
    const record = await EducationRecordService.create({ ...input, employeeId }, { userId });
    return NextResponse.json({ record: toEducationRecordView(record) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
