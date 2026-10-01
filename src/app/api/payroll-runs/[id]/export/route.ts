import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/authorization";
import { OrganizationService } from "@/domains/organization/organization-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { buildRegisterCsv, buildRegisterWorkbook } from "@/domains/payroll/payroll-register-export";
import { PAYROLL_RUN_STATUS_LABELS } from "@/domains/payroll/payroll-labels";
import { dateToDateKey, formatDateKey, formatDateRange } from "@/lib/date-key";
import { toErrorResponse } from "@/shared/errors/to-response";
import { csvResponse, filenameSlug, xlsxResponse } from "@/app/_shared/file-response";
import { auditExport, enforceRateLimit } from "@/server/security/rate-limit";
import { objectId } from "@/shared/validation/object-id";

const querySchema = z.object({ organizationId: objectId(), format: z.enum(["xlsx", "csv"]) });

/** The payroll register (plus contributions for remittance) as a plain GET download. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/payroll-runs/[id]/export">) {
  try {
    const { id } = await ctx.params;
    const { organizationId, format } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const { userId } = await requirePermission("payroll-runs.read", organizationId);
    await enforceRateLimit("export", userId);

    const [detail, organizations, projects] = await Promise.all([
      PayrollRunService.getDetail(id, organizationId),
      OrganizationService.listAccessibleTo(userId),
      ProjectService.listCurrent(organizationId),
    ]);
    const { run, records } = detail;
    const organizationName = organizations.find((organization) => organization._id.toString() === organizationId)?.name ?? "Organization";
    const projectName = run.projectId ? projects.find((project) => project._id.toString() === run.projectId!.toString())?.name : undefined;
    const input = {
      organizationName,
      runNumber: run.runNumber,
      scopeLabel: run.projectId ? (projectName ?? "Project") : "All projects",
      periodLabel: formatDateRange(dateToDateKey(run.payPeriodStart), dateToDateKey(run.payPeriodEnd)),
      payDateLabel: formatDateKey(dateToDateKey(run.payDate)),
      statusLabel: PAYROLL_RUN_STATUS_LABELS[run.status as keyof typeof PAYROLL_RUN_STATUS_LABELS] ?? run.status,
      records,
    };
    const filename = `${filenameSlug(organizationName)}-payroll-register-${run.runNumber.toLowerCase()}`;

    await auditExport({ organizationId, userId, action: "payroll-run.exported", resourceType: "PayrollRun", resourceId: run._id.toString(), metadata: { runNumber: run.runNumber, format } });
    if (format === "csv") return csvResponse(buildRegisterCsv(input), filename);
    return await xlsxResponse(buildRegisterWorkbook(input), filename);
  } catch (error) {
    return toErrorResponse(error);
  }
}
