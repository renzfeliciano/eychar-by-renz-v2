import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { OrgChartService } from "@/domains/workforce/org-chart-service";
import { orgChartQuerySchema } from "@/shared/validation/org-chart";
import { toErrorResponse } from "@/shared/errors/to-response";

// No dedicated permission key: the chart is a read-only projection over
// data already gated by employees.read (AGENTS.md §18) — not a resource
// of its own.
export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = orgChartQuerySchema.parse(params);
    await requirePermission("employees.read", query.organizationId);
    const snapshot = await OrgChartService.getSnapshot(query.organizationId, query);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return toErrorResponse(error);
  }
}
