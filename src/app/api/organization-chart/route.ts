import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { OrgChartService } from "@/domains/workforce/org-chart-service";
import { orgChartQuerySchema, saveOrgChartSchema } from "@/shared/validation/org-chart";
import { toErrorResponse } from "@/shared/errors/to-response";

/** The org chart canvas (ADR-046): anyone who can read employees sees it. */
export async function GET(request: NextRequest) {
  try {
    const { organizationId } = orgChartQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    await requirePermission("employees.read", organizationId);
    return NextResponse.json({ chart: await OrgChartService.get(organizationId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Saves the whole canvas (cards and links together); only with org-chart.update. Audited. */
export async function PUT(request: NextRequest) {
  try {
    const input = saveOrgChartSchema.parse(await request.json());
    const { userId } = await requirePermission("org-chart.update", input.organizationId);
    const chart = await OrgChartService.save(input, { userId });
    return NextResponse.json({ updatedAt: chart?.updatedAt ?? null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
