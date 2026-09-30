import { NextRequest } from "next/server";
import { requirePermission } from "@/server/authorization";
import { OrganizationService } from "@/domains/organization/organization-service";
import { ScheduleService } from "@/domains/attendance/schedule-service";
import { ShiftTemplateService } from "@/domains/attendance/shift-template-service";
import { buildScheduleCsv, buildScheduleWorkbook } from "@/domains/attendance/schedule-export";
import { scheduleExportQuerySchema } from "@/shared/validation/schedule";
import { toErrorResponse } from "@/shared/errors/to-response";
import { csvResponse, filenameSlug, xlsxResponse } from "@/app/_shared/file-response";

/** A plain GET link, so the browser's own download handling does the work — no client-side file building. */
export async function GET(request: NextRequest) {
  try {
    const { organizationId, month, format } = scheduleExportQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const { userId } = await requirePermission("attendance.read", organizationId);

    const [view, organizations, shifts] = await Promise.all([
      ScheduleService.getMonthView(organizationId, month),
      OrganizationService.listAccessibleTo(userId),
      ShiftTemplateService.listCurrent(organizationId),
    ]);
    const organizationName = organizations.find((organization) => organization._id.toString() === organizationId)?.name ?? "Organization";
    const filename = `${filenameSlug(organizationName)}-schedule-${month}`;

    if (format === "csv") return csvResponse(buildScheduleCsv(view), filename);

    // Legend lists every shift used this month plus the active ones, so a
    // since-retired shift that still appears in the grid is still explained.
    const usedCodes = new Set(view.rows.flatMap((row) => Object.values(row.cells).map((cell) => cell.code)));
    const legend = shifts
      .filter((shift) => shift.status === "active" || usedCodes.has(shift.code))
      .map((shift) => ({
        code: shift.code,
        name: shift.name,
        kind: shift.kind as "work" | "rest",
        color: shift.color ?? null,
        pattern: (shift.pattern ?? "fixed") as "fixed" | "flexible",
        startTime: shift.startTime ?? null,
        endTime: shift.endTime ?? null,
        latestStartTime: shift.latestStartTime ?? null,
        requiredHours: shift.requiredHours ?? null,
      }));

    return await xlsxResponse(buildScheduleWorkbook(view, { organizationName, shifts: legend }), filename);
  } catch (error) {
    return toErrorResponse(error);
  }
}
