import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { AssetIssuanceService } from "@/domains/assets/asset-issuance-service";
import { createAssetIssuanceSchema } from "@/shared/validation/asset-issuance";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/asset-issuances">) {
  try {
    const { id } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("asset-issuances.read", organizationId);
    const assetIssuances = await AssetIssuanceService.listForEmployee(id, organizationId);
    return NextResponse.json({ assetIssuances });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[id]/asset-issuances">) {
  try {
    const { id } = await ctx.params;
    const input = createAssetIssuanceSchema.parse(await request.json());
    const { userId } = await requirePermission("asset-issuances.create", input.organizationId);
    const assetIssuance = await AssetIssuanceService.create(id, input, { userId });
    return NextResponse.json({ assetIssuance }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
