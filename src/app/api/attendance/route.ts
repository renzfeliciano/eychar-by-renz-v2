import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { recordAttendanceSchema } from "@/shared/validation/attendance";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("attendance.read", organizationId);

    const dateParam = request.nextUrl.searchParams.get("date");
    const employeeId = request.nextUrl.searchParams.get("employeeId");
    const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;

    const records = employeeId
      ? await AttendanceService.listForEmployee(employeeId, organizationId)
      : await AttendanceService.listForOrganization(organizationId, {
          date: dateParam ? new Date(dateParam) : new Date(),
          projectId,
        });

    return NextResponse.json({ records });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = recordAttendanceSchema.parse(await request.json());
    const { userId } = await requirePermission("attendance.create", input.organizationId);
    const record = await AttendanceService.record(input, { userId });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
