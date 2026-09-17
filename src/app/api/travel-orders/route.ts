import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { TravelOrderService } from "@/domains/travel-orders/travel-order-service";
import { createTravelOrderSchema } from "@/shared/validation/travel-orders";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("travel-orders.read", organizationId);
    const travelOrders = await TravelOrderService.listCurrent(organizationId);
    return NextResponse.json({ travelOrders });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createTravelOrderSchema.parse(await request.json());
    const { userId } = await requirePermission("travel-orders.create", input.organizationId);
    const travelOrder = await TravelOrderService.create(input, { userId });
    return NextResponse.json({ travelOrder }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
