import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { createLeaveTypeSchema } from "@/shared/validation/leave";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("leave-types.read", organizationId);
    const leaveTypes = await LeaveTypeService.listCurrent(organizationId);
    return NextResponse.json({ leaveTypes });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createLeaveTypeSchema.parse(await request.json());
    const { userId } = await requirePermission("leave-types.create", input.organizationId);
    const leaveType = await LeaveTypeService.create(input, { userId });
    return NextResponse.json({ leaveType }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
