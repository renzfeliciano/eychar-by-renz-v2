import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { TravelOrderService } from "@/domains/travel-orders/travel-order-service";
import { updateTravelOrderSchema, cancelTravelOrderSchema } from "@/shared/validation/travel-orders";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function PATCH(request: Request, ctx: RouteContext<"/api/travel-orders/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateTravelOrderSchema.parse(await request.json());
    const { userId } = await requirePermission("travel-orders.update", input.organizationId);
    const travelOrder = await TravelOrderService.update(id, input.organizationId, input, { userId });
    return NextResponse.json({ travelOrder });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/travel-orders/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = cancelTravelOrderSchema.parse(await request.json());
    const { userId } = await requirePermission("travel-orders.update", input.organizationId);
    const travelOrder = await TravelOrderService.cancel(id, input.organizationId, { userId });
    return NextResponse.json({ travelOrder });
  } catch (error) {
    return toErrorResponse(error);
  }
}
