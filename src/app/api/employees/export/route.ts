import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmployeeRosterService } from "@/domains/workforce/employee-roster-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { employeeExportQuerySchema } from "@/shared/validation/workforce";
import { toErrorResponse } from "@/shared/errors/to-response";
import { auditExport, enforceRateLimit } from "@/server/security/rate-limit";

/**
 * The employee roster with contact details and statutory IDs, for the People
 * page's Export and Print. Fetched only when someone exports or prints, so
 * the IDs aren't sent with every page view, and each request is rate limited
 * and audited like the other exports.
 */
export async function GET(request: NextRequest) {
  try {
    const { organizationId, employmentType } = employeeExportQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const { userId } = await requirePermission("employees.read", organizationId);
    await enforceRateLimit("export", userId);

    const [positions, projects, statuses] = await Promise.all([
      PositionService.listCurrent(organizationId),
      ProjectService.listCurrent(organizationId),
      EmploymentStatusService.listCurrent(organizationId),
    ]);
    const rows = await EmployeeRosterService.exportRows(
      organizationId,
      {
        positionTitleById: new Map(positions.map((position) => [position._id.toString(), position.title])),
        projectNameById: new Map(projects.map((project) => [project._id.toString(), project.name])),
        statusNameByCode: new Map(statuses.map((status) => [status.code, status.name])),
      },
      employmentType,
    );

    await auditExport({ organizationId, userId, action: "employees.exported", resourceType: "Employee", metadata: { employmentType, count: rows.length } });
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
