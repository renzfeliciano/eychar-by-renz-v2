import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { AttendancePolicyService } from "@/domains/attendance/attendance-policy-service";
import { createAttendancePolicySchema } from "@/shared/validation/attendance";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("attendance-policies.read", organizationId);
    const policies = await AttendancePolicyService.listCurrent(organizationId);
    return NextResponse.json({ policies });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createAttendancePolicySchema.parse(await request.json());
    const { userId } = await requirePermission("attendance-policies.create", input.organizationId);
    const policy = await AttendancePolicyService.create(input, { userId });
    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
