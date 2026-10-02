import { NextRequest, NextResponse } from "next/server";
import { includesProject, requireAccessibleProjects, requirePermission } from "@/server/authorization";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { createPayrollRunSchema } from "@/shared/validation/payroll";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";
import { enforceRateLimit } from "@/server/security/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({ organizationId: request.nextUrl.searchParams.get("organizationId") });
    // Organization-wide readers see every run; project-scoped ones only their projects' runs
    // (never an organization-wide run, which covers people outside their projects).
    const { projects } = await requireAccessibleProjects("payroll-runs.read", organizationId);
    const runs = (await PayrollRunService.list(organizationId)).filter((run) => includesProject(projects, run.projectId));
    return NextResponse.json({ runs });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Prepares a draft run for a scope (the organization or one project) and period. */
export async function POST(request: NextRequest) {
  try {
    const input = createPayrollRunSchema.parse(await request.json());
    const { userId } = await requirePermission("payroll-runs.create", input.organizationId);
    await enforceRateLimit("payrollRun", userId);
    const run = await PayrollRunService.prepare(input, { userId });
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
