import { NextRequest, NextResponse } from "next/server";
import { requireAccessibleProjects, requirePermission, requireProjectAccess } from "@/server/authorization";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { recordAttendanceSchema } from "@/shared/validation/attendance";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    const dateParam = request.nextUrl.searchParams.get("date");
    const employeeId = request.nextUrl.searchParams.get("employeeId");
    const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
    const date = dateParam ? new Date(dateParam) : new Date();

    let records;
    if (employeeId) {
      // One employee's history spans projects: organization-wide access only.
      await requirePermission("attendance.read", organizationId);
      records = await AttendanceService.listForEmployee(employeeId, organizationId);
    } else if (projectId) {
      // One project's day: organization-wide access, or access to this project.
      await requireProjectAccess("attendance.read", organizationId, projectId);
      records = await AttendanceService.listForOrganization(organizationId, { date, projectId });
    } else {
      // The whole day: everything for organization-wide access, otherwise only the caller's projects.
      const { projects } = await requireAccessibleProjects("attendance.read", organizationId);
      records = await AttendanceService.listForOrganization(organizationId, { date, ...(projects === "all" ? {} : { projectIds: projects.map(String) }) });
    }

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
