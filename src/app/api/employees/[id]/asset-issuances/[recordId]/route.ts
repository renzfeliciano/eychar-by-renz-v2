import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { AssetIssuanceService } from "@/domains/assets/asset-issuance-service";
import { updateAssetIssuanceSchema } from "@/shared/validation/asset-issuance";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/employees/[id]/asset-issuances/[recordId]">) {
  try {
    const { recordId } = await ctx.params;
    const input = updateAssetIssuanceSchema.parse(await request.json());
    const { userId } = await requirePermission("asset-issuances.update", input.organizationId);
    const assetIssuance = await AssetIssuanceService.update(recordId, input.organizationId, input, { userId });
    return NextResponse.json({ assetIssuance });
  } catch (error) {
    return toErrorResponse(error);
  }
}
