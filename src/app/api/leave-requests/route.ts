import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { createLeaveRequestSchema } from "@/shared/validation/leave";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("leave.read", organizationId);

    const employeeId = request.nextUrl.searchParams.get("employeeId");
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const leaveTypeId = request.nextUrl.searchParams.get("leaveTypeId") ?? undefined;

    const requests = employeeId
      ? await LeaveRequestService.listForEmployee(employeeId, organizationId)
      : await LeaveRequestService.listForOrganization(organizationId, { status, leaveTypeId });

    return NextResponse.json({ requests });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createLeaveRequestSchema.parse(await request.json());
    const { userId } = await requirePermission("leave.create", input.organizationId);
    const leaveRequest = await LeaveRequestService.create(input, { userId });
    return NextResponse.json({ request: leaveRequest }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
