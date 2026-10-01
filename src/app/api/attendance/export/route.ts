import { NextRequest } from "next/server";
import { requirePermission } from "@/server/authorization";
import { OrganizationService } from "@/domains/organization/organization-service";
import { AttendanceReportService } from "@/domains/attendance/attendance-report";
import { buildAttendanceCsv, buildAttendanceWorkbook } from "@/domains/attendance/attendance-export";
import { attendanceExportQuerySchema } from "@/shared/validation/attendance";
import { toErrorResponse } from "@/shared/errors/to-response";
import { csvResponse, filenameSlug, xlsxResponse } from "@/app/_shared/file-response";
import { auditExport, enforceRateLimit } from "@/server/security/rate-limit";

/** The daily roster over a date range (up to 31 days), as a plain GET download link. */
export async function GET(request: NextRequest) {
  try {
    const { organizationId, from, to, format } = attendanceExportQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const { userId } = await requirePermission("attendance.read", organizationId);
    await enforceRateLimit("export", userId);

    const [report, organizations] = await Promise.all([
      AttendanceReportService.build(organizationId, from, to),
      OrganizationService.listAccessibleTo(userId),
    ]);
    const organizationName = organizations.find((organization) => organization._id.toString() === organizationId)?.name ?? "Organization";
    const filename = `${filenameSlug(organizationName)}-attendance-${from === to ? from : `${from}-to-${to}`}`;

    await auditExport({ organizationId, userId, action: "attendance.exported", resourceType: "AttendanceRecord", metadata: { from, to, format } });
    if (format === "csv") return csvResponse(buildAttendanceCsv(report), filename);
    return await xlsxResponse(buildAttendanceWorkbook(report, { organizationName }), filename);
  } catch (error) {
    return toErrorResponse(error);
  }
}
