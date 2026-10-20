import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { resolveEvaluators } from "@/domains/performance/evaluator-resolver";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

/** Who may evaluate this employee under the evaluator rules (for the "start an evaluation" form). */
export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({ organizationId: request.nextUrl.searchParams.get("organizationId") });
    await requirePermission("performance-evaluations.create", organizationId);
    const employeeId = objectId().parse(request.nextUrl.searchParams.get("employeeId"));
    return NextResponse.json(await resolveEvaluators(employeeId, organizationId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
