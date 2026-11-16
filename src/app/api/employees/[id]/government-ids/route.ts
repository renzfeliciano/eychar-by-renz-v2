import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, requirePermission } from "@/server/authorization";
import { GovernmentIdRecordService, toGovernmentIdRecordView } from "@/domains/people/government-id-record-service";
import { createGovernmentIdRecordSchema } from "@/shared/validation/workforce";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Add a government ID to an employee's profile. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/government-ids">) {
  try {
    await requireAuthenticatedUser();
    const employeeId = objectId().parse((await ctx.params).id);
    const input = createGovernmentIdRecordSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", input.organizationId);
    const record = await GovernmentIdRecordService.create({ ...input, employeeId }, { userId });
    return NextResponse.json({ record: toGovernmentIdRecordView(record) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
